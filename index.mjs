import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import cron from 'node-cron';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ditnksmvcacnzdguqcgz.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_33KQl1SmvaBaqNzxWJiyzw_HuLMgWAl';
const CRON_SCHEDULE = process.env.POSTING_CRON_SCHEDULE || '0 9 * * *';
const POST_COUNT = parseInt(process.env.POST_COUNT_PER_DAY || '5', 10);
const CONTACT_PHONE = process.env.CONTACT_PHONE || '0552117787';
const CEO_NAME = process.env.CEO_NAME || 'Zumah Kelvin';
const SHOP_URL = process.env.SHOP_URL || 'https://gkb-shoping.netlify.app/';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Bot Runtime State
let botStatus = 'initializing'; // 'initializing' | 'waiting_for_qr' | 'ready' | 'posting' | 'disconnected'
let currentQrRaw = '';
let currentQrDataUrl = '';
let lastPostTime = null;
let lastPostedItems = [];
let lastPostLogs = [];
let isPostingInProgress = false;

const FALLBACK_INVENTORY = [
  {
    brand: 'HP',
    title: 'EliteBook 840 G8 Workstation',
    ram: '16GB',
    storage: '512GB SSD',
    price: 4500,
    highlights: 'Intel Core i7 11th Gen, FHD IPS anti-glare screen, backlit keyboard, pristine UK used condition.'
  },
  {
    brand: 'Dell',
    title: 'Latitude 7420 Ultrabook',
    ram: '16GB',
    storage: '512GB NVMe SSD',
    price: 4800,
    highlights: 'Carbon fiber chassis, Thunderbolt 4, Intel Iris Xe graphics, 10-hour battery life.'
  },
  {
    brand: 'Lenovo',
    title: 'ThinkPad T14 Gen 2 Business Edition',
    ram: '16GB',
    storage: '512GB SSD',
    price: 4600,
    highlights: 'Military-grade rugged durability, TrackPoint, crystal clear Dolby Audio, fast USB-C charge.'
  },
  {
    brand: 'Apple',
    title: 'MacBook Air M1 Retina',
    ram: '8GB',
    storage: '256GB SSD',
    price: 6200,
    highlights: 'Apple Silicon M1 chip, 18-hour battery life, True Tone Retina display, silent fanless thermal design.'
  },
  {
    brand: 'HP',
    title: 'ProBook 450 G8 15.6-inch Laptop',
    ram: '16GB',
    storage: '512GB SSD',
    price: 4100,
    highlights: 'Full numeric keypad, ideal for engineering students, business accounting, and software development.'
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addLog(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  lastPostLogs.unshift(line);
  if (lastPostLogs.length > 50) lastPostLogs.pop();
}

async function fetchFeaturedDevices(count = 5) {
  try {
    const { data, error } = await supabase
      .from('gkb_inventory_items')
      .select('*')
      .eq('active', true);

    if (error) throw error;

    let items = (data && data.length > 0) ? data : FALLBACK_INVENTORY;
    
    // Group by category to ensure balanced representation on WhatsApp status (phones, laptops, gadgets)
    const laptops = items.filter(i => {
      const cat = (i.category || '').toLowerCase();
      return cat === 'laptops' || (!cat && (i.ram || i.storage));
    });
    const phones = items.filter(i => {
      const cat = (i.category || '').toLowerCase();
      const t = (i.title || '').toLowerCase();
      return cat === 'phones' || t.includes('iphone') || t.includes('galaxy') || t.includes('camon') || t.includes('pro max');
    });
    const gadgets = items.filter(i => {
      const cat = (i.category || '').toLowerCase();
      return cat === 'gadgets' || (!laptops.includes(i) && !phones.includes(i));
    });

    const shuffle = arr => [...arr].sort(() => 0.5 - Math.random());
    const sPhones = shuffle(phones);
    const sLaptops = shuffle(laptops);
    const sGadgets = shuffle(gadgets);

    const interleaved = [];
    const max = Math.max(sPhones.length, sLaptops.length, sGadgets.length, 3);
    for (let i = 0; i < max; i++) {
      if (sPhones[i]) interleaved.push(sPhones[i]);
      if (sLaptops[i]) interleaved.push(sLaptops[i]);
      if (sGadgets[i]) interleaved.push(sGadgets[i]);
    }

    const unique = [];
    const seen = new Set();
    for (const item of (interleaved.length > 0 ? interleaved : shuffle(items))) {
      if (!seen.has(item.id || item.title)) {
        seen.add(item.id || item.title);
        unique.push(item);
      }
      if (unique.length >= count) break;
    }

    return unique.length > 0 ? unique : shuffle(items).slice(0, count);
  } catch (err) {
    addLog(`Could not query Supabase, using fallback inventory: ${err.message}`);
    const shuffled = [...FALLBACK_INVENTORY].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
}

function formatStatusCaption(device, index, total) {
  const brand = device.brand || 'GKB';
  const title = device.title || 'Tech Gadget';
  const category = (device.category || '').toLowerCase();
  const isPhone = category.includes('phone') || title.toLowerCase().includes('iphone') || title.toLowerCase().includes('galaxy') || title.toLowerCase().includes('pro max');
  const isGadget = category.includes('gadget') || (!isPhone && (title.toLowerCase().includes('drive') || title.toLowerCase().includes('stand') || title.toLowerCase().includes('mouse') || title.toLowerCase().includes('cable')));
  
  const icon = isPhone ? '📱' : isGadget ? '⚡' : '💻';
  const categoryLabel = isPhone ? 'SMARTPHONE' : isGadget ? 'ELECTRONIC GADGET' : 'LAPTOP';

  const ramPart = (!isPhone && device.ram && device.ram !== 'N/A') ? `${device.ram} RAM · ` : '';
  const storagePart = (device.storage && device.storage !== 'None' && device.storage !== 'N/A') ? device.storage : '';
  const specs = `${ramPart}${storagePart}`.trim();

  const price = device.price ? Number(device.price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : 'Negotiable';
  
  // Clean internal metadata brackets from highlights
  const cleanHighlights = (device.highlights || '')
    .replace(/\[Category:[^\]]*\]/gi, '')
    .replace(/\[Type:[^\]]*\]/gi, '')
    .replace(/\[Vendor:[^\]]*\]/gi, '')
    .replace(/\[Phone:[^\]]*\]/gi, '')
    .replace(/\[Spec\s*RAM:[^\]]*\]/gi, '')
    .replace(/\[Spec\s*Storage:[^\]]*\]/gi, '')
    .trim();

  const lines = [
    `🔥 GKB FEATURED ${categoryLabel} (${index}/${total}) 🔥`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    `${icon} ${brand} ${title}`,
  ];

  if (specs) {
    lines.push(`⚡ Specs: ${specs}`);
  }
  lines.push(`💰 Price: GHS ${price}`);

  if (cleanHighlights) {
    lines.push(`✨ ${cleanHighlights.slice(0, 180)}`);
  }

  lines.push('');
  lines.push(`🛒 Order online: ${SHOP_URL}`);
  lines.push(`📞 Call / WhatsApp: ${CONTACT_PHONE} (${CEO_NAME})`);
  lines.push('⚡ GKB Technologies • Nationwide Ghana Delivery');

  return lines.join('\n');
}

