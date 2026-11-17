# GKB Technologies — Automated WhatsApp Status Poster

Autonomous bot that automatically selects 5 gadgets daily from your inventory and posts them directly onto your WhatsApp Status with pricing, specs, and order links.

## How It Works
1. **One-Time Login**: You scan a QR code in your terminal with WhatsApp on your phone (`Settings -> Linked Devices -> Link a Device`).
2. **Persistent Session**: Your login is saved in `.wwebjs_auth/`. You only have to scan the QR code once.
3. **Daily Rotation**: Every day at **9:00 AM**, the bot queries 5 active gadgets from your Supabase database and posts them to your WhatsApp status (`status@broadcast`) with a 15-second natural delay between each post.
4. **On-Demand Posting**: You can also trigger an immediate post whenever you want using `npm run post-now`.

## Quick Start

1. Open PowerShell and go to the bot directory:
   ```powershell
   cd "c:\Users\Administrator\Desktop\j\web dev\sites\ERA axis session 1\gkb-whatsapp-bot"
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Start the bot:
   ```powershell
   npm start
   ```

4. Scan the QR code shown in your terminal with WhatsApp on your phone (`Settings -> Linked Devices -> Link a Device`).

5. **To post 5 items immediately right now**:
   ```powershell
   npm run post-now
   ```

## Configuration (`.env`)
- `POSTING_CRON_SCHEDULE`: When to post daily (default: `0 9 * * *` for 9:00 AM every day).
- `POST_COUNT_PER_DAY`: Number of devices to post daily (default: `5`).
- `SHOP_URL`: Link to your shopping portal (e.g. `https://gkb-shop.netlify.app/`).
- `CONTACT_PHONE`: Your MoMo and call line (`0552117787`).
- `CEO_NAME`: `Zumah Kelvin`.
