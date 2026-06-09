# 🎬 AI短剧制作平台

> 一站式AI驱动的网页版短剧制作平台 —— 从剧本创作到视频成片，全流程自动化

## ✨ 功能特性

| 模块 | 功能 | 说明 |
|------|------|------|
| 📋 **项目管理** | 项目创建/管理、状态追踪 | 草稿→编剧→分镜→生成→完成 |
| ✍️ **AI剧本生成** | LLM一键生成结构化剧本 | 支持一句话创意/小说原文改编 |
| 🎭 **角色管理** | AI自动提取+形象生成 | 角色一致性控制、多表情变体 |
| 🎬 **分镜系统** | AI自动拆解分镜 | 全景/中景/近景/特写镜头规划 |
| 🖼️ **素材生成** | 场景图/角色图/分镜图 | 批量AI图片生成 |
| 🎥 **视频合成** | 图生视频+TTS配音 | FFmpeg多段拼接导出MP4 |
| ⚙️ **API对接** | 聚合API Key配置 | OpenAI兼容格式，支持任意聚合网关 |

## 技术栈

```
前端: Vue3 + Vite + Pinia + Element Plus (暗色科技蓝主题)
后端: Node.js + Express + better-sqlite3 (SQLite)
AI层: OpenAI SDK (兼容) → 你的聚合API Key
媒体: FFmpeg (视频合成) + Sharp (图片处理)
部署: Docker / 本地开发模式
```

## 快速开始

### 方式一：本地开发（推荐）

```bash
# 1. 克隆或进入项目目录
cd short-drama-platform

# 2. 安装后端依赖
cd backend && npm install

# 3. 配置API（编辑 backend/.env）
# 填写你的聚合 API Base URL 和 API Key
cp backend/.env.example backend/.env
vim backend/.env

# 4. 启动后端 (终端1)
npm run dev
# 后端运行在 http://localhost:5679

# 5. 安装前端依赖并启动 (终端2)
cd ../frontend && npm install && npm run dev
# 前端运行在 http://localhost:5173
```

### 方式二：Docker部署

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env 填入你的API配置

# 2. 一键启动
docker compose up -d --build

# 3. 访问
open http://localhost:5679
```

### 方式三：生产部署（PM2 + Nginx）

```bash
# 1. 构建前端
cd frontend && npm run build

# 2. 使用PM2启动后端
cd ../backend
pm2 start src/app.js --name drama-api

# 3. Nginx反向代理
# 配置见下方 Nginx 配置示例
```

## API配置说明

平台使用**OpenAI兼容格式**的聚合API，支持以下功能：

| 能力 | API调用方式 | 说明 |
|------|------------|------|
| 生剧本 | `chat/completions` (JSON mode) | LLM生成结构化JSON剧本 |
| 生场景图 | `images/generations` | 文生图，16:9横版 |
| 生人物资产 | `images/generations` | 角色立绘，保持一致性 |
| 生视频 | 视频模型接口 | 图生视频（需API支持） |
| TTS配音 | `/audio/speech` | 文字转语音 |

### 推荐的聚合API服务

- [OpenAI](https://platform.openai.com) — 官方API，全功能支持
- [OneAPI](https://github.com/songquanpeng/one-api) — 开源聚合管理面板
- [NewAPI](https://github.com/Calcium-Ion/new-api) — 另一个优秀聚合方案
- 自建中转网关 — 只需兼容OpenAI格式即可

## 项目结构

```
short-drama-platform/
├── backend/                 # Node.js 后端
│   ├── src/
│   │   ├── app.js          # Express入口
│   │   ├── config.js       # 配置管理
│   │   ├── db/             # SQLite数据库
│   │   ├── routes/         # API路由 (7个模块)
│   │   ├── services/       # 核心业务逻辑 (6个服务)
│   │   ├── middleware/     # 中间件
│   │   └── utils/          # 工具函数
│   ├── data/               # 数据存储
│   └── package.json
├── frontend/                # Vue3 前端
│   ├── src/
│   │   ├── views/          # 页面组件 (8个页面)
│   │   ├── components/     # 公共组件
│   │   ├── stores/         # Pinia状态管理
│   │   ├── api/            # API请求封装
│   │   └── styles/         # 暗色主题CSS
│   └── package.json
├── docker-compose.yml       # Docker编排
├── Dockerfile               # Docker镜像
└── README.md
```

## 使用流程

```
1️⃣ 创建项目     → 输入项目名称和描述
2️⃣ 输入创意     → 粘贴小说文本/一句话创意
3️⃣ AI生成剧本   → 点击"✨ AI生成剧本"，等待LLM输出结构化JSON
4️⃣ 提取角色     → 点击"🎭 AI从剧本提取角色"
5️⃣ 生成形象     → 为每个角色点击"🎨 生成形象"
6️⃣ 拆解分镜     → 点击"🎬 AI自动拆解分镜"
7️⃣ 批量生图     → 点击"🖼 批量生图"
8️⃣ 合成导出     → 在"视频合成"页选择分镜→开始合成→下载MP4
```

## Nginx 配置参考

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 100m;  # 支持大文件上传
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|mp4|mp3)$ {
        proxy_pass http://127.0.0.1:5679;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

## License

MIT License — 自由使用、修改、分发

---

**Made with ❤️ by AI Short Drama Platform**
