<template>
  <div class="composer-page">
    <div class="composer-layout">
      <!-- 左栏：资产库 -->
      <div class="asset-panel">
        <h3 class="panel-title">📦 资产库</h3>
        
        <!-- 角色资产 -->
        <div class="asset-section">
          <h4 class="section-title">角色 ({{ characters.length }})</h4>
          <div class="asset-list">
            <div v-for="ch in characters" :key="'ch-'+ch.id" class="asset-item" :class="{ active: selectedCharacter?.id === ch.id }" @click="selectCharacter(ch)">
              <div class="asset-thumb">
                <img v-if="ch.images?.length" :src="getImageUrl(ch.images[ch.images.length-1])" />
                <span v-else>👤</span>
              </div>
              <span class="asset-name">{{ ch.name }}</span>
            </div>
          </div>
        </div>

        <!-- 场景资产 -->
        <div class="asset-section">
          <h4 class="section-title">场景 ({{ scenes.length }})</h4>
          <div class="asset-list">
            <div v-for="sc in scenes" :key="'sc-'+sc.id" class="asset-item" :class="{ active: selectedScene?.id === sc.id }" @click="selectScene(sc)">
              <div class="asset-thumb">
                <img v-if="sc.image_path" :src="getImageUrl(sc.image_path)" />
                <span v-else>🏙️</span>
              </div>
              <span class="asset-name">{{ sc.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中栏：时间线 + 分镜片段 -->
      <div class="timeline-panel">
        <div class="panel-header-row">
          <h3 class="panel-title">🎞️ 视频合成</h3>
          <el-select v-model="selectedEpisodeId" placeholder="全部集" clearable size="small" style="width:140px">
            <el-option label="全部集" :value="null" />
            <el-option v-for="ep in episodes" :key="ep.id" :label="ep.title || '第'+ep.episode_number+'集'" :value="ep.id" />
          </el-select>
        </div>

        <!-- 时间线（上方） -->
        <div class="timeline-bar" v-if="filteredStoryboards.length > 0">
          <div class="timeline-header">
            <span class="timeline-label">时间线</span>
            <span class="timeline-total">{{ formatTime(totalDuration) }}</span>
          </div>
          
          <!-- 时间刻度 -->
          <div class="timeline-scale">
            <span v-for="t in timeMarkers" :key="'mk-'+t" class="time-marker" :style="{ left: (t/totalDuration*100)+'%' }">
              {{ formatTime(t) }}
            </span>
          </div>
          
          <!-- 时间线轨道 -->
          <div class="timeline-track">
            <template v-for="(group, gIdx) in sceneGroupedFragments" :key="'tl-g-'+group.sceneNumber">
              <!-- 场次分隔线 -->
              <div class="timeline-scene-divider" :title="'第'+group.sceneNumber+'场'">
                <span class="divider-label">S{{ group.sceneNumber }}</span>
              </div>
              <!-- 分镜块 -->
              <div
                v-for="sb in group.items"
                :key="'tl-'+sb.id"
                class="timeline-segment"
                :class="{
                  has_video: sb.video_available,
                  has_image: !!sb.image_path,
                  active: selectedFragment?.id === sb.id,
                  dragging: dragState.isDragging && dragState.dragItem?.id === sb.id
                }"
                :style="{ width: ((sb.duration||3)/totalDuration*100) + '%' }"
                draggable="true"
                @click="selectFragment(sb)"
                @dragstart="onDragStart($event, sb, group.sceneNumber)"
                @dragover.prevent="onDragOver($event, sb)"
                @drop="onDrop($event, sb, group.sceneNumber)"
                @dragend="onDragEnd"
                :title="`第${group.sceneNumber}场 #${sb.scene_index||sb.id} ${sb.shot_type} ${(sb.duration||3).toFixed(1)}s`"
              >
                <!-- 缩略图预览 -->
                <img v-if="sb.image_path" :src="getImageUrl(sb.image_path)" class="seg-thumb" />
                <div v-else class="seg-placeholder">
                  <span>{{ sb.shot_type?.substring(0,1) || '中' }}</span>
                </div>
                <!-- 序号标签 -->
                <span class="seg-index">#{{ sb.scene_index || sb.id }}</span>
                <!-- 已生成标记 -->
                <span v-if="sb.video_available" class="seg-badge">✓</span>
              </div>
            </template>
          </div>
        </div>

        <!-- 分镜片段列表（下方） -->
        <div class="fragment-section">
          <div class="section-header">
            <h4>分镜列表</h4>
            <span class="section-meta">{{ filteredStoryboards.length }}个镜头</span>
          </div>

          <div class="fragment-groups" v-if="filteredStoryboards.length > 0">
            <div v-for="group in sceneGroupedFragments" :key="'fg-'+group.sceneNumber" class="fragment-scene-group">
              <div class="fragment-scene-header">
                <span>第{{ group.sceneNumber }}场</span>
                <span class="fragment-scene-meta">{{ group.items.length }}镜 · {{ group.totalDuration.toFixed(1) }}s</span>
              </div>
              <div class="fragment-list-inner">
                <div
                  v-for="sb in group.items"
                  :key="sb.id"
                  class="fragment-item"
                  :class="{
                    active: selectedFragment?.id === sb.id,
                    has_image: !!sb.image_path,
                    has_video: sb.video_available
                  }"
                  @click="selectFragment(sb)"
                >
                  <div class="fragment-thumb">
                    <img v-if="sb.video_available" :src="getImageUrl(sb.image_path)" />
                    <img v-else-if="sb.image_path" :src="getImageUrl(sb.image_path)" />
                    <div v-else class="fragment-placeholder">
                      <span>{{ sb.shot_type || '中景' }}</span>
                    </div>
                    <span class="fragment-duration">{{ (sb.duration || 3).toFixed(1) }}s</span>
                    <span v-if="sb.video_available" class="fragment-badge">🎬</span>
                  </div>
                  <div class="fragment-info">
                    <div class="fragment-header">
                      <strong>#{{ sb.scene_index || (sb.id) }}</strong>
                      <el-tag size="small">{{ sb.shot_type }}</el-tag>
                      <el-tag v-if="sb.video_available" size="small" type="success" effect="dark">已生成</el-tag>
                      <el-tag v-else-if="sb._genVidLoading" size="small" type="warning">生成中...</el-tag>
                    </div>
                    <p class="fragment-desc">{{ sb.description?.substring(0, 30) || '--' }}</p>
                    <p class="fragment-dialogue" v-if="sb.dialogue_text">{{ sb.dialogue_text.substring(0, 20) }}</p>
                    <div class="fragment-actions">
                      <el-tooltip :content="sb.image_path ? '' : '需先生成图片'" :disabled="!!sb.image_path">
                        <el-button
                          size="small"
                          type="primary"
                          plain
                          @click.stop="sb.video_available ? openRegenVideoDialog(sb) : generateSingleVideo(sb)"
                          :loading="sb._genVidLoading"
                          :disabled="!sb.image_path"
                        >
                          🎬 {{ sb._genVidLoading ? '生成中' : (sb.video_available ? '重新生成' : '生成视频') }}
                        </el-button>
                      </el-tooltip>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">
            <span>🎬</span>
            <p>请先生成分镜</p>
          </div>
        </div>
      </div>

      <!-- 右栏：预览器 -->
      <div class="player-panel">
        <div class="panel-header-row">
          <h3 class="panel-title">▶ 预览器</h3>
        </div>

        <!-- 视频播放器（上方） -->
        <div class="player-wrapper">
          <div class="player-container">
            <!-- 生成中遮罩 -->
            <div v-if="selectedFragment?._genVidLoading" class="generating-overlay">
              <img
                v-if="currentPreviewUrl"
                :src="currentPreviewUrl"
                class="preview-image dimmed"
                alt="预览图"
              />
              <div class="player-empty" v-else>
                <span>🎥</span>
                <p>正在启动视频生成...</p>
              </div>
              <div class="generating-indicator">
                <div class="gen-spinner"></div>
                <p class="gen-title">🎬 AI 视频生成中</p>
                <p class="gen-hint">模型：{{ selectedFragment._genVidModel || klingOptions.model || 'Seedance 1.5' }}</p>
                <p class="gen-hint">预计 1-3 分钟，请稍候...</p>
              </div>
            </div>
            <!-- 正常视频/图片显示 -->
            <template v-else>
              <video
                v-if="currentPreviewUrl && currentPreviewUrl.endsWith('.mp4')"
                ref="playerRef"
                controls
                class="video-element"
                :src="currentPreviewUrl"
              />
              <img
                v-else-if="currentPreviewUrl"
                :src="currentPreviewUrl"
                class="preview-image"
                alt="预览图"
              />
              <div v-else class="player-empty">
                <span>🎥</span>
                <p>{{ videoMode === 'kling' ? '选择分镜查看或生成视频' : '选择分镜后点击合成查看预览' }}</p>
              </div>
            </template>
          </div>

          <!-- 当前选中分镜简要信息 -->
          <div class="selected-info-bar" v-if="selectedFragment">
            <div class="info-item">
              <span class="info-label">分镜</span>
              <span class="info-value">#{{ selectedFragment.scene_index }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">时长</span>
              <span class="info-value">{{ (selectedFragment.duration || 3).toFixed(1) }}s</span>
            </div>
            <div class="info-item">
              <span class="info-label">状态</span>
              <el-tag v-if="selectedFragment.video_available" size="small" type="success">已生成</el-tag>
              <el-tag v-else size="small" type="info">待生成</el-tag>
            </div>
          </div>
        </div>

        <!-- 参数设置区（下方） -->
        <div class="params-section">
          <div class="params-header">
            <h4>生成参数</h4>
          </div>

          <div class="params-grid">
            <div class="param-item">
              <label>运镜风格</label>
              <el-select v-model="klingOptions.motion" size="small" style="width:100%">
                <el-option label="对话场景" value="dialogue" />
                <el-option label="缓慢推进" value="slow_zoom" />
                <el-option label="横移左→右" value="pan_right" />
                <el-option label="横移右→左" value="pan_left" />
                <el-option label="静态镜头" value="static" />
                <el-option label="戏剧张力" value="dramatic" />
              </el-select>
            </div>

            <div class="param-item">
              <label>生成模型</label>
              <el-select v-model="klingOptions.model" size="small" style="width:100%" @change="onModelChange">
                <el-option label="Doubao Seedance 2.0 (推荐)" value="doubao-seedance-2.0" />
                <el-option label="Seedance 1.5 Pro I2V (图生视频)" value="seedance-v1.5-pro-i2v" />
                <el-option label="Seedance 1.5 Pro T2V (文生视频)" value="seedance-v1.5-pro-t2v" />
                <el-option label="Kling 1.6 (文生视频)" value="kling-v1.6-t2v" />
              </el-select>
            </div>

            <div class="param-item">
              <label>画质</label>
              <el-select v-model="klingOptions.mode" size="small" style="width:100%">
                <el-option label="标准 (Standard)" value="Standard" />
                <el-option label="快速 (std)" value="std" />
              </el-select>
            </div>

            <div class="param-item">
              <label>时长</label>
              <el-select v-model="klingOptions.duration" size="small" style="width:100%">
                <el-option label="5秒" :value="5" />
                <el-option label="10秒" :value="10" />
              </el-select>
            </div>
          </div>

          <div class="param-full">
            <label>负面提示词（防漂移）</label>
            <el-input
              v-model="klingOptions.negativePrompt"
              type="textarea"
              :rows="2"
              size="small"
              placeholder="可选：填写不想出现的内容，如 changed face, wrong clothes..."
            />
          </div>
        </div>

        <!-- 进度指示 -->
        <div v-if="composeTaskId" class="progress-bar">
          <el-progress :percentage="composeProgress" :status="composeProgress===100?'success':''" :stroke-width="8" />
          <p class="progress-text">{{ composeStatus }}</p>
        </div>

        <!-- 合成操作区 -->
        <div class="compose-actions">
          <el-select v-if="videoMode === 'ffmpeg'" v-model="composeOptions.resolution" size="small" style="width: 100%; margin-bottom: 8px;">
            <el-option label="1080p 横屏" value="1920x1080" />
            <el-option label="720p 横屏" value="1280x720" />
            <el-option label="竖屏 9:16" value="720x1280" />
          </el-select>

          <!-- 批量生成视频 -->
          <el-button
            v-if="videoMode === 'kling'"
            type="primary"
            size="large"
            @click="handleBatchGenerate"
            :loading="batchGenerating"
            :disabled="!hasStoryboards"
            style="width:100%"
          >
            {{ batchGenerating ? '⏳ 批量生成中...' : `📹 批量生成视频 (${filteredStoryboards.filter(s=>!s.video_available).length}个待生成)` }}
          </el-button>

          <!-- 合成已有视频 -->
          <el-button
            v-if="videoMode === 'kling'"
            type="success"
            size="large"
            @click="handleComposeExisting"
            :loading="composing"
            :disabled="!hasVideosGenerated"
            style="width:100%; margin-top: 8px;"
          >
            {{ composing ? '⏳ 拼接中...' : `🎬 合成已有视频 (${filteredStoryboards.filter(s=>s.video_available).length}个)` }}
          </el-button>

          <!-- 旧版一键合成（隐藏，保留兼容） -->
          <el-button
            v-if="false"
            type="warning"
            size="large"
            @click="handleComposeWithKling"
            :loading="composing"
            :disabled="!hasStoryboards"
            style="width:100%"
          >
            {{ composing ? '⏳ Kling生成中...' : '🎬 Kling一键合成' }}
          </el-button>

          <!-- FFmpeg 模式：传统合成 -->
          <el-button
            v-if="videoMode === 'ffmpeg'"
            type="primary"
            size="large"
            @click="handleCompose"
            :loading="composing"
            :disabled="!hasStoryboards"
            style="width:100%"
          >
            {{ composing ? '⏳ 合成中...' : '🚀 合成视频' }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 重新生成视频参数弹窗 -->
    <el-dialog v-model="showRegenDialog" title="重新生成视频" width="520px">
      <el-form :model="regenForm" label-width="90px">
        <el-form-item label="视频提示词">
          <el-input v-model="regenForm.prompt" type="textarea" :rows="4" placeholder="描述视频中应有的动作、运镜..." />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="时长(秒)">
              <el-select v-model="regenForm.duration" style="width:100%">
                <el-option label="5秒" :value="5" />
                <el-option label="10秒" :value="10" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="运镜风格">
              <el-select v-model="regenForm.motion" style="width:100%">
                <el-option label="对话场景" value="dialogue" />
                <el-option label="缓慢推进" value="slow_zoom" />
                <el-option label="横移左→右" value="pan_right" />
                <el-option label="横移右→左" value="pan_left" />
                <el-option label="静态镜头" value="static" />
                <el-option label="戏剧张力" value="dramatic" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showRegenDialog = false">取消</el-button>
        <el-button type="primary" @click="handleRegenVideo" :loading="regenSb?._genVidLoading">
          重新生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()
const baseURL = '/static'

// 视频模式: kling | ffmpeg
const videoMode = ref('kling')

// Kling 选项 — 显示当前选中分镜的参数
const klingOptions = ref({
  model: 'doubao-seedance-2.0',
  motion: 'dialogue',
  mode: 'Standard',
  duration: 5,
  negativePrompt: '',
})

// 自动保存参数到分镜（debounce 1.5s）
let _saveParamsTimer = null
let _skipAutoSave = false  // 加载分镜参数时跳过自动保存
function autoSaveVideoParams() {
  if (_skipAutoSave) return
  clearTimeout(_saveParamsTimer)
  _saveParamsTimer = setTimeout(async () => {
    const sb = selectedFragment.value
    if (!sb?.id) return
    try {
      await fetch(`/api/storyboards/${sb.id}/video-params`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: klingOptions.value.model,
          motion: klingOptions.value.motion,
          mode: klingOptions.value.mode,
          duration: klingOptions.value.duration,
          negative_prompt: klingOptions.value.negativePrompt,
        }),
      })
      // 同步到本地对象，防止刷新丢失
      sb.video_params = { ...klingOptions.value }
    } catch (e) {
      console.warn('自动保存视频参数失败:', e)
    }
  }, 1500)
}

