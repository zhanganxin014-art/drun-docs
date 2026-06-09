<template>
  <div class="settings-page animate-in">
    <h2 class="page-title">⚙️ 系统设置</h2>
    
    <el-tabs v-model="activeTab" type="border-card" class="settings-tabs">
      <!-- API配置 -->
      <el-tab-pane label="🔗 API配置" name="api">
        <div class="section">
          <h3 class="section-title">聚合API连接</h3>
          <p class="section-desc">配置你的聚合API Key，用于调用AI模型生剧本、图片、视频等</p>
          
          <el-form :model="apiForm" label-width="140px" class="api-form">
            <el-form-item label="API Base URL">
              <el-input v-model="apiForm.api_base_url" placeholder="https://your-api-gateway.com/v1" />
              <div class="form-tip">OpenAI兼容格式的API地址，如：https://api.openai.com/v1</div>
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="apiForm.api_key" type="password" show-password placeholder="sk-your-aggregated-api-key-here" />
              <div class="form-tip">你的聚合平台API密钥</div>
            </el-form-item>
            
            <!-- 测试连接 -->
            <el-form-item>
              <el-button type="primary" @click="handleTest" :loading="settingsStore.testing" :icon="Connection">
                {{ settingsStore.testing ? '测试中...' : '测试连接' }}
              </el-button>
              <el-tag v-if="settingsStore.connected" type="success" style="margin-left: 10px;">✅ 连接成功</el-tag>
              <el-tag v-if="connectError" type="danger" style="margin-left: 10px;">❌ {{ connectError }}</el-tag>
            </el-form-item>
          </el-form>

          <el-divider />
          
          <h3 class="section-title">AI模型选择</h3>
          <el-form :model="modelForm" label-width="140px" class="api-form">
            <el-form-item label="文本模型(LLM)">
              <el-select v-model="modelForm.text_model" filterable allow-create placeholder="gpt-4o" style="width: 100%;">
                <el-option label="GPT-4o" value="gpt-4o" />
                <el-option label="GPT-4o-mini" value="gpt-4o-mini" />
                <el-option label="Claude 3.5 Sonnet" value="claude-3-5-sonnet-20241022" />
                <el-option label="DeepSeek V3" value="deepseek-chat" />
                <el-option label="通义千问 Max" value="qwen-max" />
                <el-option label="GLM-4" value="glm-4" />
              </el-select>
            </el-form-item>
            <el-form-item label="图像模型(Image)">
              <el-select v-model="modelForm.image_model" filterable allow-create placeholder="gpt-image-1" style="width: 100%;">
                <el-option label="DALL·E 3 / GPT Image 1" value="gpt-image-1" />
                <el-option label="GPT Image (1024x1024)" value="dall-e-3" />
                <el-option label="Midjourney风格" value="midjourney" />
                <el-option label="Stable Diffusion" value="stable-diffusion" />
                <el-option label="通义万相" value="wanxiang" />
                <el-option label="Gemini Imagen" value="imagen" />
              </el-select>
            </el-form-item>
            <el-form-item label="视频模型(Video)">
              <el-select v-model="modelForm.video_model" filterable allow-create placeholder="doubao-seedance-2.0" style="width: 100%;">
                <el-option label="Doubao Seedance 2.0 (推荐 图生+文生)" value="doubao-seedance-2.0" />
                <el-option label="Seedance 1.5 Pro I2V (图生视频)" value="seedance-v1.5-pro-i2v" />
                <el-option label="Seedance 1.5 Pro T2V (文生视频)" value="seedance-v1.5-pro-t2v" />
                <el-option label="Kling 1.6 T2V (文生视频)" value="kling-v1.6-t2v" />
              </el-select>
              <div style="font-size: 12px; color: #909399; margin-top: 4px;">
                💡 Doubao Seedance 2.0 支持图生视频+文生视频（需IPS Union授权），接口: /v1/video/generations
              </div>
            </el-form-item>
            <el-form-item label="TTS语音模型">
              <el-select v-model="modelForm.tts_model" filterable allow-create placeholder="tts-1" style="width: 100%;">
                <el-option label="OpenAI TTS" value="tts-1" />
                <el-option label="Edge TTS (免费)" value="edge-tts" />
                <el-option label="MiniMax TTS" value="minimax-tts" />
                <el-option label="阿里 CosyVoice" value="cosyvoice" />
              </el-select>
            </el-form-item>
          </el-form>

          <el-form-item label-width="140px">
            <el-button type="primary" @click="handleSave" :loading="saving" round>
              💾 保存设置
            </el-button>
          </el-form-item>
        </div>
      </el-tab-pane>

      <!-- 默认参数 -->
      <el-tab-pane label="🎨 默认参数" name="defaults">
        <div class="section">
          <el-form :model="defaultForm" label-width="160px">
            <el-form-item label="默认图片尺寸">
              <el-radio-group v-model="defaultForm.image_size">
                <el-radio-button value="1344x768">横版 16:9</el-radio-button>
                <el-radio-button value="1024x576">小横版</el-radio-button>
                <el-radio-button value="768x1344">竖版 9:16</el-radio-button>
                <el-radio-button value="1024x1024">正方形</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="默认视频分辨率">
              <el-select v-model="defaultForm.video_resolution" style="width: 200px;">
                <el-option label="720p (1280x720)" value="1280x720" />
                <el-option label="1080p (1920x1080)" value="1920x1080" />
                <el-option label="竖屏 (720x1280)" value="720x1280" />
              </el-select>
            </el-form-item>
            <el-form-item label="默认镜头时长(秒)">
              <el-slider v-model="defaultForm.default_duration" :min="1" :max="10" :step="0.5" show-input />
            </el-form-item>
            <el-form-item label="默认绘图风格">
              <el-select v-model="defaultForm.default_style" style="width: 200px;">
                <el-option label="写实电影风" value="realistic" />
                <el-option label="动漫二次元" value="anime" />
                <el-option label="美漫风格" value="comic" />
                <el-option label="水彩插画风" value="watercolor" />
                <el-option label="暗黑悬疑" value="dark" />
                <el-option label="科幻未来" value="scifi" />
              </el-select>
            </el-form-item>
            <el-form-item label-width="160px">
              <el-button type="primary" @click="handleSaveDefaults" round>保存默认参数</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- Key管理 -->
      <el-tab-pane label="🔑 Key管理" name="keys">
        <div class="section">
          <h3 class="section-title">API Key 管理</h3>
          <p class="section-desc">管理各个平台的API密钥，支持添加、查看、删除</p>

          <div class="key-add-row">
            <el-input v-model="newKeyName" placeholder="平台名称，如：全迅云" style="width: 200px;" />
            <el-input v-model="newKeyValue" placeholder="sk-xxx..." type="password" show-password style="width: 360px;" />
            <el-button type="primary" @click="handleAddKey" :disabled="!newKeyName || !newKeyValue">
              添加
            </el-button>
          </div>

          <el-table :data="keyList" style="margin-top: 16px;" v-if="keyList.length">
            <el-table-column prop="name" label="平台" width="180" />
            <el-table-column prop="value" label="Key">
              <template #default="{ row }">
                <span style="font-family: monospace; font-size: 13px;">{{ maskKey(row.value) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row, $index }">
                <el-button text type="danger" size="small" @click="handleDeleteKey($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无Key，添加一个吧" :image-size="80" style="margin-top: 24px;" />
        </div>
      </el-tab-pane>

      <!-- 关于 -->
      <el-tab-pane label="ℹ️ 关于" name="about">
        <div class="about-section">
          <div class="about-logo">🎬</div>
          <h2>AI短剧制作平台</h2>
          <p class="version">Version 1.0.0</p>
          <el-divider />
          <div class="about-info">
            <p><strong>功能特性：</strong></p>
            <ul>
              <li>✅ AI一键生成短剧剧本（支持小说改编）</li>
              <li>✅ 智能角色提取与形象一致性管理</li>
              <li>✅ 自动拆解分镜 + AI生成分镜图</li>
              <li>✅ 角色图/场景图/分镜图批量生成</li>
              <li>✅ TTS智能配音 + 字幕自动生成</li>
              <li>✅ FFmpeg多段合成最终MP4</li>
              <li>✅ 聚合API对接（OpenAI兼容格式）</li>
            </ul>
          </div>
          <el-divider />
          <p class="tech-stack">
            <strong>技术栈：</strong> Vue3 + Element Plus + Node.js + Express + SQLite + FFmpeg
          </p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Connection, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
const activeTab = ref('api')
const saving = ref(false)
const connectError = ref('')

const apiForm = reactive({
  api_base_url: '',
  api_key: '',
})

const modelForm = reactive({
  text_model: 'gpt-4o-mini',
  image_model: 'gpt-image-1',
  video_model: 'doubao-seedance-2.0',
  tts_model: 'tts-1',
})

const defaultForm = reactive({
  image_size: '1344x768',
  video_resolution: '1280x720',
  default_duration: 3,
  default_style: 'realistic',
})

// Key 管理
const newKeyName = ref('')
const newKeyValue = ref('')
const keyList = ref([])
const KEY_SETTINGS_KEY = '__managed_keys__'

onMounted(async () => {
  await settingsStore.loadSettings()
  loadFromDB()
  loadKeys()
})

function loadFromDB() {
  // 从settings store加载数据到表单
  for (const [cat, group] of Object.entries(settingsStore.settings || {})) {
    for (const [key, value] of Object.entries(group)) {
      if (Object.hasOwnProperty.call(apiForm, key)) apiForm[key] = value
      if (Object.hasOwnProperty.call(modelForm, key)) modelForm[key] = value
      if (Object.hasOwnProperty.call(defaultForm, key)) defaultForm[key] = value
    }
  }
}

async function handleTest() {
  connectError.value = ''
  // 先保存当前填写的API配置
  await settingsStore.saveSettings(apiForm)
  try {
    const res = await settingsStore.testConnection(modelForm.text_model)
    if (res.data?.data?.connected) {
      ElMessage.success(`连接成功! 模型: ${res.data.data.model}, 回复: ${res.data.data.reply}`)
    } else {
      connectError.value = res.data?.error || '连接失败'
    }
  } catch (e) {
    connectError.value = e.message || '网络错误'
  }
}

async function handleSave() {
  saving.value = true
  try {
    await settingsStore.saveSettings({ ...apiForm, ...modelForm })
    ElMessage.success('设置已保存')
  } finally {
    saving.value = false
  }
}

async function handleSaveDefaults() {
  saving.value = true
  try {
    await settingsStore.saveSettings(defaultForm)
    ElMessage.success('默认参数已保存')
  } finally {
    saving.value = false
  }
}

// Key 管理
function loadKeys() {
  try {
    const raw = settingsStore.settings?.keys?.[KEY_SETTINGS_KEY]
    keyList.value = raw ? JSON.parse(raw) : []
  } catch {
    keyList.value = []
  }
}

async function handleAddKey() {
  if (!newKeyName.value.trim() || !newKeyValue.value.trim()) return
  keyList.value.push({ name: newKeyName.value.trim(), value: newKeyValue.value.trim() })
  await saveKeys()
  newKeyName.value = ''
  newKeyValue.value = ''
  ElMessage.success('Key 已添加')
}

async function handleDeleteKey(index) {
  try {
    await ElMessageBox.confirm(`确定删除 "${keyList.value[index].name}" 的 Key？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  keyList.value.splice(index, 1)
  await saveKeys()
  ElMessage.success('Key 已删除')
}

async function saveKeys() {
  await settingsStore.saveSettings({ [KEY_SETTINGS_KEY]: JSON.stringify(keyList.value) })
}

function maskKey(value) {
  if (!value) return ''
  if (value.length <= 8) return '****'
  return value.slice(0, 4) + '****' + value.slice(-4)
}
</script>

<style scoped>
.settings-page { max-width: 900px; }
.page-title { font-size: 22px; font-weight: 700; margin-bottom: 24px; color: var(--text-primary); }

.settings-tabs {
  --el-bg-color: var(--bg-card);
  --el-border-color: var(--border-color);
  background: transparent !important;
  border-color: var(--border-color) !important;
}

.section { padding: 8px 16px; }
.section-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; color: var(--text-primary); }
.section-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 18px; }

.api-form { margin-top: 16px; }
.form-tip { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

.about-section { text-align: center; padding: 30px; }
.about-logo { font-size: 64px; margin-bottom: 10px; }
.about-section h2 { font-size: 24px; margin-bottom: 4px; }
.version { color: var(--text-muted); font-size: 13px; margin-bottom: 10px; }
.about-info ul { text-align: left; max-width: 500px; margin: 16px auto; padding-left: 24px; }
.about-info li { margin-bottom: 6px; color: var(--text-secondary); font-size: 14px; }
.tech-stack { font-size: 13px; color: var(--text-muted); }

.key-add-row {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
