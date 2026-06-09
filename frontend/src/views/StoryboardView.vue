<template>
  <div class="storyboard-layout">
    <!-- 左侧：分镜列表 -->
    <div class="left-panel">
      <!-- 工具栏 -->
      <div class="panel-toolbar">
        <el-button type="primary" @click="handleAIGenerate" :loading="generating" :icon="MagicStick">
          {{ generating ? 'AI拆解分镜中...' : 'AI自动拆解分镜' }}
        </el-button>
        <el-button @click="showAddDialog = true" :icon="Plus">手动添加镜头</el-button>
        <el-button plain @click="addScene">+ 新建场次</el-button>

        <el-select v-model="selectedEpisodeId" placeholder="全部集" clearable style="width:180px;" @change="onEpisodeFilter">
          <el-option label="全部集" :value="null" />
          <el-option v-for="ep in episodes" :key="ep.id" :label="ep.title || '第'+ep.episode_number+'集'" :value="ep.id" />
        </el-select>

        <span class="toolbar-info" v-if="storyboards.length > 0">
          共{{ episodes.length }}集 · {{ totalFields }}场 · {{ visibleStoryboards.length }}个镜头
        </span>

        <el-button-group v-if="storyboards.length > 0" style="margin-left: auto;">
          <el-button size="small" @click="batchGenerateImages" :loading="batchImgLoading" plain>批量生图</el-button>
          <el-button size="small" @click="batchGenerateVideos" :loading="batchVidLoading" plain>批量生视频</el-button>
        </el-button-group>
      </div>

      <!-- 分镜列表 -->
      <div v-loading="loading" class="episodes-container">
        <el-empty v-if="!loading && storyboards.length === 0" description="暂无分镜，可从剧本AI自动拆解或手动添加">
          <el-button type="primary" @click="handleAIGenerate">AI自动拆解</el-button>
        </el-empty>

        <div v-if="noEpisodeStoryboards.length > 0" class="episode-section">
          <div class="episode-header" @click="toggleEpisode(-1)">
            <span class="episode-toggle">{{ expandedEpisodes.has(-1) ? '▼' : '▶' }}</span>
            <span class="episode-title">未分配集</span>
            <span class="episode-meta">{{ noEpisodeStoryboards.length }}个镜头 · {{ noEpisodeFields }}场</span>
          </div>
          <div v-show="expandedEpisodes.has(-1)">
            <div class="scene-groups">
              <div v-for="group in getEpisodeSceneGroups(noEpisodeStoryboards)" :key="'-1-'+group.sceneNumber" class="scene-group">
                <div class="scene-header" @click="toggleScene('-1-'+group.sceneNumber)">
                  <span class="scene-toggle">{{ expandedScenes.has('-1-'+group.sceneNumber) ? '▼' : '▶' }}</span>
                  <span class="scene-title">第{{ group.sceneNumber }}场</span>
                  <span class="scene-meta">{{ group.items.length }}个镜头 · {{ group.totalDuration.toFixed(1) }}s</span>
                </div>
                <div v-show="expandedScenes.has('-1-'+group.sceneNumber)" class="scene-storyboards">
                  <div v-for="(sb, idx) in group.items" :key="sb.id"
                    class="storyboard-item card-glow"
                    :class="{ 'sb-selected': selectedSb?.id === sb.id }"
                    @click="selectForVideo(sb)">
                    <div class="sb-index">#{{ sb.scene_index || (idx + 1) }}</div>
                    <div class="sb-image">
                      <img v-if="sb.image_path" :src="getImageUrl(sb.image_path)" alt="" />
                      <div v-else class="image-placeholder"><span>🎞️</span></div>
                      <el-tag size="small" class="shot-type-tag">{{ sb.shot_type }}</el-tag>
                      <span class="duration-badge">⏱ {{ sb.duration }}s</span>
                    </div>
                    <div class="sb-info">
                      <h4 class="sb-desc">{{ sb.description || '无描述' }}</h4>
                      <div v-if="sb.character_ids?.length > 0" class="sb-chars">{{ sb.character_ids.map(c => c.name || c).join('、') }}</div>
                      <div v-if="sb.dialogue_text" class="sb-dialogue">{{ sb.dialogue_text.substring(0, 80) }}</div>
                      <div class="sb-actions" @click.stop>
                        <el-button size="small" type="primary" plain @click="generateSingleImage(sb)" :loading="sb._genImgLoading">生图</el-button>
                        <el-tooltip :content="sb.image_path ? '' : '需先生成图片'" :disabled="!!sb.image_path">
                          <el-button size="small" plain @click="selectForVideo(sb)"
                            :disabled="!sb.image_path">
                            {{ sb.video_path ? '重新生成' : '生视频' }}
                          </el-button>
                        </el-tooltip>
                        <el-button size="small" plain @click="editSb(sb)">编辑</el-button>
                        <el-button size="small" type="danger" plain @click="deleteSb(sb)">删除</el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-for="ep in displayedEpisodeGroups" :key="ep.id" class="episode-section">
          <div class="episode-header" @click="toggleEpisode(ep.id)">
            <span class="episode-toggle">{{ expandedEpisodes.has(ep.id) ? '▼' : '▶' }}</span>
            <span class="episode-title">{{ ep.title || '第'+ep.episode_number+'集' }}</span>
            <span class="episode-meta">{{ ep.items.length }}个镜头 · {{ ep.fieldCount }}场</span>
            <div class="episode-actions" @click.stop>
              <el-button size="small" plain @click="addToEpisode(ep.id)">+ 镜头</el-button>
            </div>
          </div>
          <div v-show="expandedEpisodes.has(ep.id)">
            <div class="scene-groups">
              <div v-for="group in getEpisodeSceneGroups(ep.items)" :key="'e'+ep.id+'-s'+group.sceneNumber" class="scene-group">
                <div class="scene-header" @click="toggleScene(ep.id+'-'+group.sceneNumber)">
                  <span class="scene-toggle">{{ expandedScenes.has(ep.id+'-'+group.sceneNumber) ? '▼' : '▶' }}</span>
                  <span class="scene-title">第{{ group.sceneNumber }}场</span>
                  <span class="scene-meta">{{ group.items.length }}个镜头 · {{ group.totalDuration.toFixed(1) }}s</span>
                  <el-button class="scene-add-btn" size="small" plain @click.stop="addToSceneInEpisode(ep.id, group.sceneNumber)">+ 镜头</el-button>
                </div>
                <div v-show="expandedScenes.has(ep.id+'-'+group.sceneNumber)" class="scene-storyboards">
                  <div v-for="(sb, idx) in group.items" :key="sb.id"
                    class="storyboard-item card-glow"
                    :class="{ 'sb-selected': selectedSb?.id === sb.id }"
                    @click="selectForVideo(sb)">
                    <div class="sb-index">#{{ sb.scene_index || (idx + 1) }}</div>
                    <div class="sb-image">
                      <img v-if="sb.image_path" :src="getImageUrl(sb.image_path)" alt="" />
                      <div v-else class="image-placeholder"><span>🎞️</span></div>
                      <el-tag size="small" class="shot-type-tag">{{ sb.shot_type }}</el-tag>
                      <span class="duration-badge">⏱ {{ sb.duration }}s</span>
                    </div>
                    <div class="sb-info">
                      <h4 class="sb-desc">{{ sb.description || '无描述' }}</h4>
                      <div v-if="sb.character_ids?.length > 0" class="sb-chars">{{ sb.character_ids.map(c => c.name || c).join('、') }}</div>
                      <div v-if="sb.dialogue_text" class="sb-dialogue">{{ sb.dialogue_text.substring(0, 80) }}</div>
                      <div class="sb-actions" @click.stop>
                        <el-button size="small" type="primary" plain @click="generateSingleImage(sb)" :loading="sb._genImgLoading">生图</el-button>
                        <el-tooltip :content="sb.image_path ? '' : '需先生成图片'" :disabled="!!sb.image_path">
                          <el-button size="small" plain @click="selectForVideo(sb)"
                            :disabled="!sb.image_path">
                            {{ sb.video_path ? '重新生成' : '生视频' }}
                          </el-button>
                        </el-tooltip>
                        <el-button size="small" plain @click="editSb(sb)">编辑</el-button>
                        <el-button size="small" type="danger" plain @click="deleteSb(sb)">删除</el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <el-empty v-if="ep.items.length === 0" description="该集暂无分镜" :image-size="60" />
            </div>
          </div>
        </div>
      </div>
      <!-- 时间线条（批量预览） -->
      <div v-if="visibleStoryboards.length > 0" class="timeline-strip">
        <div class="timeline-strip-header">
          <span class="ts-label">🎞️ 时间线</span>
          <span class="ts-total">{{ formatTimelineTime(timelineTotalDuration) }} · {{ visibleStoryboards.length }}镜</span>
          <div class="ts-actions">
            <el-button size="small" type="primary" plain @click="batchGenerateAllVideos" :loading="batchGenAllLoading">
              📹 批量生成 ({{ visibleStoryboards.filter(s => !s.video_path).length }})
            </el-button>
            <el-button size="small" type="success" plain @click="handleComposeExisting" :loading="composeLoading"
              :disabled="visibleStoryboards.filter(s => s.video_path).length < 2">
              🎬 合成导出 ({{ visibleStoryboards.filter(s => s.video_path).length }})
            </el-button>
          </div>
        </div>
        <div class="timeline-track-h">
          <template v-for="(sb, i) in visibleStoryboards" :key="'tl-'+sb.id">
            <div
              class="timeline-clip"
              :class="{ active: selectedSb?.id === sb.id, has_video: !!sb.video_path }"
              :style="{ width: ((sb.duration||3) / timelineTotalDuration * 100) + '%' }"
              @click="selectForVideo(sb)"
              :title="`#${i+1} ${sb.shot_type} ${(sb.duration||3).toFixed(1)}s`"
            >
              <img v-if="sb.image_path" :src="getImageUrl(sb.image_path)" class="tc-thumb" />
              <div v-else class="tc-placeholder">{{ i+1 }}</div>
              <span class="tc-label">#{{ i+1 }}</span>
              <span v-if="sb.video_path" class="tc-badge">✓</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 右侧：视频生成预览面板 -->
    <div v-if="selectedSb" class="right-panel">
      <div class="preview-header">
        <h3>#{{ selectedSb.scene_index }} 视频生成</h3>
        <el-button size="small" plain @click="selectedSb = null">✕ 关闭</el-button>
      </div>

      <!-- 预览区 -->
      <div class="preview-media">
        <video v-if="selectedSb.video_path" :src="getImageUrl(selectedSb.video_path)" controls class="preview-video" />
        <img v-else-if="selectedSb.image_path" :src="getImageUrl(selectedSb.image_path)" class="preview-image" alt="" />
        <div v-else class="preview-placeholder">暂无图片/视频</div>
      </div>

      <!-- 分镜信息 -->
      <div class="preview-meta">
        <div class="meta-row">
          <span class="meta-label">镜头类型</span>
          <el-tag size="small">{{ selectedSb.shot_type }}</el-tag>
        </div>
        <div class="meta-row">
          <span class="meta-label">时长</span>
          <span>{{ selectedSb.duration }}s</span>
        </div>
        <div class="meta-row" v-if="selectedSb.character_ids?.length">
          <span class="meta-label">出场角色</span>
          <span>{{ selectedSb.character_ids.map(c => c.name || c).join('、') }}</span>
        </div>
        <div class="meta-row" v-if="selectedSb.dialogue_text">
          <span class="meta-label">对白</span>
          <span class="meta-dialogue">{{ selectedSb.dialogue_text }}</span>
        </div>
      </div>

      <!-- 视频提示词（系统自动生成） -->
      <div class="prompt-section">
        <div class="section-label">
          视频提示词（系统自动生成）
          <el-button size="small" text @click="fetchVideoPrompt()" :loading="promptLoading">刷新</el-button>
        </div>
        <el-input
          v-model="videoPrompt"
          type="textarea"
          :rows="4"
          readonly
          placeholder="点击下方「刷新提示词」获取 AI 自动生成的视频提示词..."
        />
      </div>

      <!-- 视频参数配置 -->
      <div class="config-section">
        <div class="section-label">视频参数</div>
        <div class="config-row">
          <label class="config-label">模型</label>
          <el-select v-model="videoModel" style="flex:1" @change="onModelChange">
            <el-option label="Doubao Seedance 2.0" value="doubao-seedance-2.0" />
            <el-option label="Seedance 1.5 Pro I2V" value="seedance-v1.5-pro-i2v" />
            <el-option label="Seedance 1.5 Pro T2V" value="seedance-v1.5-pro-t2v" />
            <el-option label="Kling 1.6 T2V" value="kling-v1.6-t2v" />
          </el-select>
        </div>
        <div class="config-row">
          <label class="config-label">画质</label>
          <el-select v-model="videoMode_quality" style="flex:1">
            <el-option label="标准" value="Standard" />
            <el-option label="快速" value="std" />
            <el-option label="专业 (Seedance)" value="pro" />
          </el-select>
        </div>
        <div class="config-row">
          <label class="config-label">时长</label>
          <el-select v-model="videoDuration" style="flex:1">
            <el-option label="5秒" :value="5" />
            <el-option label="10秒" :value="10" />
          </el-select>
        </div>
        <div class="config-row">
          <label class="config-label">运镜</label>
          <el-select v-model="videoMotion" style="flex:1">
            <el-option label="对话场景" value="dialogue" />
            <el-option label="缓慢推进" value="slow_zoom" />
            <el-option label="横移左→右" value="pan_right" />
            <el-option label="横移右→左" value="pan_left" />
            <el-option label="静态镜头" value="static" />
            <el-option label="戏剧张力" value="dramatic" />
          </el-select>
        </div>
        <div class="config-row config-row-full">
          <label class="config-label">负面词</label>
          <el-input v-model="videoNegativePrompt" size="small" placeholder="不想出现的内容（可选）" style="flex:1" />
        </div>
      </div>

      <!-- 生成按钮 -->
      <el-button type="primary" class="generate-btn" @click="handleGenerateVideo"
        :loading="selectedSb._genVidLoading">
        {{ selectedSb.video_path ? '重新生成视频' : '生成视频' }}
      </el-button>
    </div>

    <!-- 空状态提示（未选中分镜时） -->
    <div v-else class="right-panel right-panel-empty">
      <div class="empty-hint">
        <span style="font-size:32px">🎬</span>
        <p>点击左侧分镜卡片<br/>配置视频生成参数</p>
      </div>
    </div>

    <!-- 添加/编辑弹窗 -->
    <el-dialog v-model="showAddDialog" :title="editingSb ? '编辑分镜' : '添加分镜'" width="580px">
      <el-form :model="sbForm" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="所属集">
              <el-select v-model="sbForm.episode_id" clearable placeholder="选择集" style="width:100%">
                <el-option v-for="ep in episodes" :key="ep.id" :label="ep.title || '第'+ep.episode_number+'集'" :value="ep.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属场次">
              <el-input-number v-model="sbForm.scene_number" :min="1" :step="1" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="镜头序号">
          <el-input-number v-model="sbForm.scene_index" :min="0" :step="1" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="镜头类型">
          <el-select v-model="sbForm.shot_type" style="width: 100%;">
            <el-option label="全景/远景" value="全景" />
            <el-option label="全身镜头" value="全身" />
            <el-option label="中景（默认）" value="中景" />
            <el-option label="近景" value="近景" />
            <el-option label="特写" value="特写" />
          </el-select>
        </el-form-item>
        <el-form-item label="画面描述">
          <el-input v-model="sbForm.description" type="textarea" :rows="2" placeholder="描述这个镜头的画面内容..." />
        </el-form-item>
        <el-form-item label="绘图提示词">
          <el-input v-model="sbForm.prompt_text" type="textarea" :rows="3" placeholder="英文提示词，用于AI生成此镜头的图片..." />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="时长(秒)">
              <el-input-number v-model="sbForm.duration" :min="0.5" :max="30" :step="0.5" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="出场角色">
              <el-select v-model="sbForm.character_ids" multiple filterable placeholder="选择角色" style="width: 100%;"
                value-key="id">
                <el-option v-for="c in allCharacters" :key="c.id" :label="c.name" :value="{ id: c.id, name: c.name }" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="对白内容">
          <el-input v-model="sbForm.dialogue_text" placeholder="该镜头的对白（如有）..." />
        </el-form-item>
        <el-form-item v-if="sbForm.character_ids.length > 0" label="角色动作">
          <div class="char-actions-editor">
            <div v-for="(ca, idx) in sbForm.character_actions" :key="ca.character_id || idx" class="char-action-item">
              <div class="char-action-header">
                <span class="char-action-name">{{ ca.name || ca.character_name || '角色'+(idx+1) }}</span>
                <el-button size="small" type="danger" plain @click="removeCharAction(idx)">移除</el-button>
              </div>
              <el-row :gutter="8">
                <el-col :span="8">
                  <el-select v-model="ca.role" placeholder="角色标签" size="small" style="width:100%">
                    <el-option label="主角(主位)" value="lead" />
                    <el-option label="配角" value="support" />
                    <el-option label="背景" value="extra" />
                  </el-select>
                </el-col>
                <el-col :span="8">
                  <el-input v-model="ca.position" placeholder="站位(如: 桌边右侧)" size="small" />
                </el-col>
                <el-col :span="8">
                  <el-input v-model="ca.expression" placeholder="表情(如: 愤怒)" size="small" />
                </el-col>
              </el-row>
              <el-row :gutter="8" style="margin-top:6px">
                <el-col :span="18">
                  <el-input v-model="ca.action" placeholder="动作描述(如: 指着屏幕)" size="small" />
                </el-col>
                <el-col :span="6">
                  <el-checkbox v-model="ca.is_speaking" size="small">正在说话</el-checkbox>
                </el-col>
              </el-row>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAddEdit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { MagicStick, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()

const storyboards = ref([])
const episodes = ref([])
const loading = ref(false)
const generating = ref(false)
const showAddDialog = ref(false)
const editingSb = ref(null)
const batchImgLoading = ref(false)
const batchVidLoading = ref(false)

const selectedSb = ref(null)
const videoPrompt = ref('')
const videoModel = ref('doubao-seedance-2.0')
const videoMode_quality = ref('Standard')
const videoDuration = ref(5)
const videoMotion = ref('dialogue')
const videoNegativePrompt = ref('')
const promptLoading = ref(false)
const batchGenAllLoading = ref(false)
const composeLoading = ref(false)

const expandedEpisodes = reactive(new Set())
const expandedScenes = reactive(new Set())
const selectedEpisodeId = ref(null)

const sbForm = ref({
  episode_id: null,
  scene_number: 1,
  scene_index: 0,
  shot_type: '中景', description: '', prompt_text: '',
  duration: 3.0, character_ids: [], character_actions: [], dialogue_text: '',
})

const allCharacters = ref([])

// 不分集的镜头
const noEpisodeStoryboards = computed(() =>
  storyboards.value.filter(s => !s.episode_id)
)

const noEpisodeFields = computed(() => {
  const scenes = new Set(noEpisodeStoryboards.value.map(s => s.scene_number || 1))
  return scenes.size
})

const episodeGroups = computed(() => {
  const epMap = new Map()
  for (const sb of storyboards.value) {
    if (!sb.episode_id) continue
    const eid = sb.episode_id
    if (!epMap.has(eid)) {
      const ep = episodes.value.find(e => e.id === eid) || { id: eid, episode_number: eid, title: '第'+eid+'集' }
      epMap.set(eid, { ...ep, items: [] })
    }
    epMap.get(eid).items.push(sb)
  }
  return Array.from(epMap.values()).sort((a, b) => a.episode_number - b.episode_number)
})

const displayedEpisodeGroups = computed(() => {
  if (!selectedEpisodeId.value) return episodeGroups.value
  return episodeGroups.value.filter(g => g.id === selectedEpisodeId.value)
})

const visibleStoryboards = computed(() => {
  return displayedEpisodeGroups.value.flatMap(g => g.items)
})

const totalFields = computed(() => {
  const scenes = new Set(storyboards.value.map(s => `${s.episode_id || -1}-${s.scene_number || 1}`))
  return scenes.size
})

// 时间线相关
const timelineTotalDuration = computed(() =>
  visibleStoryboards.value.reduce((s, sb) => s + (sb.duration || 3), 0)
)
function formatTimelineTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2,'0')}` : `${s}s`
}

function getEpisodeSceneGroups(items) {
  const groups = new Map()
  for (const sb of items) {
    const sn = sb.scene_number || 1
    if (!groups.has(sn)) {
      groups.set(sn, { sceneNumber: sn, items: [], totalDuration: 0 })
    }
    const g = groups.get(sn)
    g.items.push(sb)
    g.totalDuration += (sb.duration || 0)
  }
  return Array.from(groups.values()).sort((a, b) => a.sceneNumber - b.sceneNumber)
}

function onEpisodeFilter() { autoExpand() }

function toggleEpisode(epId) {
  if (expandedEpisodes.has(epId)) expandedEpisodes.delete(epId)
  else expandedEpisodes.add(epId)
}

function toggleScene(key) {
  if (expandedScenes.has(key)) expandedScenes.delete(key)
  else expandedScenes.add(key)
}

function autoExpand() {
  expandedEpisodes.clear()
  expandedScenes.clear()
  const groups = displayedEpisodeGroups.value
  for (const ep of groups) {
    expandedEpisodes.add(ep.id)
    for (const group of getEpisodeSceneGroups(ep.items)) {
      expandedScenes.add(ep.id+'-'+group.sceneNumber)
    }
  }
  if (noEpisodeStoryboards.value.length > 0) {
    expandedEpisodes.add(-1)
    for (const group of getEpisodeSceneGroups(noEpisodeStoryboards.value)) {
      expandedScenes.add('-1-'+group.sceneNumber)
    }
  }
}

onMounted(async () => {
  await Promise.all([loadStoryboards(), loadCharacters(), loadEpisodes()])
  autoExpand()
})

async function loadStoryboards() {
  loading.value = true
  try {
    const res = await fetch(`/api/projects/${route.params.id}/storyboards`).then(r => r.json())
    storyboards.value = res.data || []
    // 如果之前选中的分镜仍在列表中，刷新其引用
    if (selectedSb.value) {
      const found = storyboards.value.find(s => s.id === selectedSb.value.id)
      if (found) selectedSb.value = found
    }
    autoExpand()
  } finally { loading.value = false }
}

async function loadCharacters() {
  try {
    const res = await fetch(`/api/projects/${route.params.id}/characters`).then(r => r.json())
    allCharacters.value = res.data || []
  } catch {}
}

async function loadEpisodes() {
  try {
    const res = await fetch(`/api/projects/${route.params.id}/episodes`).then(r => r.json())
    episodes.value = res.data || []
  } catch {}
}

// === 右侧面板：视频生成预览 ===

function selectForVideo(sb) {
  selectedSb.value = sb
  // 加载已保存的参数
  try {
    const vp = typeof sb.video_params === 'string' ? JSON.parse(sb.video_params) : (sb.video_params || {})
    videoModel.value = vp.model || 'doubao-seedance-2.0'
    videoMode_quality.value = vp.mode || 'Standard'
    videoDuration.value = vp.duration || sb.duration || 5
    videoMotion.value = vp.motion || 'dialogue'
    videoNegativePrompt.value = vp.negative_prompt || ''
  } catch {
    videoModel.value = 'doubao-seedance-2.0'
    videoMode_quality.value = 'Standard'
    videoDuration.value = sb.duration || 5
    videoMotion.value = 'dialogue'
    videoNegativePrompt.value = ''
  }
  fetchVideoPrompt()
}

async function fetchVideoPrompt() {
  const sb = selectedSb.value
  if (!sb) return
  promptLoading.value = true
  try {
    const params = new URLSearchParams({
      duration: videoDuration.value,
      motion: videoMotion.value,
      model: videoModel.value,
    })
    const res = await fetch(`/api/storyboards/${sb.id}/video-prompt?${params}`).then(r => r.json())
    if (res.code === 0) {
      videoPrompt.value = res.data.prompt
    } else {
      videoPrompt.value = ''
      ElMessage.warning('未能加载提示词')
    }
  } catch(e) {
    videoPrompt.value = ''
    ElMessage.error('加载提示词失败')
  } finally { promptLoading.value = false }
}

async function handleGenerateVideo() {
  const sb = selectedSb.value
  if (!sb) return
  if (!sb.image_path) { ElMessage.warning('需先生成图片'); return }

  sb._genVidLoading = true
  sb._genVidModel = videoModel.value
  try {
    const res = await fetch(`/api/storyboards/${sb.id}/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: videoModel.value,
        mode: videoMode_quality.value,
        duration: videoDuration.value,
        motion: videoMotion.value,
        negative_prompt: videoNegativePrompt.value || undefined,
      }),
    }).then(r => r.json())
    if (res.code === 0) {
      if (res.data?.fallback) {
        ElMessage.warning(res.data?.message || '视频生成失败')
      } else {
        ElMessage.success('视频生成任务已启动')
        // 轮询刷新
        pollSingleVideo(sb)
      }
      await loadStoryboards()
    } else {
      throw new Error(res.error)
    }
  } catch(e) { ElMessage.error(`生成失败: ${e.message}`) }
  finally { sb._genVidLoading = false }
}