// 监听 klingOptions 变化 → 自动保存
watch(klingOptions, () => { autoSaveVideoParams() }, { deep: true })

// 数据
const storyboards = ref([])
const episodes = ref([])
const selectedEpisodeId = ref(null)
const characters = ref([])
const scenes = ref([])
const composing = ref(false)
const batchGenerating = ref(false)
const showRegenDialog = ref(false)
const regenSb = ref(null)
const regenForm = ref({ prompt: '', duration: 5, motion: 'dialogue' })
const currentPreviewUrl = ref('')
const selectedFragment = ref(null)

// 拖拽状态
const dragState = reactive({
  isDragging: false,
  dragItem: null,
  dragFromScene: null,
  dragToScene: null
})

// 拖拽开始
function onDragStart(e, sb, sceneNumber) {
  dragState.isDragging = true
  dragState.dragItem = sb
  dragState.dragFromScene = sceneNumber
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', sb.id.toString())
}

// 拖拽经过
function onDragOver(e, sb) {
  e.preventDefault()
  dragState.dragToScene = sb.scene_number
}

// 拖拽放下
async function onDrop(e, targetSb, targetSceneNumber) {
  e.preventDefault()
  const dragSb = dragState.dragItem
  
  if (!dragSb || dragSb.id === targetSb.id) {
    onDragEnd()
    return
  }
  
  // 同一场内调整顺序
  if (dragState.dragFromScene === targetSceneNumber) {
    const itemsInScene = filteredStoryboards.value
      .filter(s => (s.scene_number || 1) === targetSceneNumber)
      .sort((a, b) => (a.scene_index || 0) - (b.scene_index || 0))
    
    const dragIdx = itemsInScene.findIndex(s => s.id === dragSb.id)
    const targetIdx = itemsInScene.findIndex(s => s.id === targetSb.id)
    
    if (dragIdx !== -1 && targetIdx !== -1 && dragIdx !== targetIdx) {
      // 重新分配 scene_index
      const newOrder = [...itemsInScene]
      newOrder.splice(dragIdx, 1)
      newOrder.splice(targetIdx, 0, dragSb)
      
      // 批量更新
      for (let i = 0; i < newOrder.length; i++) {
        const item = newOrder[i]
        if (item.scene_index !== i + 1) {
          await fetch(`/api/storyboards/${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scene_index: i + 1 })
          })
        }
      }
      
      await loadStoryboards()
      ElMessage.success('顺序已更新')
    }
  } else {
    // 跨场移动
    const targetItems = filteredStoryboards.value
      .filter(s => (s.scene_number || 1) === targetSceneNumber)
      .sort((a, b) => (a.scene_index || 0) - (b.scene_index || 0))
    
    const newSceneIndex = targetItems.length > 0
      ? Math.max(...targetItems.map(s => s.scene_index || 0)) + 1
      : 1
    
    await fetch(`/api/storyboards/${dragSb.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene_number: targetSceneNumber,
        scene_index: newSceneIndex
      })
    })
    
    await loadStoryboards()
    ElMessage.success(`已移至第${targetSceneNumber}场`)
  }
  
  onDragEnd()
}

// 拖拽结束
function onDragEnd() {
  dragState.isDragging = false
  dragState.dragItem = null
  dragState.dragFromScene = null
  dragState.dragToScene = null
}
const selectedCharacter = ref(null)
const selectedScene = ref(null)

// 合成任务进度
const composeTaskId = ref(null)
const composeProgress = ref(0)
const composeStatus = ref('')
let pollTimer = null
let pollStartTime = null

const composeOptions = ref({
  resolution: '1920x1080',
  fps: 30,
  withSubtitles: true,
})

const filteredStoryboards = computed(() => {
  if (!selectedEpisodeId.value) return storyboards.value
  return storyboards.value.filter(s => s.episode_id === selectedEpisodeId.value)
})

const hasStoryboards = computed(() => filteredStoryboards.value.length > 0)
const hasVideosGenerated = computed(() => filteredStoryboards.value.some(s => s.video_available))
const totalDuration = computed(() => filteredStoryboards.value.reduce((s, sb) => s + (sb.duration || 3), 0))

// 时间刻度点（每5秒一个）
const timeMarkers = computed(() => {
  const total = totalDuration.value
  const markers = []
  const step = 5
  for (let t = 0; t <= total; t += step) {
    markers.push(t)
  }
  return markers
})

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2,'0')}` : `${s}s`
}

// 按场次分组
const sceneGroupedFragments = computed(() => {
  const groups = new Map()
  for (const sb of filteredStoryboards.value) {
    const sn = sb.scene_number || 1
    if (!groups.has(sn)) {
      groups.set(sn, { sceneNumber: sn, items: [], totalDuration: 0 })
    }
    const g = groups.get(sn)
    g.items.push(sb)
    g.totalDuration += (sb.duration || 0)
  }
  return Array.from(groups.values()).sort((a, b) => a.sceneNumber - b.sceneNumber)
})
const playerRef = ref(null)

function getImageUrl(path) {
  if (!path) return ''
  const filename = path.split('/').pop()
  return `${baseURL}/images/${filename}`
}

async function loadAll() {
  const pid = route.params.id
  try {
    const [sbRes, chRes, scRes, epRes] = await Promise.all([
      fetch(`/api/projects/${pid}/storyboards`).then(r => r.json()),
      fetch(`/api/projects/${pid}/characters`).then(r => r.json()),
      fetch(`/api/projects/${pid}/scenes`).then(r => r.json()),
      fetch(`/api/projects/${pid}/episodes`).then(r => r.json()),
    ])
    storyboards.value = sbRes.data || []
    characters.value = chRes.data || []
    scenes.value = scRes.data || []
    episodes.value = epRes.data || []
  } catch (e) {
    console.error('加载失败', e)
  }
}

function selectCharacter(ch) {
  selectedCharacter.value = selectedCharacter.value?.id === ch.id ? null : ch
}

function selectScene(sc) {
  selectedScene.value = selectedScene.value?.id === sc.id ? null : sc
}

function selectFragment(sb) {
  const isSame = selectedFragment.value?.id === sb.id
  if (isSame) {
    // 取消选中
    selectedFragment.value = null
    currentPreviewUrl.value = ''
  } else {
    selectedFragment.value = sb
    // 加载该分镜的视频参数（跳过自动保存）
    _skipAutoSave = true
    if (sb.video_params && typeof sb.video_params === 'object' && Object.keys(sb.video_params).length > 0) {
      klingOptions.value = {
        model: sb.video_params.model || 'seedance-v1.5-pro-t2v',
        motion: sb.video_params.motion || 'dialogue',
        mode: sb.video_params.mode || 'Standard',
        duration: sb.video_params.duration || 5,
        negativePrompt: sb.video_params.negative_prompt || '',
      }
    } else {
      // 没有保存的参数 → 用默认值
      klingOptions.value = {
        model: 'seedance-v1.5-pro-t2v',
        motion: 'dialogue',
        mode: 'Standard',
        duration: 5,
        negativePrompt: '',
      }
    }
    _skipAutoSave = false
    // 播放视频或显示图片
    if (sb.video_available && sb.video_path) {
      currentPreviewUrl.value = `${baseURL}${sb.video_path}`
    } else if (sb.image_path) {
      const filename = sb.image_path.split('/').pop()
      currentPreviewUrl.value = `${baseURL}/images/${filename}`
    }
  }
}

// FFmpeg 传统合成
async function handleCompose() {
  composing.value = true
  try {
    const res = await fetch('/api/videos/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: route.params.id,
        storyboard_ids: filteredStoryboards.value.map(s => s.id),
        options: composeOptions.value,
      }),
    }).then(r => r.json())

    if (res.code === 0 && res.data?.video_url) {
      currentPreviewUrl.value = res.data.video_url
      ElMessage.success('视频合成成功！')
    } else {
      throw new Error(res.error || '合成失败')
    }
  } catch (e) {
    ElMessage.error(`合成失败: ${e.message}`)
  } finally {
    composing.value = false
  }
}

// Kling 一键合成
async function handleComposeWithKling() {
  composing.value = true
  composeProgress.value = 0
  composeStatus.value = '正在启动Kling视频合成...'

  try {
    const res = await fetch('/api/videos/compose-with-kling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: route.params.id,
        storyboard_ids: filteredStoryboards.value.map(s => s.id),
        options: {
          model: klingOptions.value.model,
          motion: klingOptions.value.motion,
          mode: klingOptions.value.mode,
          duration: klingOptions.value.duration,
        },
      }),
    }).then(r => r.json())

    if (res.code === 0 && res.data?.task_id) {
      composeTaskId.value = res.data.task_id
      ElMessage.info(res.data.message || 'Kling合成已启动，后台生成中...')
      startPolling()
    } else {
      throw new Error(res.error || '启动失败')
    }
  } catch (e) {
    ElMessage.error(`Kling合成启动失败: ${e.message}`)
    composing.value = false
  }
}

// 批量生成视频
async function handleBatchGenerate() {
  batchGenerating.value = true
  try {
    const res = await fetch('/api/videos/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyboard_ids: filteredStoryboards.value.map(s => s.id),
        concurrency: 2,
      }),
    }).then(r => r.json())

    if (res.code === 0) {
      ElMessage.success(res.data?.message || `已启动 ${filteredStoryboards.value.length} 个视频生成任务`)
      // 定期刷新直到全部完成
      startBatchPolling()
    } else {
      throw new Error(res.error || '启动失败')
    }
  } catch (e) {
    ElMessage.error(`批量生成失败: ${e.message}`)
    batchGenerating.value = false
  }
}

// 批量任务轮询
let batchPollTimer = null
function startBatchPolling() {
  clearInterval(batchPollTimer)
  batchPollTimer = setInterval(async () => {
    await loadAll()
    const pending = storyboards.value.filter(s => !s.video_available).length
    if (pending === 0) {
      clearInterval(batchPollTimer)
      batchGenerating.value = false
      ElMessage.success('所有分镜视频生成完成！')
    }
  }, 5000) // 每5秒刷新一次
}

// 单分镜生成视频
function openRegenVideoDialog(sb) {
  regenSb.value = sb
  let savedPrompt = sb.prompt_text || sb.description || ''
  try {
    const vp = typeof sb.video_params === 'string' ? JSON.parse(sb.video_params) : (sb.video_params || {})
    if (vp.custom_prompt) savedPrompt = vp.custom_prompt
    regenForm.value = {
      prompt: savedPrompt,
      duration: vp.duration || klingOptions.value.duration || 5,
      motion: vp.motion || klingOptions.value.motion || 'dialogue',
    }
  } catch {
    regenForm.value = { prompt: savedPrompt, duration: klingOptions.value.duration || 5, motion: 'dialogue' }
  }
  showRegenDialog.value = true
}

async function handleRegenVideo() {
  const sb = regenSb.value
  if (!sb) return
  sb._genVidLoading = true
  try {
    const res = await fetch('/api/storyboards/' + sb.id + '/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custom_prompt: regenForm.value.prompt,
        duration: regenForm.value.duration,
        motion: regenForm.value.motion,
      }),
    }).then(r => r.json())
    if (res.code === 0) {
      ElMessage.success('视频重新生成已提交')
      showRegenDialog.value = false
      await loadStoryboards()
    } else {
      throw new Error(res.error)
    }
  } catch(e) { ElMessage.error(`重新生成失败: ${e.message}`) }
  finally { sb._genVidLoading = false }
}

async function generateSingleVideo(sb) {
  sb._genVidLoading = true
  sb._genVidModel = klingOptions.value.model
  try {
    const res = await fetch('/api/storyboards/' + sb.id + '/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: klingOptions.value.model,
        motion: klingOptions.value.motion,
        duration: klingOptions.value.duration,
        mode: klingOptions.value.mode,
        negative_prompt: klingOptions.value.negativePrompt || undefined,
      }),
    }).then(r => r.json())

    if (res.code === 0) {
      // 检查后端是否返回了 fallback（表示生成失败，未启动轮询）
      if (res.data?.fallback) {
        sb._genVidLoading = false
        ElMessage.warning(res.data?.message || '视频生成失败')
        return
      }
      ElMessage.success('视频生成任务已启动')
      // 轮询刷新
      pollSingleVideo(sb)
    } else {
      throw new Error(res.error || '启动失败')
    }
  } catch (e) {
    ElMessage.error(`生成失败: ${e.message}`)
    sb._genVidLoading = false
  }
}

// 轮询单个分镜的视频生成结果
function pollSingleVideo(sb) {
  const timer = setInterval(async () => {
    await loadAll()
    const updated = storyboards.value.find(s => s.id === sb.id)
    if (updated?.video_available) {
      clearInterval(timer)
      sb._genVidLoading = false
      // 自动选中并预览
      selectFragment(updated)
      ElMessage.success('视频生成完成！')
    }
  }, 5000)
  // 超时保护 6 分钟（Seedance T2V 约需 1.5-2 分钟 + 下载时间）
  setTimeout(() => {
    clearInterval(timer)
    if (sb._genVidLoading) {
      sb._genVidLoading = false
      ElMessage.warning('视频生成超时，请刷新页面查看')
    }
  }, 360000)
}

// 合成已有视频（仅拼接，不自动生成）
async function handleComposeExisting() {
  composing.value = true
  composeProgress.value = 0
  composeStatus.value = '正在拼接已有视频...'

  try {
    const res = await fetch('/api/videos/compose-existing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: route.params.id,
        storyboard_ids: filteredStoryboards.value.map(s => s.id),
        options: {},
      }),
    }).then(r => r.json())

    if (res.code === 0 && res.data?.task_id) {
      composeTaskId.value = res.data.task_id
      ElMessage.info(res.data.message || '拼接已启动')
      startPolling()
    } else {
      throw new Error(res.error || '启动失败')
    }
  } catch (e) {
    ElMessage.error(`拼接失败: ${e.message}`)
    composing.value = false
  }
}

// 轮询任务进度
function startPolling() {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/tasks/${composeTaskId.value}`).then(r => r.json())
      if (res.code === 0 && res.data) {
        composeProgress.value = res.data.progress || 0
        composeStatus.value = res.data.status === 'completed'
          ? '✅ 合成完成！'
          : res.data.status === 'failed'
            ? '❌ 合成失败'
            : `Kling生成中... ${composeProgress.value}%`
        
        if (res.data.status === 'completed') {
          clearInterval(pollTimer)
          composeProgress.value = 100
          composing.value = false
          composeTaskId.value = null
          // 获取视频并自动播放
          if (res.data.result) {
            const result = typeof res.data.result === 'string' ? JSON.parse(res.data.result) : res.data.result
            if (result.video_path) {
              currentPreviewUrl.value = `${baseURL}${result.video_path}`
            }
          }
          ElMessage.success('Kling视频合成完成！')
          // 延迟刷新：等后端写入数据库再读取
          setTimeout(() => { loadAll(); composeTaskId.value = null; composeProgress.value = 0; composeStatus.value = ''; }, 1000)
        } else if (res.data.status === 'failed') {
          clearInterval(pollTimer)
          composing.value = false
          composeTaskId.value = null
          composeProgress.value = 0
          composeStatus.value = ''
          ElMessage.error(res.data.error || 'Kling合成失败')
        }
      }
    } catch (e) {
      console.warn('轮询任务状态失败', e)
      // 如果任务404或持续失败超90秒，清理状态
      if (!pollStartTime) pollStartTime = Date.now()
      if (Date.now() - pollStartTime > 90000) {
        clearInterval(pollTimer)
        composeTaskId.value = null
        composeProgress.value = 0
        composeStatus.value = ''
        composing.value = false
        ElMessage.warning('Kling任务超时，请重试')
      }
    }
  }, 3000) // 每3秒轮询
  pollStartTime = Date.now()
}

