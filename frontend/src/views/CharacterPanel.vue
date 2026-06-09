<template>
  <div class="character-panel">
    <!-- 工具栏 -->
    <div class="panel-toolbar">
      <el-button @click="handleExtract" :loading="extracting" type="warning" :icon="MagicStick">
        {{ extracting ? 'AI提取中...' : 'AI从剧本提取角色' }}
      </el-button>
      <el-button @click="openAddDrawer" :icon="Plus">手动添加角色</el-button>
      <span class="toolbar-info" v-if="characters.length > 0">共{{ characters.length }}个角色</span>
    </div>

    <!-- 角色卡片网格 -->
    <div v-loading="loading" class="character-grid">
      <el-empty v-if="!loading && characters.length === 0" description="暂无角色，可从剧本自动提取或手动添加">
        <el-button type="primary" @click="handleExtract">从剧本提取</el-button>
      </el-empty>

      <div v-for="char in characters" :key="char.id" class="character-card card-glow">
        <!-- 卡片主体：点击进抽屉 -->
        <div class="card-main" @click="openDetailDrawer(char)">
          <div class="card-image">
            <img v-if="char.images?.length > 0" :src="getImageUrl(char.images[char.images.length - 1])" alt="" />
            <div v-else class="image-placeholder">
              <span>👤</span>
              <span class="no-image-tip">未生成形象</span>
            </div>
            <!-- 参考照片标识 -->
            <div class="ref-indicator" v-if="char.reference_image_path">📷</div>
          </div>
          <div class="card-body">
            <h4 class="char-name">{{ char.name }}</h4>
            <p class="char-desc">{{ char.description || '暂无描述' }}</p>
          </div>
        </div>
        <!-- 底部操作栏：hover 显示 -->
        <div class="card-actions">
          <el-button
            size="small"
            type="primary"
            :loading="generatingMap[char.id]"
            @click.stop="handleCardGenerate(char)"
          >
            ✦ 生成形象
          </el-button>
          <el-button size="small" type="danger" plain @click.stop="handleDelete(char)">
            <el-icon><CloseBold /></el-icon> 删除
          </el-button>
        </div>
      </div>
    </div>

    <!-- ====== 角色详情三栏抽屉 ====== -->
    <el-drawer
      v-model="drawerVisible"
      :title="null"
      size="75%"
      direction="rtl"
      :close-on-click-modal="false"
      :destroy-on-close="true"
    >
      <template #header>
        <span class="drawer-title">{{ drawerChar?.name || '角色详情' }}</span>
      </template>

      <div class="drawer-body" v-if="drawerChar">
        <!-- 左栏：大幅形象图 -->
        <div class="drawer-left">
          <div class="main-image">
            <img
              v-if="drawerForm.images?.length > 0"
              :src="getImageUrl(drawerForm.images[drawerForm.images.length - 1])"
              alt="角色形象"
            />
            <div v-else class="main-img-placeholder">
              <span>👤</span>
              <span>未生成形象</span>
            </div>

            <!-- 悬浮操作按钮 -->
            <div class="img-actions" v-if="drawerForm.images?.length > 0">
              <el-button circle size="small" @click="downloadImage(drawerForm.images[drawerForm.images.length - 1])">
                <el-icon><Download /></el-icon>
              </el-button>
              <el-button circle size="small" @click="previewImage(drawerForm.images[drawerForm.images.length - 1])">
                <el-icon><FullScreen /></el-icon>
              </el-button>
            </div>
          </div>
        </div>

        <!-- 中栏：缩略图画廊 + 基本信息 + 生成按钮 -->
        <div class="drawer-center">
          <!-- 图片缩略图画廊 -->
          <div class="image-gallery">
            <div class="gallery-label">已生成形象</div>
            <div class="gallery-list">
              <div
                v-for="(img, idx) in drawerForm.images"
                :key="idx"
                class="gallery-thumb"
                :class="{ active: idx === selectedImageIdx }"
                @click="selectedImageIdx = idx"
              >
                <img :src="getImageUrl(img)" alt="" />
                <div class="thumb-delete" @click.stop="removeImage(idx)">
                  <el-icon><CloseBold /></el-icon>
                </div>
              </div>
              <!-- 添加按钮 -->
              <div class="gallery-thumb add-btn" @click="handleDrawerGenerate">
                <span v-if="!drawerGenerating">+</span>
                <el-icon v-else class="is-loading"><Loading /></el-icon>
              </div>
            </div>
          </div>

          <!-- 基本信息 -->
          <div class="basic-info">
            <div class="info-label">基本信息</div>
            <el-input
              v-model="drawerForm.description"
              type="textarea"
              :rows="4"
              placeholder="角色详细信息描述：性别、年龄、职业、外貌、性格特征..."
            />
          </div>

          <!-- 参考图区域 -->
          <div class="reference-section" v-if="drawerForm.id">
            <div class="info-label">参考照片</div>
            <div class="reference-area" v-if="drawerForm.reference_image_path">
              <div class="reference-thumb">
                <img :src="getImageUrl(drawerForm.reference_image_path)" alt="参考照片" />
                <div class="ref-badge">参考</div>
                <div class="thumb-delete" @click="handleDeleteReference">
                  <el-icon><CloseBold /></el-icon>
                </div>
              </div>
              <div class="ref-actions">
                <el-button
                  type="primary"
                  size="small"
                  :loading="refGenerating"
                  @click="handleGenerateWithReference"
                  style="flex: 1"
                >
                  ✦ 参考生成
                </el-button>
                <el-button size="small" @click="handleDeleteReference" plain>移除</el-button>
              </div>
              <div class="ref-tip">上传您的照片作为参考，AI将保持人物特征生成风格化形象</div>
            </div>
            <div class="reference-upload" v-else>
              <el-upload
                :auto-upload="false"
                :show-file-list="false"
                :on-change="handleReferenceImageChange"
                accept="image/*"
              >
                <div class="upload-placeholder">
                  <el-icon :size="24"><Plus /></el-icon>
                  <span>上传参考照片</span>
                </div>
              </el-upload>
            </div>
          </div>

          <!-- 生成形象按钮 -->
          <div class="generate-section">
            <el-button
              type="primary"
              class="generate-btn"
              :loading="drawerGenerating"
              @click="handleDrawerGenerate"
              size="large"
            >
              ✦ 生成形象
            </el-button>
          </div>
        </div>

        <!-- 右栏：编辑表单 -->
        <div class="drawer-right">
          <!-- 形象名称 -->
          <div class="form-group">
            <label>形象名称</label>
            <el-input
              v-model="drawerForm.name"
              placeholder="请输入形象名称"
              maxlength="50"
              show-word-limit
            />
          </div>

          <!-- 绘图提示词 -->
          <div class="form-group">
            <label>绘图提示词</label>
            <el-input
              v-model="drawerForm.prompt_text"
              type="textarea"
              :rows="2"
              placeholder="英文提示词，用于生成角色形象..."
            />
          </div>

          <!-- 参考照片（右栏管理） -->
          <div class="form-group">
            <label>参考照片</label>
            <div v-if="drawerForm.reference_image_path" class="ref-inline">
              <img :src="getImageUrl(drawerForm.reference_image_path)" class="ref-preview" />
              <el-button size="small" type="danger" plain @click="handleDeleteReference">移除</el-button>
            </div>
            <el-upload
              v-else
              :auto-upload="false"
              :show-file-list="false"
              :on-change="handleReferenceImageChange"
              accept="image/*"
            >
              <el-button size="small" type="primary" plain>上传照片</el-button>
            </el-upload>
            <div class="form-hint">上传真人照片，AI将参考人物特征生成形象</div>
          </div>

          <!-- 音色选择 -->
          <div class="form-group">
            <label>配音音色</label>
            <el-select v-model="drawerForm.voice_id" placeholder="选择音色" style="width: 100%">
              <el-option v-for="v in voiceOptions" :key="v.id" :label="v.name" :value="v.id" />
            </el-select>
          </div>

          <!-- 文本音色 -->
          <div class="form-group">
            <label>文本音色</label>
            <el-input
              v-model="drawerForm.voice_text"
              type="textarea"
              :rows="2"
              placeholder="描述角色的声音特征：音调、语速、情感色彩..."
            />
          </div>

          <!-- 音频音色开关 -->
          <div class="form-group">
            <label>音频音色</label>
            <el-switch v-model="audioMode" active-text="开启" inactive-text="关闭" />
          </div>

          <!-- 参考音频上传 -->
          <div class="form-group" v-if="audioMode">
            <label>上传参考音频</label>
            <el-upload
              :auto-upload="false"
              :limit="1"
              :on-change="handleAudioChange"
              :file-list="audioFileList"
              accept=".mp3,.wav,.m4a"
            >
              <el-button size="small" type="primary" plain>选择音频文件</el-button>
              <template #tip>
                <div class="el-upload__tip">支持 MP3 / WAV / M4A 格式</div>
              </template>
            </el-upload>
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <template #footer>
        <div class="drawer-footer">
          <el-button @click="handleDeleteDrawerChar" type="danger" plain>删除角色</el-button>
          <div class="footer-right">
            <el-button @click="drawerVisible = false">取消</el-button>
            <el-button type="primary" @click="handleSaveDrawer">保存</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { MagicStick, Plus, CloseBold, Download, FullScreen, Loading } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()

