<template>
  <div class="video-preview-page">
    <div class="preview-layout">
      <!-- 左侧: 控制面板 -->
      <div class="control-panel">
        <h3 class="panel-title">🎬 视频合成</h3>

        <!-- 合成选项 -->
        <el-form :model="composeOptions" label-position="top" size="default" class="compose-form">
          <el-form-item label="分辨率">
            <el-select v-model="composeOptions.resolution">
              <el-option label="720p (1280×720)" value="1280x720" />
              <el-option label="1080p (1920×1080)" value="1920x1080" />
              <el-option label="竖屏 9:16 (720×1280)" value="720x1280" />
              <el-option label="横屏 16:9 (1344×768)" value="1344x768" />
            </el-select>
          </el-form-item>
          <el-form-item label="帧率(FPS)">
            <el-select v-model="composeOptions.fps">
              <el-option label="24 FPS" :value="24" />
              <el-option label="30 FPS（推荐）" :value="30" />
              <el-option label="60 FPS" :value="60" />
            </el-select>
          </el-form-item>
          <el-form-item label="字幕">
            <el-switch v-model="composeOptions.withSubtitles" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="选择分镜">
            <el-checkbox v-model="selectAllSBs" @change="handleSelectAll">全选</el-checkbox>
            <el-checkbox-group v-model="composeOptions.storyboard_ids" class="sb-check-list">
              <el-checkbox
                v-for="(sb, idx) in storyboards"
                :key="sb.id"
                :label="sb.id"
                :disabled="!sb.image_path && !sb.video_path"
              >
                #{{ sb.scene_index || (idx+1) }} {{ sb.shot_type }} {{ sb.image_path || sb.video_path ? '✅' : '⏳' }}
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <el-button
            type="primary"
            size="large"
            @click="handleCompose"
            :loading="composing"
            :disabled="composeOptions.storyboard_ids.length === 0"
            style="width: 100%; height: 46px; font-size: 16px;"
          >
            {{ composing ? '⏳ 合成中...' : '🚀 开始合成视频' }}
          </el-button>
          
          <el-button size="large" @click="handleGenerateTTS" :loading="ttsLoading" plain style="width: 100%;">
            🔊 批量TTS配音
          </el-button>
        </div>

        <!-- 进度显示 -->
        <div v-if="composing || composeProgress > 0" class="progress-section">
          <el-progress :percentage="composeProgress" :stroke-width="16" :text-inside="true" :status="progressStatus" />
          <p class="progress-text">{{ progressText }}</p>
        </div>

        <!-- 已生成视频列表 -->
        <div v-if="composedVideos.length > 0" class="video-list-section">
          <h4>已生成的视频</h4>
          <div v-for="v in composedVideos" :key="v.id" class="composed-video-item card-glow">
            <span class="v-name">{{ v.name }}</span>
            <el-button size="small" type="primary" @click="playVideo(v)">▶ 播放</el-button>
            <el-button size="small" @click="downloadVideo(v)">📥 下载</el-button>
          </div>
        </div>
      </div>

      <!-- 右侧: 预览区域 -->
      <div class="preview-area">
        <div v-if="currentPreviewUrl" class="video-player-wrapper">
          <video ref="playerRef" controls class="video-player" :src="currentPreviewUrl" />
        </div>
        <div v-else-if="storyboards.length === 0" class="empty-preview">
          <span class="empty-icon">🎥</span>
          <p>先完成分镜制作，再合成视频</p>
          <p class="empty-tip">流程：剧本 → 角色 → 分镜 → 生图/生视频 → 合成导出</p>
        </div>
        <div v-else class="empty-preview">
          <span class="empty-icon">🎞️</span>
          <p>{{ composeOptions.storyboard_ids.length > 0 ? '点击「开始合成」' : '选择要合成的分镜后开始' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()

// 数据状态
const storyboards = ref([])
const composedVideos = ref([])
const composing = ref(false)
const ttsLoading = ref(false)
const composeProgress = ref(0)
const progressText = ref('')
const currentPreviewUrl = ref('')
const playerRef = ref(null)

const selectAllSBs = ref(false)

// 合成选项
const composeOptions = ref({
  resolution: '1344x768',
  fps: 30,
  withSubtitles: true,
  storyboard_ids: [],
})

// 计算属性
const progressStatus = computed(() => {
  if (composeProgress.value >= 100) return 'success'
  if (composing.value) return ''
  return undefined
})

onMounted(async () => {
  await loadStoryboards()
  await loadComposedVideos()
})

async function loadStoryboards() {
  try {
    const res = await fetch(`/api/projects/${route.params.id}/storyboards`).then(r => r.json())
    storyboards.value = res.data?.data || []
    // 默认选中所有有素材的分镜
    const validIds = storyboards.value.filter(s => s.image_path || s.video_path).map(s => s.id)
    if (validIds.length > 0 && composeOptions.value.storyboard_ids.length === 0) {
      // 不自动选中，等用户操作
    }
  } catch {}
}

async function loadComposedVideos() {
  try {
    const res = await fetch(`/api/videos/${route.params.id}/info`).then(r => r.json())
    composedVideos.value = (res.data?.data || []).filter(v => v.type === 'video')
  } catch {}
}

function handleSelectAll(val) {
  if (val) {
    composeOptions.value.storyboard_ids = storyboards.value.filter(s => s.image_path || s.video_path).map(s => s.id)
  } else {
    composeOptions.value.storyboard_ids = []
  }
}

watch(() => composeOptions.value.storyboard_ids, (val) => {
  selectAllSBs.value = val.length === storyboards.value.filter(s => s.image_path || s.video_path).length
})

// 核心合成功能
async function handleCompose() {
  if (composeOptions.value.storyboard_ids.length === 0) {
    ElMessage.warning('请至少选择一个有素材的分镜')
    return
  }

  composing.value = true
  composeProgress.value = 0
  progressText.value = '正在准备素材...'

  try {
    // 调用后端合成API
    const res = await fetch('/api/videos/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: route.params.id,
        storyboard_ids: composeOptions.value.storyboard_ids,
        options: composeOptions.value,
      }),
    }).then(r => r.json())

    if (res.code === 0 && res.data?.data?.video_url) {
      currentPreviewUrl.value = res.data.data.video_url
      composeProgress.value = 100
      progressText.value = '✅ 合成成功！'
      ElMessage.success('视频合成成功！')
      await loadComposedVideos()
    } else if (res.data?.data?.fallback) {
      ElMessage.warning(res.data.data.message || '当前API暂不支持直接视频生成，建议使用图片+配音方式')
      composeProgress.value = 100
      progressText.value = res.data.data.message
    } else {
      throw new Error(res.error || '合成失败')
    }
  } catch(e) {
    console.error('[Compose Error]', e)
    composeProgress.value = 0
    progressText.value = `❌ ${e.message}`
    ElMessage.error(`视频合成失败: ${e.message}`)
  } finally {
    composing.value = false
  }
}