// 切换模式时提示
watch(videoMode, (mode) => {
  if (mode === 'kling') {
    ElMessage.info('Kling/Seedance模式：AI生成带运镜效果的高质量视频，每个分镜需5-60秒')
  } else {
    ElMessage.info('FFmpeg模式：基于已有图片/视频素材拼接')
  }
})

// 切换模型时自动调整画质
function onModelChange(model) {
  if (model?.includes('seedance')) {
    klingOptions.value.mode = 'pro'
  } else if (model === 'kling-v1.6-t2v') {
    klingOptions.value.mode = 'Standard'
  }
}

onMounted(loadAll)
</script>

<style scoped>
.composer-page { padding: 0; background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f1 100%); }

.composer-layout {
  display: grid;
  grid-template-columns: 220px 1fr 300px;
  gap: 14px;
  min-height: calc(100vh - 180px);
}

.panel-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; }

.panel-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-header-row .panel-title { margin-bottom: 0; }

/* === 左栏：资产库 === */
.asset-panel {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(124, 92, 240, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow-y: auto;
}
.asset-section { margin-bottom: 16px; }
.section-title { font-size: 10px; color: #6b7280; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
.asset-list { display: flex; flex-direction: column; gap: 6px; }
.asset-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 8px;
  cursor: pointer; transition: all 0.2s;
  border: 1px solid transparent;
  background: rgba(124, 92, 240, 0.02);
}
.asset-item:hover { background: rgba(124, 92, 240, 0.08); border-color: rgba(124, 92, 240, 0.15); }
.asset-item.active { background: rgba(124, 92, 240, 0.12); border-color: #7c5cf0; }
.asset-thumb {
  width: 36px; height: 36px; border-radius: 6px;
  overflow: hidden; background: linear-gradient(135deg, #e8eaf0 0%, #d8dade 100%);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.asset-thumb img { width: 100%; height: 100%; object-fit: cover; }
.asset-name { font-size: 12px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* === 中栏：分镜片段 === */
.timeline-panel {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(124, 92, 240, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.fragment-groups { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.fragment-scene-group {
  border: 1px solid rgba(124, 92, 240, 0.12);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(124, 92, 240, 0.02);
}
.fragment-scene-header {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  font-size: 12px; font-weight: 600; color: #7c5cf0;
  background: linear-gradient(135deg, rgba(124, 92, 240, 0.12) 0%, rgba(124, 92, 240, 0.06) 100%);
  border-bottom: 1px solid rgba(124, 92, 240, 0.15);
}
.fragment-scene-meta { font-size: 11px; color: #9ca3af; font-weight: 400; }
.fragment-list-inner { display: flex; flex-direction: column; gap: 0; }
.fragment-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.fragment-item {
  display: flex; gap: 12px; padding: 12px;
  border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; transition: all 0.2s;
  background: #fff;
}
.fragment-item:hover { background: rgba(124, 92, 240, 0.05); border-color: rgba(124, 92, 240, 0.12); }
.fragment-item.active { background: rgba(124, 92, 240, 0.1); border-color: #7c5cf0; box-shadow: 0 2px 8px rgba(124, 92, 240, 0.15); }
.fragment-item.has_video { border-left: 3px solid #10b981; }
.fragment-thumb {
  width: 100px; height: 56px; border-radius: 6px;
  overflow: hidden; background: linear-gradient(135deg, #e8eaf0 0%, #d8dade 100%);
  position: relative; flex-shrink: 0;
}
.fragment-thumb img { width: 100%; height: 100%; object-fit: cover; }
.fragment-placeholder {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: #9ca3af; font-size: 12px;
}
.fragment-duration {
  position: absolute; bottom: 4px; right: 4px;
  background: rgba(0,0,0,0.7); color: #fff;
  font-size: 10px; padding: 2px 6px; border-radius: 4px;
}
.fragment-badge {
  position: absolute; top: 4px; left: 4px;
  font-size: 12px;
}
.fragment-info { flex: 1; min-width: 0; }
.fragment-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.fragment-header strong { font-size: 13px; color: #374151; }
.fragment-desc { font-size: 11px; color: #6b7280; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fragment-dialogue { font-size: 11px; color: #7c5cf0; margin-top: 4px; }
.fragment-actions { margin-top: 8px; display: flex; gap: 6px; }

/* 时间线 */
.timeline-bar {
  margin-top: 14px; padding-top: 14px;
  border-top: 1px solid rgba(124, 92, 240, 0.1);
}
.timeline-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.timeline-label { font-size: 11px; color: #6b7280; font-weight: 600; }
.timeline-total { font-size: 11px; color: #7c5cf0; font-weight: 600; }

/* 时间刻度 */
.timeline-scale {
  position: relative; height: 20px;
  margin-bottom: 6px; border-bottom: 1px solid rgba(124, 92, 240, 0.1);
}
.time-marker {
  position: absolute; font-size: 10px; color: #9ca3af;
  transform: translateX(-50%);
  bottom: 3px;
}
.time-marker::before {
  content: ''; position: absolute;
  left: 50%; bottom: -5px; width: 1px; height: 5px;
  background: rgba(124, 92, 240, 0.3);
}

.timeline-track {
  display: flex; height: 52px;
  background: linear-gradient(135deg, #f0f2f5 0%, #e4e7ed 100%);
  border-radius: 8px; overflow: hidden;
  align-items: center;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);
}
.timeline-scene-divider {
  width: 2px; height: 100%;
  background: linear-gradient(180deg, #7c5cf0 0%, #6366f1 100%);
  opacity: 0.85; flex-shrink: 0;
  position: relative;
}
.divider-label {
  position: absolute; top: 3px; left: 4px;
  font-size: 9px; color: #7c5cf0;
  font-weight: 600;
}
.timeline-segment {
  height: 100%; position: relative;
  cursor: pointer; transition: all 0.2s;
  border-right: 1px solid #fff;
  overflow: hidden;
}
.timeline-segment:hover { opacity: 0.95; transform: translateY(-1px); }
.timeline-segment.active { outline: 2px solid #7c5cf0; outline-offset: -2px; }

/* 缩略图 */
.seg-thumb { width: 100%; height: 100%; object-fit: cover; }
.seg-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #e8ebf2 0%, #dde1eb 100%);
  font-size: 14px; color: #9ca3af;
}
.seg-index {
  position: absolute; bottom: 3px; left: 3px;
  font-size: 9px; color: #fff;
  background: rgba(0,0,0,0.6); padding: 2px 5px;
  border-radius: 3px;
}
.seg-badge {
  position: absolute; top: 3px; right: 3px;
  font-size: 11px; color: #10b981;
  background: rgba(255,255,255,0.9); padding: 2px 4px;
  border-radius: 3px;
}

.timeline-segment.has_video { border-bottom: 3px solid #10b981; }
.timeline-segment:not(.has_image):not(.has_video) { opacity: 0.65; }

/* 拖拽状态 */
.timeline-segment[draggable="true"] { cursor: grab; }
.timeline-segment.dragging {
  opacity: 0.4;
  cursor: grabbing;
  outline: 2px dashed #7c5cf0;
}
.timeline-segment:hover:not(.dragging) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(124, 92, 240, 0.25);
}

/* === 右栏：播放器 === */
.player-panel {
  background: linear-gradient(135deg, #f8f9fc 0%, #eef1f8 100%);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(124, 92, 240, 0.12);
  display: flex; flex-direction: column; gap: 12px;
  overflow-y: auto;
}

.player-wrapper {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(26, 26, 46, 0.3);
}

.player-container {
  aspect-ratio: 16/9;
  overflow: hidden;
  position: relative;
  background: linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%);
}
.video-element { width: 100%; height: 100%; object-fit: contain; }
.preview-image { width: 100%; height: 100%; object-fit: contain; }
.preview-image.dimmed { opacity: 0.15; filter: blur(4px); }
.player-empty {
  width: 100%; height: 100%; display: flex;
  flex-direction: column; align-items: center;
  justify-content: center; color: rgba(255,255,255,0.4);
  font-size: 48px;
}
.player-empty p { font-size: 12px; margin-top: 10px; padding: 0 16px; text-align: center; color: rgba(255,255,255,0.35); }

.selected-info-bar {
  display: flex; gap: 12px;
  padding: 10px 12px;
  background: rgba(124, 92, 240, 0.15);
  border-top: 1px solid rgba(124, 92, 240, 0.25);
}
.info-item {
  display: flex; align-items: center; gap: 6px;
}
.info-label {
  font-size: 11px; color: rgba(255,255,255,0.5);
}
.info-value {
  font-size: 13px; color: #fff; font-weight: 600;
}

.generating-overlay {
  position: relative; width: 100%; height: 100%;
}
.generating-indicator {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 2;
}
.gen-spinner {
  width: 44px; height: 44px;
  border: 3px solid rgba(255,255,255,0.15);
  border-top-color: #7c5cf0;
  border-radius: 50%;
  animation: gen-spin 0.8s linear infinite;
  margin-bottom: 14px;
}
@keyframes gen-spin { to { transform: rotate(360deg); } }
.gen-title {
  font-size: 15px; font-weight: 600; color: #fff;
  margin-bottom: 6px;
}
.gen-hint {
  font-size: 12px; color: rgba(255,255,255,0.5);
  margin-top: 3px;
}

/* 参数设置区 */
.params-section {
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  border: 1px solid rgba(124, 92, 240, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.params-header {
  margin-bottom: 12px;
}
.params-header h4 {
  font-size: 12px; color: #7c5cf0; font-weight: 600;
  letter-spacing: 0.05em;
}
.params-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.param-item {
  display: flex; flex-direction: column; gap: 4px;
}
.param-item label {
  font-size: 11px; color: #6b7280; font-weight: 500;
}
.param-full {
  margin-top: 10px;
  display: flex; flex-direction: column; gap: 4px;
}
.param-full label {
  font-size: 11px; color: #6b7280; font-weight: 500;
}

.progress-bar {
  padding: 8px 0;
}
.progress-text {
  font-size: 12px; color: #6b7280;
  margin-top: 6px; text-align: center;
}

.compose-actions {
  margin-top: auto; padding-top: 10px;
  border-top: 1px solid rgba(124, 92, 240, 0.1);
}

.empty-state { text-align: center; padding: 40px 0; color: var(--text-muted); }
.empty-state span { font-size: 40px; }
.empty-state p { margin-top: 8px; font-size: 13px; }
</style>
