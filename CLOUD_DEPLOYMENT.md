# GKB Technologies — WhatsApp Status Bot Cloud Deployment Guide

This guide explains how to deploy your WhatsApp Status Bot to the cloud so that it runs **24/7/365** without depending on your laptop being on or connected.

---

## Architecture Overview
- **Engine**: Node.js 20 with Chromium and Puppeteer running inside Docker.
- **Session Storage**: The `.wwebjs_auth` directory stores your authenticated WhatsApp session so you don't need to re-scan on restart.
- **Web Dashboard**: An integrated lightweight web server (port `3000`) displays:
  - High-resolution QR code for quick scanning from any phone.
  - Live status indicator (Connected as Kelvin Zumah, next scheduled run, inventory count).
  - One-click **"Post 5 Featured Gadgets Now"** trigger button.
- **Daily Rotation**: Automated cron job runs every morning at **9:00 AM** (`0 9 * * *`).

---

## Option 1: Deploy on Railway (Easiest — Recommended)

Railway offers seamless Docker deployment with a public URL and persistent storage.

### Steps:
1. **Initialize Git & Push to GitHub**:
   In PowerShell inside `gkb-whatsapp-bot`:
   ```powershell
   cd "c:\Users\Administrator\Desktop\j\web dev\sites\ERA axis session 1\gkb-whatsapp-bot"
   git init
   git add .
   git commit -m "feat: 24/7 cloud docker setup with web qr dashboard"
   git branch -M main
   git remote add origin https://github.com/zumah-kelvin/gkb-whatsapp-bot.git
   git push -u origin main
   ```
   *(Create the repository `gkb-whatsapp-bot` on github.com first if it doesn't exist yet).*

2. **Deploy on Railway**:
   - Go to [railway.app](https://railway.app/) and sign in with GitHub.
   - Click **+ New Project** &rarr; **Deploy from GitHub repo** &rarr; Select `gkb-whatsapp-bot`.
   - Railway will automatically detect the `Dockerfile` and start building.

3. **Add Persistent Volume (Essential for WhatsApp Session)**:
   - In your Railway project, click on the **gkb-whatsapp-bot** service.
   - Go to the **Volumes** tab &rarr; Click **+ Add Volume**.
   - Set the Mount Path to:
     ```
     /app/.wwebjs_auth
     ```
   - Click **Save**. This ensures your WhatsApp login session never gets lost during deploys.

4. **Generate Public Domain**:
   - In Railway, go to **Settings** &rarr; **Networking** &rarr; Click **Generate Domain**.
   - Railway will provide a link like `https://gkb-whatsapp-bot-production.up.railway.app`.

5. **Link WhatsApp**:
   - Open that URL in your phone or browser.
   - You will see the crisp QR code.
   - Open WhatsApp on your phone &rarr; **Settings / Linked Devices** &rarr; **Link a Device** &rarr; Scan the code.
   - The page will instantly change to **● Connected**, showing your phone number and schedule!

---

## Option 2: Deploy on any Linux VPS (DigitalOcean / Linode / Oracle Cloud / Hetzner)

If you have a Linux virtual private server (Ubuntu/Debian):

1. **Clone repository onto the server**:
   ```bash
   git clone https://github.com/zumah-kelvin/gkb-whatsapp-bot.git
   cd gkb-whatsapp-bot
   ```

2. **Start with Docker Compose**:
   ```bash
   docker compose up -d --build
   ```

3. **Access Dashboard**:
   - Open `http://YOUR_SERVER_IP:3000` in your browser.
   - Scan the QR code with WhatsApp.
   - Docker will automatically keep the bot running and restart it if the server reboots.

---

## Testing Locally Before Cloud Push

To test the new web dashboard locally on your laptop:
```powershell
cd "c:\Users\Administrator\Desktop\j\web dev\sites\ERA axis session 1\gkb-whatsapp-bot"
npm start
```
Then open [http://localhost:3000](http://localhost:3000) in your browser!