const characters = ref([])
const loading = ref(false)
const extracting = ref(false)
const generatingMap = ref({})

// 抽屉相关
const drawerVisible = ref(false)
const drawerChar = ref(null)
const drawerGenerating = ref(false)
const selectedImageIdx = ref(0)
const audioMode = ref(false)
const audioFileList = ref([])

const drawerForm = reactive({
  id: null,
  name: '',
  description: '',
  prompt_text: '',
  images: [],
  voice_id: '',
  voice_text: '',
  reference_audio_path: '',
  reference_image_path: '',
})

const voiceOptions = [
  { id: 'alloy', name: '合金(中性)' },
  { id: 'echo', name: '回声(男)' },
  { id: 'nova', name: '新星(女)' },
  { id: 'shimmer', name: '微光(女柔)' },
  { id: 'onyx', name: '玛瑙(男低)' },
]

onMounted(async () => { await loadCharacters() })

async function loadCharacters() {
  loading.value = true
  try {
    const res = await fetch(`/api/projects/${route.params.id}/characters`).then(r => r.json())
    characters.value = res.data || []
  } finally { loading.value = false }
}

async function handleExtract() {
  extracting.value = true
  try {
    const res = await fetch(`/api/projects/${route.params.id}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extract_from_script' }),
    }).then(r => r.json())
    characters.value = res.data || []
    ElMessage.success(`成功提取 ${characters.value.length} 个角色`)
  } catch(e) { ElMessage.error('提取失败') }
  finally { extracting.value = false }
}

// 打开详情抽屉
function openDetailDrawer(char) {
  drawerChar.value = char
  Object.assign(drawerForm, {
    id: char.id,
    name: char.name || '',
    description: char.description || '',
    prompt_text: char.prompt_text || '',
    images: [...(char.images || [])],
    voice_id: char.voice_id || '',
    voice_text: char.voice_text || '',
    reference_audio_path: char.reference_audio_path || '',
    reference_image_path: char.reference_image_path || '',
  })
  selectedImageIdx.value = (char.images?.length || 1) - 1
  audioMode.value = !!char.reference_audio_path
  audioFileList.value = []
  drawerVisible.value = true
}

// 添加新角色
function openAddDrawer() {
  drawerChar.value = { id: null, name: '新角色', images: [] }
  Object.assign(drawerForm, {
    id: null,
    name: '新角色',
    description: '',
    prompt_text: '',
    images: [],
    voice_id: '',
    voice_text: '',
    reference_audio_path: '',
    reference_image_path: '',
  })
  selectedImageIdx.value = -1
  audioMode.value = false
  audioFileList.value = []
  drawerVisible.value = true
}

// 在抽屉中生成形象
async function handleDrawerGenerate() {
  if (!drawerForm.id) {
    // 新角色先保存再生成
    if (!drawerForm.name.trim()) { ElMessage.warning('请先输入角色名称'); return }
    const created = await quickCreate()
    if (!created) return
  }

  drawerGenerating.value = true
  try {
    const res = await fetch(`/api/characters/${drawerForm.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customPrompt: drawerForm.prompt_text }),
    }).then(r => r.json())

    if (res.code === 0) {
      drawerForm.images.push(res.data.file_path)
      selectedImageIdx.value = drawerForm.images.length - 1
      ElMessage.success('形象生成成功')
    } else {
      throw new Error(res.error)
    }
  } catch(e) {
    ElMessage.error(`生成失败: ${e.message}`)
  } finally { drawerGenerating.value = false }
}