// 轮询单个分镜的视频生成结果
function pollSingleVideo(sb) {
  const timer = setInterval(async () => {
    await loadStoryboards()
    const updated = storyboards.value.find(s => s.id === sb.id)
    if (updated?.video_path) {
      clearInterval(timer)
      sb._genVidLoading = false
      selectedSb.value = updated
      ElMessage.success('视频生成完成！')
    }
  }, 5000)
  setTimeout(() => {
    clearInterval(timer)
    if (sb._genVidLoading) { sb._genVidLoading = false }
  }, 360000)
}

// 批量生成所有分镜视频
async function batchGenerateAllVideos() {
  const pending = visibleStoryboards.value.filter(s => !s.video_path && s.image_path)
  if (pending.length === 0) { ElMessage.info('没有待生成的分镜'); return }
  batchGenAllLoading.value = true
  try {
    const res = await fetch('/api/videos/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyboard_ids: pending.map(s => s.id),
        concurrency: 2,
      }),
    }).then(r => r.json())
    if (res.code === 0) {
      ElMessage.success(res.data?.message || `已启动 ${pending.length} 个视频生成任务`)
      // 轮询直到全部完成
      const pollTimer = setInterval(async () => {
        await loadStoryboards()
        const remaining = visibleStoryboards.value.filter(s => !s.video_path).length
        if (remaining === 0) {
          clearInterval(pollTimer)
          batchGenAllLoading.value = false
          ElMessage.success('所有视频生成完成！')
        }
      }, 5000)
    } else {
      throw new Error(res.error || '启动失败')
    }
  } catch(e) {
    ElMessage.error(`批量生成失败: ${e.message}`)
    batchGenAllLoading.value = false
  }
}