function getBrowserExecutablePath() {
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const browserPath = getBrowserExecutablePath();
addLog(`Browser executable: ${browserPath || 'Bundled Chromium'}`);

const isWindows = process.platform === 'win32';
const puppeteerArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--single-process',
  '--no-zygote',
  '--no-first-run',
  '--renderer-process-limit=1',
  '--js-flags=--max-old-space-size=128',
  '--moderate-memory-pressure-hints',
  '--disable-site-isolation-trials',
  '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
  '--disable-accelerated-2d-canvas',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--mute-audio',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--force-color-profile=srgb',
  '--metrics-recording-only',
  '--safebrowsing-disable-auto-update',
  '--password-store=basic',
  '--use-mock-keychain',
];
if (!isWindows) {
  puppeteerArgs.push('--no-zygote');
}

// Periodic garbage collection to maintain low RAM footprint
setInterval(() => {
  if (global.gc) {
    try { global.gc(); } catch {}
  }
}, 30000);

// Initialize WhatsApp Web Client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.AUTH_DATA_PATH || './.wwebjs_auth'
  }),
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  puppeteer: {
    headless: true,
    ...(browserPath ? { executablePath: browserPath } : {}),
    args: puppeteerArgs
  }
});

client.on('qr', async qr => {
  botStatus = 'waiting_for_qr';
  currentQrRaw = qr;
  try {
    currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 4 });
  } catch (err) {
    console.error('Failed to generate QR data URL:', err);
  }

  addLog('📲 NEW WHATSAPP QR CODE GENERATED:');
  console.log('1. Open WhatsApp on your phone');
  console.log('2. Tap Settings / Linked Devices -> Link a Device');
  console.log(`3. Or open web dashboard at: http://localhost:${PORT} to scan\n`);
  qrcodeTerminal.generate(qr, { small: true });
});