// 快速创建角色
async function quickCreate() {
  try {
    const res = await fetch(`/api/projects/${route.params.id}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: drawerForm.name, description: drawerForm.description, prompt_text: drawerForm.prompt_text }),
    }).then(r => r.json())
    if (res.code === 0) {
      drawerForm.id = res.data.id
      drawerChar.value = res.data
      return true
    }
    throw new Error(res.error)
  } catch(e) {
    ElMessage.error(`创建失败: ${e.message}`)
    return false
  }
}

// 删除图片
function removeImage(idx) {
  drawerForm.images.splice(idx, 1)
  if (selectedImageIdx.value >= drawerForm.images.length) {
    selectedImageIdx.value = Math.max(0, drawerForm.images.length - 1)
  }
}

// 下载图片
function downloadImage(path) {
  const url = getImageUrl(path)
  const a = document.createElement('a')
  a.href = url
  a.download = `${drawerForm.name}_形象.png`
  a.click()
}

// 全屏预览
function previewImage(path) {
  window.open(getImageUrl(path), '_blank')
}

// 音频文件选择
function handleAudioChange(file) {
  drawerForm.reference_audio_path = file.name
}

// ====== 参考照片相关 ======
const refGenerating = ref(false)

// 上传参考照片
async function handleReferenceImageChange(file) {
  if (!drawerForm.id) {
    // 新角色先保存
    if (!drawerForm.name.trim()) { ElMessage.warning('请先输入角色名称'); return }
    const created = await quickCreate()
    if (!created) return
  }

  const formData = new FormData()
  formData.append('image', file.raw)

  try {
    const res = await fetch(`/api/characters/${drawerForm.id}/upload-reference`, {
      method: 'POST',
      body: formData,
    }).then(r => r.json())

    if (res.code === 0) {
      drawerForm.reference_image_path = res.data.reference_image_path
      // images 数组可能也更新了
      if (res.data.images) {
        drawerForm.images = res.data.images
      }
      ElMessage.success('参考照片上传成功')
    } else {
      throw new Error(res.error)
    }
  } catch(e) {
    ElMessage.error(`上传失败: ${e.message}`)
  }
}

// 基于参考照片生成形象
async function handleGenerateWithReference() {
  if (!drawerForm.reference_image_path) {
    ElMessage.warning('请先上传参考照片')
    return
  }

  refGenerating.value = true
  try {
    const res = await fetch(`/api/characters/${drawerForm.id}/generate-with-reference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).then(r => r.json())

    if (res.code === 0) {
      drawerForm.images.push(res.data.file_path)
      selectedImageIdx.value = drawerForm.images.length - 1
      ElMessage.success('参考形象生成成功')
    } else {
      throw new Error(res.error)
    }
  } catch(e) {
    ElMessage.error(`生成失败: ${e.message}`)
  } finally { refGenerating.value = false }
}