// 合成已有视频
async function handleComposeExisting() {
  const videos = visibleStoryboards.value.filter(s => s.video_path)
  if (videos.length < 2) { ElMessage.warning('至少需要2个已生成的视频'); return }
  composeLoading.value = true
  try {
    const res = await fetch('/api/videos/compose-existing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: route.params.id,
        storyboard_ids: videos.map(s => s.id),
        options: {},
      }),
    }).then(r => r.json())
    if (res.code === 0 && res.data?.task_id) {
      ElMessage.success(res.data.message || '合成任务已启动')
      // 简单轮询
      const pollTimer = setInterval(async () => {
        const taskRes = await fetch(`/api/tasks/${res.data.task_id}`).then(r => r.json())
        if (taskRes.code === 0 && taskRes.data?.status === 'completed') {
          clearInterval(pollTimer)
          composeLoading.value = false
          ElMessage.success('视频合成完成！')
        } else if (taskRes.data?.status === 'failed') {
          clearInterval(pollTimer)
          composeLoading.value = false
          ElMessage.error('合成失败')
        }
      }, 3000)
      setTimeout(() => { clearInterval(pollTimer); composeLoading.value = false }, 300000)
    } else {
      throw new Error(res.error || '启动失败')
    }
  } catch(e) {
    ElMessage.error(`合成失败: ${e.message}`)
    composeLoading.value = false
  }
}

