# Backend API + Gateway
FROM node:20-slim

# Install libs required by oracledb (optional; safe for MySQL-only setups)
RUN apt-get update \
  && apt-get install -y --no-install-recommends libaio1 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install dependencies (skip native build scripts; we run MySQL-only by default)
COPY backend/package*.json ./
RUN npm install --production --ignore-scripts

# Copy source
COPY backend .

# Where runtime state/config files will be persisted (mount a volume here)
ENV DATA_DIR=/data
RUN mkdir -p ${DATA_DIR}

EXPOSE 3001
CMD ["node", "server.js"]