// 删除参考照片
async function handleDeleteReference() {
  if (!drawerForm.id) return
  try {
    await ElMessageBox.confirm('确认移除参考照片？', '移除确认', { type: 'warning' })
    const res = await fetch(`/api/characters/${drawerForm.id}/reference`, {
      method: 'DELETE',
    }).then(r => r.json())

    if (res.code === 0) {
      drawerForm.reference_image_path = ''
      // images 数组可能也被更新了
      if (res.data?.images) {
        drawerForm.images = res.data.images
        if (selectedImageIdx.value >= drawerForm.images.length) {
          selectedImageIdx.value = Math.max(0, drawerForm.images.length - 1)
        }
      }
      ElMessage.success('已移除参考照片')
    } else {
      throw new Error(res.error)
    }
  } catch(e) {
    if (e !== 'cancel') ElMessage.error(`移除失败: ${e.message}`)
  }
}

// 保存抽屉
async function handleSaveDrawer() {
  if (!drawerForm.name.trim()) { ElMessage.warning('名称必填'); return }

  try {
    if (drawerForm.id) {
      // 更新已有角色
      await fetch(`/api/characters/${drawerForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: drawerForm.name,
          description: drawerForm.description,
          prompt_text: drawerForm.prompt_text,
          voice_id: drawerForm.voice_id || null,
          voice_text: drawerForm.voice_text || null,
          reference_audio_path: audioMode.value ? drawerForm.reference_audio_path : null,
          reference_image_path: drawerForm.reference_image_path || null,
          images: drawerForm.images,
        }),
      })
      ElMessage.success('保存成功')
    } else {
      // 创建新角色
      const res = await fetch(`/api/projects/${route.params.id}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: drawerForm.name,
          description: drawerForm.description,
          prompt_text: drawerForm.prompt_text,
        }),
      }).then(r => r.json())
      if (res.code !== 0) throw new Error(res.error)
      ElMessage.success('创建成功')
    }
    drawerVisible.value = false
    await loadCharacters()
  } catch(e) {
    ElMessage.error(`保存失败: ${e.message}`)
  }
}