// 监听参数变化，自动刷新提示词（防抖）
let promptTimer = null
watch([videoModel, videoDuration, videoMotion, videoMode_quality, videoNegativePrompt], () => {
  if (!selectedSb.value) return
  clearTimeout(promptTimer)
  promptTimer = setTimeout(() => fetchVideoPrompt(), 500)
})

// 自动保存参数到分镜（debounce 1.5s）
let saveParamsTimer = null
watch([videoModel, videoDuration, videoMotion, videoMode_quality, videoNegativePrompt], () => {
  if (!selectedSb.value) return
  clearTimeout(saveParamsTimer)
  saveParamsTimer = setTimeout(async () => {
    try {
      await fetch(`/api/storyboards/${selectedSb.value.id}/video-params`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: videoModel.value,
          motion: videoMotion.value,
          mode: videoMode_quality.value,
          duration: videoDuration.value,
          negative_prompt: videoNegativePrompt.value || undefined,
        }),
      })
      // 同步到本地对象
      selectedSb.value.video_params = {
        model: videoModel.value,
        motion: videoMotion.value,
        mode: videoMode_quality.value,
        duration: videoDuration.value,
        negative_prompt: videoNegativePrompt.value || '',
      }
    } catch (e) { console.warn('自动保存视频参数失败:', e) }
  }, 1500)
})

