<template>
  <div class="workbench-page animate-in">
    <!-- 顶部信息栏 -->
    <div class="workbench-header" v-if="projectStore.currentProject">
      <h2 class="project-title">{{ projectStore.currentProject.name }}</h2>
      <el-tag :type="statusType(projectStore.currentProject.status)" size="large" effect="dark">
        {{ statusMap[projectStore.currentProject.status] || '草稿' }}
      </el-tag>
      <span class="header-desc">{{ projectStore.currentProject.description }}</span>
    </div>

    <!-- 主Tab切换 -->
    <el-tabs v-model="activeTab" class="workbench-tabs" @tab-change="handleTabChange">
      <!-- Tab1: 剧本编辑 -->
      <el-tab-pane name="script">
        <template #label>
          <span class="tab-label">剧本编辑</span>
        </template>
        <ScriptEditor />
      </el-tab-pane>

      <!-- Tab2: 角色管理 -->
      <el-tab-pane name="character">
        <template #label>
          <span class="tab-label">角色管理
            <el-badge v-if="editorStore.characters.length > 0" :value="editorStore.characters.length" type="primary" class="tab-badge" />
          </span>
        </template>
        <CharacterPanel />
      </el-tab-pane>

      <!-- Tab3: 场景管理 -->
      <el-tab-pane name="scene">
        <template #label>
          <span class="tab-label">场景管理</span>
        </template>
        <ScenePanel />
      </el-tab-pane>

      <!-- Tab4: 分镜制作 -->
      <el-tab-pane name="storyboard">
        <template #label>
          <span class="tab-label">分镜制作
            <el-badge v-if="editorStore.storyboards.length > 0" :value="editorStore.storyboards.length" type="success" class="tab-badge" />
          </span>
        </template>
        <StoryboardView />
      </el-tab-pane>

      <!-- Tab5: 素材库 -->
      <el-tab-pane name="asset">
        <template #label>
          <span class="tab-label">素材库</span>
        </template>
        <AssetLibrary />
      </el-tab-pane>

      <!-- Tab6: 视频合成 -->
      <el-tab-pane name="video">
        <template #label>
          <span class="tab-label">视频合成</span>
        </template>
        <VideoPreview />
      </el-tab-pane>

      <!-- Tab7: 模拟投流 -->
      <el-tab-pane name="adflow">
        <template #label>
          <span class="tab-label">模拟投流</span>
        </template>
        <AdFlow />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Document, UserFilled, Film, PictureFilled, VideoCameraFilled, Grid, DataAnalysis } from '@element-plus/icons-vue'
import { useProjectStore } from '../stores/project'
import { useEditorStore } from '../stores/editor'

// 懒加载子组件(优化首屏)
const ScriptEditor = defineAsyncComponent(() => import('./ScriptEditor.vue'))
const CharacterPanel = defineAsyncComponent(() => import('./CharacterPanel.vue'))
const ScenePanel = defineAsyncComponent(() => import('./ScenePanel.vue'))
const StoryboardView = defineAsyncComponent(() => import('./StoryboardView.vue'))
const AssetLibrary = defineAsyncComponent(() => import('./AssetLibrary.vue'))
const VideoPreview = defineAsyncComponent(() => import('./VideoComposer.vue'))
const AdFlow = defineAsyncComponent(() => import('./AdFlow.vue'))

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const activeTab = ref(route.query.tab || 'script')

const statusMap = {
  draft: '草稿', scripting: '编剧中', storyboard: '分镜中',
  generating: '生成中', completed: '已完成',
}

function statusType(s) {
  const map = { draft: 'info', scripting: '', storyboard: 'warning', generating: 'danger', completed: 'success' }
  return map[s] || 'info'
}

function handleTabChange(tab) {
  // 更新URL但不刷新页面
  router.replace({ query: { ...route.query, tab } })
}

// 加载项目数据
async function loadProject() {
  const id = route.params.id
  if (!id) return

  try {
    await projectStore.fetchProject(id)
    editorStore.reset()
    await editorStore.loadScript(id)
    await editorStore.loadCharacters(id)
    await editorStore.loadStoryboards(id)
    await editorStore.loadAssets(id)
  } catch (e) {
    console.error('加载项目失败:', e)
    router.push('/')
  }
}

onMounted(loadProject)

watch(() => route.params.id, () => {
  if (route.name === 'ProjectWorkbench') loadProject()
})
</script>

<style scoped>
.workbench-page { max-width: 1400px; }

.workbench-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.project-title { font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 20px; }
.header-desc { font-size: 13px; color: var(--text-secondary); }

.workbench-tabs {
  --el-bg-color: transparent !important;
}
.workbench-tabs :deep(.el-tabs__header) {
  background: var(--bg-card);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  padding: 6px 16px 0;
  border-bottom: 2px solid var(--border-color);
}
.workbench-tabs :deep(.el-tabs__item) {
  height: 48px;
  line-height: 48px;
  font-size: 14px;
  padding: 0 22px;
  color: var(--text-secondary);
}
.workbench-tabs :deep(.el-tabs__item.is-active) {
  color: var(--primary);
  font-weight: 600;
}
.workbench-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.tab-badge {
  position: relative;
  top: -8px;
  left: 2px;
}
</style>
