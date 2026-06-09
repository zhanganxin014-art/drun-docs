<template>
  <div class="asset-library">
    <!-- 工具栏 -->
    <div class="panel-toolbar">
      <el-radio-group v-model="filterType" size="default" @change="loadAssets">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="character">👤 角色</el-radio-button>
        <el-radio-button value="scene">🏠 场景</el-radio-button>
        <el-radio-button value="storyboard">🎬 分镜</el-radio-button>
        <el-radio-button value="video">🎥 视频</el-radio-button>
        <el-radio-button value="audio">🔊 音频</el-radio-button>
      </el-radio-group>

      <!-- 上传按钮 -->
      <el-upload
        action="/api/assets/upload"
        :data="{ project_id: projectId }"
        :show-file-list="false"
        :on-success="handleUploadSuccess"
        accept="image/*,video/*,audio/*,.txt,.pdf"
        style="margin-left: auto;"
      >
        <el-button :icon="Upload" type="primary">上传素材</el-button>
      </el-upload>

      <span class="toolbar-info" v-if="assets.length > 0">{{ assets.length }}个文件</span>
    </div>

    <!-- 素材网格 -->
    <div v-loading="loading" class="asset-grid">
      <el-empty v-if="!loading && assets.length === 0" description="暂无素材" />

      <div
        v-for="asset in assets"
        :key="asset.id"
        class="asset-card card-glow"
      >
        <div class="asset-preview" :class="'type-' + asset.type">
          <!-- 图片预览 -->
          <img v-if="isImage(asset)" :src="getAssetUrl(asset.file_path)" alt="" @click="previewAsset(asset)" />
          <!-- 视频预览 -->
          <video v-else-if="asset.type === 'video'" :src="getAssetUrl(asset.file_path)" muted preload="metadata" />
          <!-- 音频占位 -->
          <div v-else-if="asset.type === 'audio'" class="audio-placeholder">
            <el-icon><Headset /></el-icon>
            <span>音频文件</span>
          </div>
          <!-- 其他类型 -->
          <div v-else class="file-placeholder">
            <el-icon><Document /></el-icon>
          </div>
          
          <!-- 类型标签 -->
          <el-tag size="small" :type="tagTypeMap[asset.type] || 'info'" class="type-tag">
            {{ typeNameMap[asset.type] || asset.type }}
          </el-tag>
        </div>

        <div class="asset-info">
          <p class="asset-name" :title="asset.name">{{ asset.name }}</p>
          <div class="asset-meta">
            <span>{{ formatTime(asset.created_at) }}</span>
            <span :class="sourceClass(asset.source)">{{ sourceName(asset.source) }}</span>
          </div>
        </div>

        <div class="asset-actions">
          <el-button size="small" text type="primary" @click="downloadAsset(asset)">下载</el-button>
          <el-button size="small" text type="danger" @click="handleDelete(asset)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 图片预览对话框 -->
    <el-dialog v-model="showPreview" width="70%" title="素材预览">
      <div class="preview-container">
        <img v-if="previewingAsset?.file_path" :src="getAssetUrl(previewingAsset.file_path)" 
             style="max-width: 100%; max-height: 70vh; object-fit: contain;" />
        <p v-if="previewingAsset?.name" class="preview-name">{{ previewingAsset.name }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Upload, Document, Headset } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const projectId = computed(() => route.params.id)

const assets = ref([])
const loading = ref(false)
const filterType = ref('')
const showPreview = ref(false)
const previewingAsset = ref(null)

const typeNameMap = { character: '角色形象', scene: '场景图', storyboard: '分镜图', video: '视频片段', audio: '音频', cover: '封面' }
const tagTypeMap = { character: '', scene: 'success', storyboard: 'warning', video: 'danger', audio: 'info' }

onMounted(loadAssets)

async function loadAssets() {
  loading.value = true
  try {
    const url = `/api/projects/${projectId.value}/assets${filterType.value ? `?type=${filterType.value}` : ''}`
    const res = await fetch(url).then(r => r.json())
    assets.value = res.data?.data || []
  } finally { loading.value = false }
}

function getAssetUrl(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : `/static${path}`
}

function isImage(asset) {
  return ['character', 'scene', 'storyboard', 'cover'].includes(asset.type)
}

function sourceName(s) { return s === 'ai_generated' ? 'AI生成' : '手动上传'; }
function sourceClass(s) { return s === 'ai_generated' ? 'source-ai' : 'source-manual'; }

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function handleUploadSuccess(response) {
  if (response.code === 0) {
    ElMessage.success('上传成功')
    loadAssets()
  } else {
    ElMessage.error(response.error || '上传失败')
  }
}

function previewAsset(asset) {
  previewingAsset.value = asset
  showPreview.value = true
}

function downloadAsset(asset) {
  window.open(getAssetUrl(asset.file_path), '_blank')
}

async function handleDelete(asset) {
  await ElMessageBox.confirm('确认删除该素材？')
  await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' })
  assets.value = assets.value.filter(a => a.id !== asset.id)
  ElMessage.success('已删除')
}
</script>

<style scoped>
.asset-library { padding: 4px 0; }

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.toolbar-info { font-size: 13px; color: var(--text-muted); }

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.asset-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: all 0.25s ease;
}

.asset-preview {
  height: 150px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #151c30, #1a2744);
  cursor: pointer;
}
.asset-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.asset-preview:hover img { transform: scale(1.05); }
.asset-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.audio-placeholder, .file-placeholder {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 32px; color: var(--text-muted); opacity: 0.4;
}
.audio-placeholder span { font-size: 12px; margin-top: 4px; }

.type-tag {
  position: absolute; top: 6px; right: 6px;
}

.asset-info { padding: 10px 12px 6px; }
.asset-name {
  font-size: 13px; font-weight: 500; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 4px;
}
.asset-meta {
  display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);
}
.source-ai { color: var(--primary-light); }
.source-manual { color: var(--warning); }

.asset-actions {
  display: flex; justify-content: space-between; padding: 4px 12px 10px; border-top: 1px solid var(--border-light);
}

.preview-container { text-align: center; }
.preview-name { margin-top: 10px; color: var(--text-secondary); }
</style>