// 切换模型时自动调整画质
function onModelChange(model) {
  if (model?.includes('seedance')) {
    videoMode_quality.value = 'pro'
  } else if (model === 'kling-v1.6-t2v') {
    videoMode_quality.value = 'Standard'
  }
}

// === 原有函数 ===

function addToEpisode(epId) {
  const epItems = episodeGroups.value.find(g => g.id === epId)?.items || []
  const maxScene = epItems.length > 0 ? Math.max(...epItems.map(s => s.scene_number || 1)) : 0
  const nextScene = maxScene + 1
  const existingInScene = epItems.filter(s => (s.scene_number || 1) === nextScene)
  const nextIdx = existingInScene.length + 1
  sbForm.value = {
    episode_id: epId, scene_number: nextScene, scene_index: nextIdx,
    shot_type: '中景', description: '', prompt_text: '',
    duration: 3.0, character_ids: [], character_actions: [], dialogue_text: '',
  }
  editingSb.value = null
  showAddDialog.value = true
}

function addToSceneInEpisode(epId, sceneNumber) {
  const epItems = episodeGroups.value.find(g => g.id === epId)?.items || []
  const existingInScene = epItems.filter(s => (s.scene_number || 1) === sceneNumber)
  const nextIdx = existingInScene.length > 0
    ? Math.max(...existingInScene.map(s => s.scene_index || 0)) + 1 : 1
  sbForm.value = {
    episode_id: epId, scene_number: sceneNumber, scene_index: nextIdx,
    shot_type: '中景', description: '', prompt_text: '',
    duration: 3.0, character_ids: [], character_actions: [], dialogue_text: '',
  }
  editingSb.value = null
  showAddDialog.value = true
}

