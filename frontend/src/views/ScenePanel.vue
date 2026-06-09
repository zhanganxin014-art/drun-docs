<template>
  <div class="scene-panel">
    <!-- 顶部操作栏 -->
    <div class="panel-toolbar">
      <el-button type="primary" @click="extractScenes" :loading="extracting">
        <el-icon><MagicStick /></el-icon> AI提取场景
      </el-button>
      <el-button @click="showAddDialog = true">
        <el-icon><Plus /></el-icon> 手动添加
      </el-button>
    </div>

    <!-- 场景卡片网格 -->
    <div class="scene-grid" v-loading="loading">
      <div v-for="sc in scenes" :key="sc.id" class="scene-card card-glow">
        <div class="card-image" @click="sc.image_path ? previewImage(sc.image_path) : null">
          <img v-if="sc.image_path" :src="getImageUrl(sc.image_path)" alt="" />
          <div v-else class="image-placeholder">
            <span>🏙️</span>
            <span class="no-image-tip">未生成场景图</span>
          </div>
          <div class="card-overlay" v-if="sc.image_path">
            <el-icon><ZoomIn /></el-icon>
          </div>
        </div>
        <div class="card-body">
          <h4 class="scene-name">{{ sc.name }}</h4>
          <p class="scene-desc">{{ sc.description || '暂无描述' }}</p>
        </div>
        <div class="card-actions">
          <el-button
            size="small"
            type="primary"
            :loading="generatingMap[sc.id]"
            @click="generateSceneImage(sc)"
          >
            ✦ 生成场景图
          </el-button>
          <el-button size="small" type="danger" plain @click="handleDelete(sc)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && scenes.length === 0" class="empty-state">
      <span style="font-size:48px">空</span>
      <p>还没有场景，请先生成剧本后提取场景</p>
    </div>

    <!-- 添加对话框 -->
    <el-dialog v-model="showAddDialog" title="添加场景" width="400px">
      <el-form :model="addForm" label-position="top">
        <el-form-item label="场景名称"><el-input v-model="addForm.name" /></el-form-item>
        <el-form-item label="场景描述"><el-input v-model="addForm.description" type="textarea" rows="3" /></el-form-item>
        <el-form-item label="绘图提示词"><el-input v-model="addForm.prompt_text" type="textarea" rows="2" placeholder="可选，留空自动生成" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAdd" :loading="adding">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { MagicStick, Plus, ZoomIn } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const projectId = computed(() => route.params.id)

const scenes = ref([])
const loading = ref(false)
const extracting = ref(false)
const adding = ref(false)
const generatingMap = ref({})
const showAddDialog = ref(false)
const addForm = ref({ name: '', description: '', prompt_text: '' })

const baseURL = '/static'

function getImageUrl(path) {
  if (!path) return ''
  const filename = path.split('/').pop()
  return `${baseURL}/images/${filename}`
}

async function loadScenes() {
  loading.value = true
  try {
    const res = await fetch(`/api/projects/${projectId.value}/scenes`).then(r => r.json())
    scenes.value = res.data || []
  } catch (e) {
    ElMessage.error('加载场景失败')
  } finally {
    loading.value = false
  }
}

async function extractScenes() {
  extracting.value = true
  try {
    const res = await fetch(`/api/projects/${projectId.value}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extract_from_script' }),
    }).then(r => r.json())

    if (res.code === 0) {
      ElMessage.success(`成功提取 ${res.data.length} 个场景`)
      await loadScenes()
    } else {
      throw new Error(res.error)
    }
  } catch (e) {
    ElMessage.error(`提取失败: ${e.message}`)
  } finally {
    extracting.value = false
  }
}

async function generateSceneImage(sc) {
  generatingMap.value[sc.id] = true
  try {
    const res = await fetch(`/api/scenes/${sc.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => r.json())

    if (res.code === 0) {
      ElMessage.success(`「${sc.name}」场景图生成成功`)
      await loadScenes()
    } else {
      throw new Error(res.error)
    }
  } catch (e) {
    ElMessage.error(`生成失败: ${e.message}`)
  } finally {
    generatingMap.value[sc.id] = false
  }
}

function previewImage(path) {
  window.open(getImageUrl(path), '_blank')
}

async function handleAdd() {
  if (!addForm.value.name) return
  adding.value = true
  try {
    const res = await fetch(`/api/projects/${projectId.value}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm.value),
    }).then(r => r.json())

    if (res.code === 0) {
      ElMessage.success('场景添加成功')
      showAddDialog.value = false
      addForm.value = { name: '', description: '', prompt_text: '' }
      await loadScenes()
    }
  } catch (e) {
    ElMessage.error('添加失败')
  } finally {
    adding.value = false
  }
}

async function handleDelete(sc) {
  try {
    await ElMessageBox.confirm(`确定删除场景「${sc.name}」？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch { return }

  try {
    const res = await fetch(`/api/scenes/${sc.id}`, { method: 'DELETE' }).then(r => r.json())
    if (res.code === 0) {
      ElMessage.success('删除成功')
      await loadScenes()
    }
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

onMounted(loadScenes)
</script>

<style scoped>
.scene-panel { padding: 4px 0; }

.panel-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.scene-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}
.scene-card:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,102,255,0.12); }

.card-image {
  width: 100%;
  aspect-ratio: 16/9;
  overflow: hidden;
  background: var(--bg-dark);
  position: relative;
  cursor: pointer;
}
.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.card-image:hover img { transform: scale(1.03); }
.card-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  font-size: 32px;
}
.card-image:hover .card-overlay { opacity: 1; }

.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 40px;
  gap: 4px;
}
.no-image-tip { font-size: 12px; }

.card-body { padding: 12px 14px; }
.scene-name { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.scene-desc {
  font-size: 12px; color: var(--text-secondary); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding: 0 14px 12px;
}
.card-actions .el-button { flex: 1; font-size: 12px; }

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state p { margin-top: 12px; }
</style>
