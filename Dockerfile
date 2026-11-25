FROM node:22-bookworm-slim

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
    NODE_ENV=production \
    NODE_OPTIONS="--expose-gc --max-old-space-size=120"

WORKDIR /app

# Install dependencies without running postinstall until source is copied
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy application source (including patch.mjs)
COPY . .

# Run whatsapp-web.js patch script
RUN node patch.mjs

# Expose web dashboard & health check port
EXPOSE 3000

# Start the bot with low-memory constraints
CMD ["node", "--expose-gc", "--max-old-space-size=120", "index.mjs"]