function addScene() {
  const lastEp = episodeGroups.value[episodeGroups.value.length - 1]
  if (lastEp) { addToEpisode(lastEp.id); return }
  sbForm.value = {
    episode_id: null, scene_number: 1, scene_index: 1,
    shot_type: '中景', description: '', prompt_text: '',
    duration: 3.0, character_ids: [], character_actions: [], dialogue_text: '',
  }
  editingSb.value = null
  showAddDialog.value = true
}

async function handleAIGenerate() {
  generating.value = true
  try {
    const res = await fetch(`/api/projects/${route.params.id}/storyboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ai_generate' }),
    }).then(r => r.json())
    await loadStoryboards()
    await loadEpisodes()
    autoExpand()
    ElMessage.success(`成功生成${res.data?.length || storyboards.value.length}个分镜`)
  } catch(e) { ElMessage.error('生成分镜失败，请先生成剧本') }
  finally { generating.value = false }
}

async function generateSingleImage(sb) {
  sb._genImgLoading = true
  try {
    const res = await fetch(`/api/storyboards/${sb.id}/generate-image`, { method: 'POST' }).then(r => r.json())
    if (res.code === 0) ElMessage.success('图片生成成功')
    else throw new Error(res.error)
    await loadStoryboards()
  } catch(e) { ElMessage.error(`生成失败: ${e.message}`) }
  finally { sb._genImgLoading = false }
}

async function batchGenerateImages() {
  batchImgLoading.value = true
  let success = 0
  for (const sb of visibleStoryboards.value) {
    if (!sb.image_path) {
      try {
        const res = await fetch(`/api/storyboards/${sb.id}/generate-image`, { method: 'POST' }).then(r => r.json())
        if (res.code === 0) success++
      } catch {}
    }
  }
  if (success > 0) await loadStoryboards()
  ElMessage.success(`批量生图完成: ${success}/${visibleStoryboards.value.length}`)
  batchImgLoading.value = false
}

async function batchGenerateVideos() {
  batchVidLoading.value = true
  const hasImages = visibleStoryboards.value.filter(s => s.image_path)
  let success = 0
  for (const sb of hasImages) {
    if (!sb.video_path) {
      try {
        await fetch(`/api/storyboards/${sb.id}/generate-video`, { method: 'POST' }).then(r => r.json())
        success++
      } catch {}
    }
  }
  if (success > 0) await loadStoryboards()
  ElMessage.success(`批量生成视频完成: ${success}/${hasImages.length}`)
  batchVidLoading.value = false
}

function getImageUrl(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : `/static${path}`
}

function editSb(sb) {
  editingSb.value = sb
  sbForm.value = {
    episode_id: sb.episode_id || null,
    scene_number: sb.scene_number || 1,
    scene_index: sb.scene_index || 0,
    shot_type: sb.shot_type, description: sb.description,
    prompt_text: sb.prompt_text, duration: sb.duration,
    character_ids: (sb.character_ids || []).map(c => (typeof c === 'object' ? c : { id: c, name: String(c) })),
    character_actions: sb.character_actions || [],
    dialogue_text: sb.dialogue_text,
  }
  showAddDialog.value = true
}

async function handleAddEdit() {
  const body = {
    ...sbForm.value,
    scene_index: editingSb.value
      ? sbForm.value.scene_index
      : sbForm.value.scene_index || (storyboards.value.filter(s => (s.scene_number || 1) === sbForm.value.scene_number).length + 1),
    character_ids: sbForm.value.character_ids.map(c => c.id),
    character_actions: sbForm.value.character_actions || [],
  }

  try {
    if (editingSb.value) {
      await fetch(`/api/storyboards/${editingSb.value.id}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      })
    } else {
      await fetch(`/api/projects/${route.params.id}/storyboards`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ storyboard_data: body }),
      })
    }
    showAddDialog.value = false
    editingSb.value = null
    sbForm.value = { episode_id: null, scene_number: 1, scene_index: 0, shot_type:'中景', description:'', prompt_text:'', duration:3, character_ids:[], character_actions:[], dialogue_text:'' }
    await loadStoryboards()
  } catch(e) { ElMessage.error('操作失败') }
}