// 删除抽屉中的角色
async function handleDeleteDrawerChar() {
  if (!drawerForm.id) { drawerVisible.value = false; return }
  await handleDelete({ id: drawerForm.id, name: drawerForm.name })
  drawerVisible.value = false
}

// 从卡片直接生成形象
async function handleCardGenerate(char) {
  generatingMap.value[char.id] = true
  try {
    const res = await fetch(`/api/characters/${char.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => r.json())

    if (res.code === 0) {
      ElMessage.success(`「${char.name}」形象生成成功`)
      await loadCharacters()
    } else {
      throw new Error(res.error)
    }
  } catch(e) {
    ElMessage.error(`生成失败: ${e.message}`)
  } finally {
    generatingMap.value[char.id] = false
  }
}

// 从卡片删除
async function handleDelete(char) {
  try {
    await ElMessageBox.confirm(`确认删除角色「${char.name}」？`, '删除确认', { type: 'warning' })
    await fetch(`/api/characters/${char.id}`, { method: 'DELETE' })
    characters.value = characters.value.filter(c => c.id !== char.id)
    ElMessage.success('已删除')
  } catch(e) { /* cancelled */ }
}

function getImageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `/static${path}`
}
</script>

<style scoped>
.character-panel { padding: 4px 0; background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f1 100%); border-radius: 12px; min-height: calc(100vh - 120px); }

/* 工具栏 */
.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  background: #fff;
  border-radius: 10px;
  padding: 12px 16px;
  border: 1px solid rgba(124, 92, 240, 0.1);
}
.toolbar-info { font-size: 13px; color: var(--text-muted); margin-left: auto; }

/* 卡片网格 */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.character-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(124, 92, 240, 0.1);
  transition: all 0.25s ease;
  cursor: pointer;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.character-card:hover {
  border-color: #7c5cf0;
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(124, 92, 240, 0.15);
}
.card-image {
  height: 220px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #151c30, #1a2744);
}
.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}
.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.4;
}
.image-placeholder span:first-child { font-size: 44px; }
.no-image-tip { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.ref-indicator {
  position: absolute; top: 8px; right: 8px; font-size: 14px;
  background: rgba(0,0,0,0.5); border-radius: 6px; padding: 2px 5px;
}

/* 卡片主体（可点击进抽屉） */
.card-main { cursor: pointer; }

.card-body { padding: 12px 14px; }
.char-name { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.char-desc {
  font-size: 12px; color: var(--text-secondary); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* 底部操作栏：hover 显示 */
.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 12px;
  opacity: 0;
  transform: translateY(4px);
  transition: all 0.2s ease;
}
.character-card:hover .card-actions {
  opacity: 1;
  transform: translateY(0);
}
.card-actions .el-button { flex: 1; font-size: 12px; }

/* ====== 抽屉三栏布局 ====== */
:deep(.el-drawer__header) { margin-bottom: 0; padding: 16px 24px; border-bottom: 1px solid var(--border-color); }
.drawer-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }

.drawer-body {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
  padding: 24px;
  height: calc(100vh - 130px);
  overflow-y: auto;
  background: linear-gradient(135deg, #f8f9fc 0%, #eef1f8 100%);
}

/* 左栏：大幅形象图 */
.drawer-left { min-width: 0; background: #fff; border-radius: 12px; padding: 16px; border: 1px solid rgba(124, 92, 240, 0.1); }

.main-image {
  position: relative;
  width: 100%;
  aspect-ratio: 9/16;
  max-height: calc(100vh - 200px);
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #f0f1f3, #e8e8ec);
}
.main-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}
.main-img-placeholder {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--text-muted); opacity: 0.4;
}
.main-img-placeholder span:first-child { font-size: 64px; }
.main-img-placeholder span:last-child { font-size: 14px; margin-top: 8px; }

.img-actions {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  opacity: 0.9;
}

/* 中栏：画廊 + 信息 + 生成按钮 */
.drawer-center {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(124, 92, 240, 0.1);
}

.gallery-label, .info-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.gallery-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gallery-thumb {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  border: 2px solid transparent;
  background: var(--bg-input);
  transition: border-color 0.2s;
}
.gallery-thumb.active { border-color: var(--accent-color); }
.gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-delete {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.2s;
}
.gallery-thumb:hover .thumb-delete { opacity: 1; }
.thumb-delete:hover { background: var(--danger-color); }

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--text-muted);
  border: 2px dashed var(--border-color);
  background: transparent;
  transition: all 0.2s;
}
.add-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }

.generate-section { margin-top: auto; }
.generate-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  background: #1a1a2e;
  border-color: #1a1a2e;
}
.generate-btn:hover { background: #2a2a3e; border-color: #2a2a3e; }

/* 参考照片区域 */
.reference-section { margin-top: 4px; }
.reference-area { display: flex; flex-direction: column; gap: 8px; }
.reference-thumb {
  width: 100%; aspect-ratio: 3/4; border-radius: 10px;
  overflow: hidden; position: relative; border: 2px solid #e6a23c;
}
.reference-thumb img { width: 100%; height: 100%; object-fit: cover; }
.ref-badge {
  position: absolute; top: 6px; left: 6px; background: #e6a23c;
  color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px;
  font-weight: 500;
}
.reference-thumb .thumb-delete {
  position: absolute; top: 6px; right: 6px; width: 20px; height: 20px;
  border-radius: 4px; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 10px; opacity: 0; transition: opacity 0.2s;
}
.reference-thumb:hover .thumb-delete { opacity: 1; }
.ref-actions { display: flex; gap: 8px; }
.ref-tip { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

.reference-upload { margin-top: 4px; }
.upload-placeholder {
  width: 100%; aspect-ratio: 3/4; border: 2px dashed var(--border-color);
  border-radius: 10px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  color: var(--text-muted); cursor: pointer; transition: all 0.2s;
  background: rgba(230, 162, 60, 0.03);
}
.upload-placeholder:hover { border-color: #e6a23c; color: #e6a23c; }
.upload-placeholder span { font-size: 12px; }

/* 右栏参考图内联 */
.ref-inline { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.ref-preview {
  width: 48px; height: 64px; border-radius: 6px; object-fit: cover;
  border: 1.5px solid #e6a23c;
}
.form-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }

/* 右栏：编辑表单 */
.drawer-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(124, 92, 240, 0.1);
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

/* 底部按钮 */
:deep(.el-drawer__footer) { padding: 12px 24px; border-top: 1px solid var(--border-color); }
.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.footer-right { display: flex; gap: 10px; }
</style>
