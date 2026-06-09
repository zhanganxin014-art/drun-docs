FROM node:20-slim

# 安装FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制后端
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --production

# 复制后端代码
COPY backend/ ./

# 构建前端
COPY frontend/ /tmp/frontend/
RUN cd /tmp/frontend && npm ci && npm run build

# 复制前端构建产物到后端静态目录
RUN cp -r /tmp/frontend/dist/* ./public/ 2>/dev/null || true

EXPOSE 5679

CMD ["node", "src/app.js"]