// TTS批量配音
async function handleGenerateTTS() {
  ttsLoading.value = true
  try {
    // 注意：TTS需要单独的接口，这里调用后端
    const res = await fetch(`/api/projects/${route.params.id}/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_tts' }),
    }).then(r => r.json())
    
    if (res.code === 0) ElMessage.success(`已生成${res.data?.total_lines || 0}条TTS音频`)
    else throw new Error(res.error || 'TTS生成失败')
  } catch(e) {
    ElMessage.error(e.message || 'TTS生成功能需要配置语音模型')
  } finally {
    ttsLoading.value = false
  }
}

function playVideo(video) {
  const url = video.file_path?.startsWith('http') ? video.file_path : `/static${video.file_path}`
  currentPreviewUrl.value = url
}

function downloadVideo(video) {
  const url = video.file_path?.startsWith('http') ? video.file_path : `/static${video.file_path}`
  window.open(url, '_blank')
}
</script>

<style scoped>
.video-preview-page { padding: 4px 0; }

.preview-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  min-height: calc(100vh - 200px);
}

/* 左侧控制面板 */
.control-panel {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 24px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  max-height: calc(100vh - 160px);
}
.panel-title { font-size: 17px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }

.compose-form .el-form-item { margin-bottom: 14px; }
.sb-check-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 180px; overflow-y: auto;
  margin-top: 8px;
  padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm);
}
.sb-check-list .el-checkbox { margin-right: 0; white-space: nowrap; font-size: 12px; }

.action-buttons { display: flex; flex-direction: column; gap: 10px; }

.progress-section { background: var(--bg-input); padding: 14px; border-radius: var(--radius-md); }
.progress-text { font-size: 12px; color: var(--text-secondary); text-align: center; margin-top: 8px; }

.video-list-section h4 { font-size: 14px; color: var(--text-secondary); margin-bottom: 8px; }
.composed-video-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 12px; background: var(--bg-input); border-radius: var(--radius-sm);
  margin-bottom: 6px; font-size: 13px;
}
.v-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 右侧预览区 */
.preview-area {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  overflow: hidden;
}
.video-player-wrapper { width: 100%; height: 100%; }
.video-player {
  width: 100%;
  height: 100%;
  min-height: 500px;
  object-fit: contain;
  background: #000;
  border-radius: var(--radius-md);
}

.empty-preview {
  text-align: center;
  padding: 40px;
}
.empty-icon { font-size: 64px; opacity: 0.3; margin-bottom: 12px; display: block; }
.empty-preview p { color: var(--text-secondary); font-size: 15px; }
.empty-tip { font-size: 13px !important; color: var(--text-muted) !important; margin-top: 8px; }
</style>
