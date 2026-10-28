# Worker de transcodage — image Cloud Run. node + ffmpeg (avec ffprobe).
FROM node:20-bookworm-slim

# ffmpeg + ffprobe depuis les dépôts Debian ; ca-certificates pour les appels HTTPS (Drive, GCS).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY lib.js server.js ./

# Cloud Run fournit $PORT ; le serveur l'écoute (défaut 8080).
EXPOSE 8080
CMD ["node", "server.js"]