async function deleteSb(sb) {
  await ElMessageBox.confirm('确认删除此分镜？')
  await fetch(`/api/storyboards/${sb.id}`, { method: 'DELETE' })
  storyboards.value = storyboards.value.filter(s => s.id !== sb.id)
  if (selectedSb.value?.id === sb.id) selectedSb.value = null
}

// 监听角色选择变化
watch(() => sbForm.value.character_ids, (newChars) => {
  if (!newChars || newChars.length === 0) {
    sbForm.value.character_actions = []
    return
  }
  const existingActions = sbForm.value.character_actions || []
  for (const c of newChars) {
    if (!existingActions.find(a => a.character_id === c.id)) {
      existingActions.push({
        character_id: c.id, name: c.name || '',
        role: '', position: '', action: '', expression: '', is_speaking: false,
      })
    }
  }
  sbForm.value.character_actions = existingActions.filter(
    a => newChars.some(c => c.id === a.character_id)
  )
}, { deep: true })

function removeCharAction(idx) {
  const ca = sbForm.value.character_actions[idx]
  sbForm.value.character_actions.splice(idx, 1)
  sbForm.value.character_ids = sbForm.value.character_ids.filter(c => c.id !== ca.character_id)
}
</script>

<style scoped>
.storyboard-layout {
  display: flex;
  gap: 0;
  height: calc(100vh - 200px);
  min-height: 600px;
}

/* === 左侧面板 === */
.left-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-right: 16px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.toolbar-info { font-size: 13px; color: var(--text-muted); }

/* 场次分组 */
.scene-groups { display: flex; flex-direction: column; gap: 4px; }
.scene-group {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-card);
}
.scene-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: linear-gradient(135deg, rgba(124, 92, 240, 0.06), rgba(124, 92, 240, 0.02));
}
.scene-header:hover { background: linear-gradient(135deg, rgba(124, 92, 240, 0.1), rgba(124, 92, 240, 0.04)); }
.scene-toggle { font-size: 12px; color: var(--primary); width: 16px; flex-shrink: 0; }
.scene-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.scene-meta { font-size: 12px; color: var(--text-muted); flex: 1; }
.scene-add-btn { flex-shrink: 0; }
.scene-storyboards {
  padding: 10px;
  display: flex; flex-direction: column; gap: 10px;
  border-top: 1px solid var(--border-color);
}