client.on('authenticated', () => {
  botStatus = 'ready';
  currentQrRaw = '';
  currentQrDataUrl = '';
  addLog('✅ WhatsApp session authenticated successfully!');
});

client.on('auth_failure', msg => {
  botStatus = 'disconnected';
  addLog(`❌ WhatsApp authentication failed: ${msg}`);
});

client.on('disconnected', async reason => {
  botStatus = 'disconnected';
  addLog(`⚠️ WhatsApp disconnected (${reason}). Scheduling reconnect...`);
  try {
    await client.destroy();
  } catch {}
  setTimeout(() => {
    addLog('🔄 Attempting WhatsApp re-initialization...');
    client.initialize();
  }, 5000);
});

async function runDailyPosting() {
  if (isPostingInProgress) {
    addLog('Posting sequence is already running. Skipping concurrent request.');
    return;
  }

  isPostingInProgress = true;
  botStatus = 'posting';
  addLog('🚀 Triggering WhatsApp Status posting sequence...');

  try {
    const devices = await fetchFeaturedDevices(POST_COUNT);
    addLog(`Selected ${devices.length} devices to post to WhatsApp Status.`);
    lastPostedItems = [];

    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      const caption = formatStatusCaption(device, i + 1, devices.length);
      addLog(`[${i + 1}/${devices.length}] Posting: ${device.brand} ${device.title}...`);

      let posted = false;
      let imageUrl = null;
      if (device.image_path) {
        if (device.image_path.startsWith('http://') || device.image_path.startsWith('https://')) {
          imageUrl = device.image_path;
        } else {
          try {
            const { data } = supabase.storage.from('gkb-device-images').getPublicUrl(device.image_path);
            imageUrl = data?.publicUrl || null;
          } catch (storageErr) {
            addLog(`Storage URL resolution error: ${storageErr.message}`);
          }
        }
      }

      if (imageUrl) {
        try {
          const media = await MessageMedia.fromUrl(imageUrl);
          await client.sendMessage('status@broadcast', media, { caption });
          posted = true;
          addLog(`✅ [${i + 1}/${devices.length}] Posted photo + caption status!`);
        } catch (mediaErr) {
          addLog(`Media download failed (${mediaErr.message}), falling back to text.`);
        }
      }

      if (!posted) {
        await client.sendMessage('status@broadcast', caption, {
          backgroundColor: '#0a0f1d',
          font: 1
        });
        addLog(`✅ [${i + 1}/${devices.length}] Posted formatted text status!`);
      }

      lastPostedItems.push({
        title: device.title,
        price: device.price,
        postedAt: new Date().toISOString()
      });

      if (i < devices.length - 1) {
        addLog('Waiting 15 seconds before next post to prevent spam limits...');
        await sleep(15000);
      }
    }

    lastPostTime = new Date().toISOString();
    addLog('🎉 Daily WhatsApp Status sequence completed successfully!');
  } catch (err) {
    addLog(`❌ Error during posting sequence: ${err.message}`);
  } finally {
    isPostingInProgress = false;
    botStatus = 'ready';
  }
}

