FROM node:20-bullseye-slim

# Install Chromium and necessary system dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    ca-certificates \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Point Puppeteer to system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=3000 \
    NODE_ENV=production

WORKDIR /app

# Install dependencies first for Docker caching
COPY package*.json ./
RUN npm install --production

# Copy application source
COPY . .

# Run whatsapp-web.js patch script
RUN node patch.mjs

# Expose web dashboard & health check port
EXPOSE 3000

# Start the bot
CMD ["node", "index.mjs"]