/* 分镜卡片 */
.storyboard-item {
  display: flex;
  gap: 12px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  padding: 12px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}
.storyboard-item:hover { border-color: var(--border-color); }
.storyboard-item.sb-selected { border-color: var(--primary); background: rgba(124, 92, 240, 0.06); }

.sb-index {
  font-size: 22px; font-weight: 800;
  color: var(--primary); min-width: 32px; padding-top: 6px;
  text-align: center; opacity: 0.6;
}
.sb-image {
  width: 180px; height: 100px; position: relative;
  border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0;
  background: linear-gradient(135deg, #151c30, #1a2744);
}
.sb-image img { width: 100%; height: 100%; object-fit: cover; }
.image-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.3; font-size: 24px;
}
.shot-type-tag { position: absolute; top: 4px; left: 4px; }
.duration-badge {
  position: absolute; bottom: 4px; right: 4px;
  font-size: 11px; background: rgba(0,0,0,0.65); padding: 2px 6px;
  border-radius: 8px; color: #fff;
}
.sb-info { flex: 1; min-width: 0; }
.sb-desc { font-size: 13px; color: var(--text-primary); font-weight: 500; margin-bottom: 4px; line-height: 1.4; }
.sb-chars, .sb-dialogue { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.sb-dialogue { font-style: italic; }
.sb-actions { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }

/* 集级别样式 */
.episodes-container { display: flex; flex-direction: column; gap: 4px; }
.episode-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.episode-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; cursor: pointer; user-select: none;
  background: linear-gradient(135deg, rgba(124, 92, 240, 0.08), rgba(124, 92, 240, 0.02));
  border-bottom: 1px solid var(--border-color);
}
.episode-header:hover { background: linear-gradient(135deg, rgba(124, 92, 240, 0.14), rgba(124, 92, 240, 0.05)); }
.episode-toggle { font-size: 12px; color: var(--primary); width: 16px; flex-shrink: 0; }
.episode-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.episode-meta { font-size: 12px; color: var(--text-muted); flex: 1; }
.episode-actions { flex-shrink: 0; }
.episode-section .scene-groups { padding: 6px; }

/* === 右侧面板 === */
.right-panel {
  width: 400px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  margin-left: 12px;
  padding: 0 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.right-panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-hint {
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.8;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.preview-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-media {
  background: #0d1117;
  border-radius: var(--radius-md);
  overflow: hidden;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-media img, .preview-media video {
  width: 100%;
  max-height: 240px;
  object-fit: contain;
  display: block;
}
.preview-placeholder {
  color: var(--text-muted);
  font-size: 14px;
  padding: 60px 0;
}

.preview-meta {
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.meta-row {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
  align-items: flex-start;
}
.meta-row:last-child { margin-bottom: 0; }
.meta-label {
  color: var(--text-muted);
  min-width: 56px;
  flex-shrink: 0;
}
.meta-dialogue {
  font-style: italic;
  color: var(--text-secondary);
  flex: 1;
}

/* 提示词区域 */
.prompt-section, .config-section {
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.config-row:last-child { margin-bottom: 0; }
.config-label {
  font-size: 13px;
  color: var(--text-muted);
  width: 40px;
  flex-shrink: 0;
}

.generate-btn {
  width: 100%;
  height: 40px;
  font-size: 15px;
  font-weight: 600;
}

.config-row-full { margin-top: 2px; }

/* 时间线条 */
.timeline-strip {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 2px solid var(--border-color);
}
.timeline-strip-header {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 10px;
}
.ts-label { font-size: 12px; font-weight: 700; color: var(--primary); }
.ts-total { font-size: 11px; color: var(--text-muted); flex: 1; }
.ts-actions { display: flex; gap: 6px; }
.timeline-track-h {
  display: flex;
  height: 52px;
  background: linear-gradient(135deg, #f0f2f5 0%, #e4e7ed 100%);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);
}
.timeline-clip {
  height: 100%; position: relative;
  cursor: pointer; transition: all 0.15s;
  border-right: 2px solid #fff;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 36px;
}
.timeline-clip:hover { opacity: 0.9; transform: translateY(-1px); }
.timeline-clip.active { outline: 2px solid var(--primary); outline-offset: -2px; z-index: 1; }
.timeline-clip.has_video { border-bottom: 3px solid #10b981; }
.tc-thumb { width: 100%; height: 100%; object-fit: cover; }
.tc-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #e8ebf2 0%, #dde1eb 100%);
  font-size: 12px; color: #9ca3af; font-weight: 600;
}
.tc-label {
  position: absolute; bottom: 2px; left: 2px;
  font-size: 9px; color: #fff;
  background: rgba(0,0,0,0.55); padding: 1px 4px;
  border-radius: 3px;
}
.tc-badge {
  position: absolute; top: 2px; right: 2px;
  font-size: 9px; color: #10b981;
  background: rgba(255,255,255,0.9); padding: 1px 4px;
  border-radius: 3px; font-weight: 700;
}

/* 角色动作编辑器 */
.char-actions-editor { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.char-action-item {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.char-action-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.char-action-name {
  font-size: 13px; font-weight: 600; color: var(--primary);
}
</style>