client.on('ready', async () => {
  botStatus = 'ready';
  const pushname = client.info?.pushname || 'Connected';
  const phone = client.info?.wid?.user || 'Unknown';
  addLog(`🚀 WhatsApp Bot is READY and active! Connected as: ${pushname} (${phone})`);

  // Browser shim for WAWebStatusGatingUtils
  try {
    if (client.pupPage) {
      await client.pupPage.evaluate(() => {
        try {
          if (window.require) {
            const gatingUtils = window.require('WAWebStatusGatingUtils');
            if (gatingUtils && typeof gatingUtils.canCheckStatusRankingPosterGating !== 'function') {
              gatingUtils.canCheckStatusRankingPosterGating = () => false;
            }
          }
        } catch (e) {}
      });
    }
  } catch {}

  // If run with --now argument, execute immediately
  if (process.argv.includes('--now')) {
    addLog('--now argument detected: Executing immediate posting run...');
    await runDailyPosting();
  }

  // Schedule daily cron
  addLog(`Scheduling daily cron: "${CRON_SCHEDULE}" (9:00 AM every morning)`);
  cron.schedule(CRON_SCHEDULE, () => {
    void runDailyPosting();
  });
});

// ================= CLOUD HTTP WEB DASHBOARD & HEALTH CHECKS =================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint for cloud hosts (Railway, Render, Fly.io, etc.)
  if (url.pathname === '/healthz' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', botStatus, lastPostTime }));
    return;
  }

  // QR Code JSON API
  if (url.pathname === '/api/qr') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: botStatus,
      qrDataUrl: currentQrDataUrl,
      rawQr: currentQrRaw
    }));
    return;
  }

  // JSON Status API
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: botStatus,
      isPosting: isPostingInProgress,
      connectedUser: client.info ? { name: client.info.pushname, phone: client.info.wid?.user } : null,
      cronSchedule: CRON_SCHEDULE,
      lastPostTime,
      lastPostedItems,
      memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      recentLogs: lastPostLogs.slice(0, 20)
    }));
    return;
  }

  // Trigger Post Now API
  if (url.pathname === '/api/post-now' && req.method === 'POST') {
    if (botStatus !== 'ready') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Bot is not ready (current state: ${botStatus})` }));
      return;
    }
    void runDailyPosting();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Status posting initiated.' }));
    return;
  }

  // Phone Number Pairing Code API
  if (url.pathname === '/api/pairing-code' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { phone } = JSON.parse(body || '{}');
        let cleanPhone = (phone || '').replace(/\D/g, '');
        if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
          cleanPhone = '233' + cleanPhone.substring(1);
        } else if (cleanPhone.startsWith('2330') && cleanPhone.length === 13) {
          cleanPhone = '233' + cleanPhone.substring(4);
        }
        if (!cleanPhone || cleanPhone.length < 9) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Valid phone number with country code required (e.g. 233552117787)' }));
          return;
        }
        addLog(`📲 Requesting pairing code for phone: ${cleanPhone}...`);
        const code = await client.requestPairingCode(cleanPhone);
        addLog(`✅ WhatsApp pairing code generated: ${code}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, code }));
      } catch (err) {
        addLog(`❌ Failed to get pairing code: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Failed to request pairing code' }));
      }
    });
    return;
  }

  // Cancel Pairing Code / Switch back to QR
  if (url.pathname === '/api/cancel-pairing') {
    try {
      if (client && typeof client.cancelPairingCode === 'function') {
        await client.cancelPairingCode();
        addLog('🔄 Pairing code mode cancelled. Switched back to QR mode.');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Diagnostic Screenshot API (to visually inspect WhatsApp Web page)
  if (url.pathname === '/api/screenshot') {
    try {
      if (client && client.pupPage) {
        const screenshot = await client.pupPage.screenshot({ type: 'png' });
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(screenshot);
        return;
      }
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Browser page not available yet');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Screenshot error: ' + err.message);
    }
    return;
  }

  // Reset Session API (re-initializes WhatsApp cleanly)
  if (url.pathname === '/api/restart-client') {
    try {
      addLog('🔄 Restarting WhatsApp client...');
      await client.destroy().catch(() => {});
      botStatus = 'disconnected';
      setTimeout(() => {
        client.initialize().catch(err => addLog(`❌ Init error: ${err.message}`));
      }, 1500);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Restarting WhatsApp client' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Web Dashboard UI
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GKB WhatsApp Status Bot — Cloud Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #060b14;
      color: #e2e8f0;
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 680px;
      width: 100%;
      background: #0d1526;
      border: 1px solid #1e293b;
      border-radius: 24px;
      padding: 2rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .title { font-size: 1.25rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px; }
    .badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge-blue { background: rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.4); }
    .qr-box {
      background: #ffffff;
      padding: 1.25rem;
      border-radius: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 1.5rem auto;
      width: fit-content;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .qr-box img { max-width: 260px; height: auto; display: block; }
    .btn {
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      color: #040812;
      font-weight: 800;
      font-size: 0.875rem;
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
      margin-top: 1rem;
    }
    .btn:hover { opacity: 0.95; transform: translateY(-1px); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .card {
      background: #111c33;
      border: 1px solid #1e2e4f;
      border-radius: 16px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
    }
    .metric { display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 0.5rem; }
    .metric:last-child { margin-bottom: 0; }
    .metric-label { color: #94a3b8; }
    .metric-value { font-weight: 600; color: #f8fafc; font-family: 'JetBrains Mono', monospace; font-size: 0.825rem; }
    .log-box {
      background: #070c17;
      border: 1px solid #1a253c;
      border-radius: 14px;
      padding: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #94a3b8;
      max-height: 180px;
      overflow-y: auto;
      margin-top: 1rem;
      line-height: 1.6;
    }
    .instructions {
      font-size: 0.875rem;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 1rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">
        <span>🤖</span>
        <span>GKB WhatsApp Bot</span>
      </div>
      <div>
        ${
          botStatus === 'ready'
            ? '<span class="badge badge-green">● Connected</span>'
            : botStatus === 'waiting_for_qr'
            ? '<span class="badge badge-amber">● Scan QR Required</span>'
            : botStatus === 'posting'
            ? '<span class="badge badge-blue">● Posting Deals…</span>'
            : '<span class="badge badge-amber">● Initializing…</span>'
        }
      </div>
    </div>

    ${
      botStatus === 'waiting_for_qr'
        ? `
        <p class="instructions">
          Open WhatsApp on your phone &rarr; <strong>Settings / Linked Devices</strong> &rarr; tap <strong>Link a Device</strong> and scan this code:
        </p>
        <div class="qr-box">
          ${currentQrDataUrl ? `<img src="${currentQrDataUrl}" alt="WhatsApp QR Code">` : '<p style="color:#000;font-weight:600;">Generating QR code…</p>'}
        </div>
        <p style="text-align:center;font-size:0.75rem;color:#64748b;margin-bottom:1.25rem;">QR code refreshes automatically.</p>

        <div style="background:#070c17;border:1px solid #1a253c;border-radius:16px;padding:1.25rem;text-align:center;margin-bottom:1rem;">
          <p style="font-size:0.875rem;font-weight:700;color:#f8fafc;margin-bottom:0.35rem;">Or Link with Phone Number (No Camera Needed)</p>
          <p style="font-size:0.75rem;color:#94a3b8;margin-bottom:0.75rem;">Tap <em>"Link with phone number instead"</em> on WhatsApp and enter this 8-character code:</p>
          <div style="display:flex;gap:8px;max-width:340px;margin:0 auto;">
            <input id="phoneInput" type="tel" value="233552117787" placeholder="e.g. 233552117787" style="flex:1;padding:0.6rem 0.8rem;background:#0d1526;border:1px solid #1e293b;border-radius:10px;color:#fff;font-family:monospace;font-size:0.85rem;" />
            <button id="getCodeBtn" class="btn" style="width:auto;margin:0;padding:0.6rem 1rem;font-size:0.8rem;" onclick="requestPhoneCode()">Get Code</button>
          </div>
          <div id="codeDisplay" style="display:none;margin-top:0.75rem;padding:0.6rem;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:10px;font-family:monospace;font-size:1.35rem;font-weight:800;color:#34d399;letter-spacing:0.25em;"></div>
        </div>
        <script>setTimeout(() => { if (!window.hasRequestedCode) window.location.reload(); }, 6000);</script>
      `
        : `
        <div class="card">
          <div class="metric">
            <span class="metric-label">Account</span>
            <span class="metric-value">${client.info?.pushname || 'Admin'} (${client.info?.wid?.user || 'Connected'})</span>
          </div>
          <div class="metric">
            <span class="metric-label">Daily Schedule</span>
            <span class="metric-value">9:00 AM (CRON: ${CRON_SCHEDULE})</span>
          </div>
          <div class="metric">
            <span class="metric-label">Deals Per Day</span>
            <span class="metric-value">${POST_COUNT} Gadgets</span>
          </div>
          <div class="metric">
            <span class="metric-label">Storefront</span>
            <span class="metric-value"><a href="${SHOP_URL}" target="_blank" style="color:#22d3ee;text-decoration:none;">${SHOP_URL}</a></span>
          </div>
          <div class="metric">
            <span class="metric-label">Last Status Run</span>
            <span class="metric-value">${lastPostTime ? new Date(lastPostTime).toLocaleString() : 'Not yet run'}</span>
          </div>
        </div>

        <button class="btn" id="postBtn" onclick="triggerPost()">
          🚀 Post 5 Featured Gadgets Now
        </button>
      `
    }

    <div class="log-box" id="logs">
      ${lastPostLogs.map(l => `<div>${l}</div>`).join('')}
    </div>
  </div>

  <script>
    async function requestPhoneCode() {
      const phoneInput = document.getElementById('phoneInput');
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const btn = document.getElementById('getCodeBtn');
      const display = document.getElementById('codeDisplay');
      if (!phone) { alert('Please enter phone number'); return; }
      window.hasRequestedCode = true;
      if (btn) { btn.disabled = true; btn.innerText = 'Getting…'; }
      if (display) display.style.display = 'none';
      try {
        const res = await fetch('/api/pairing-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.code && display) {
          display.style.display = 'block';
          display.innerText = data.code;
        } else {
          alert(data.error || 'Failed to generate pairing code.');
        }
      } catch(e) {
        alert('Error: ' + e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Get Code'; }
      }
    }

    async function triggerPost() {
      const btn = document.getElementById('postBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Posting in progress…';
      }
      try {
        const res = await fetch('/api/post-now', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Status posting started!');
        setTimeout(() => window.location.reload(), 2000);
      } catch (e) {
        alert('Failed: ' + e.message);
        if (btn) {
          btn.disabled = false;
          btn.innerText = '🚀 Post 5 Featured Gadgets Now';
        }
      }
    }
  </script>
</body>
</html>`;

  res.end(html);
});

server.listen(PORT, '0.0.0.0', () => {
  addLog(`🌐 Cloud Web Dashboard & Health server listening on http://0.0.0.0:${PORT}`);
});

// Start client initialization
addLog('Initializing WhatsApp Web Client...');
client.initialize();
