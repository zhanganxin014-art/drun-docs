<template>
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h2 class="page-title">项目列表</h2>
      <el-button type="primary" @click="showCreate = true" :icon="Plus" size="default">
        新建项目
      </el-button>
    </div>

    <div v-loading="projectStore.loading" class="project-grid">
      <el-empty
        v-if="!projectStore.loading && projectStore.projects.length === 0"
        description="还没有项目，开始创建你的第一个短剧吧"
        :image-size="120"
      >
        <el-button type="primary" @click="showCreate = true">创建项目</el-button>
      </el-empty>

      <router-link
        v-for="project in projectStore.projects"
        :key="project.id"
        :to="`/project/${project.id}`"
        class="project-card"
      >
        <div class="card-cover">
          <img v-if="project.cover_image" :src="project.cover_image" alt="" />
          <div v-else class="cover-placeholder">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="3" stroke="#D0D0DE" stroke-width="1.5"/>
              <path d="M3 9h18M9 4v16" stroke="#D0D0DE" stroke-width="1.5"/>
            </svg>
          </div>
        </div>
        <div class="card-info">
          <h3 class="card-title">{{ project.name }}</h3>
          <p v-if="project.description" class="card-desc">{{ project.description }}</p>
          <div class="card-meta">
            <span>{{ project.script_count || 0 }} 剧本</span>
            <span class="meta-dot">·</span>
            <span>{{ project.character_count || 0 }} 角色</span>
            <span class="meta-dot">·</span>
            <span>{{ project.storyboard_count || 0 }} 分镜</span>
          </div>
          <div class="card-footer">
            <span class="card-status-tag" :class="'status-' + project.status">
              {{ statusMap[project.status] || '草稿' }}
            </span>
            <span class="card-time">{{ formatTime(project.updated_at) }}</span>
          </div>
        </div>
      </router-link>
    </div>

    <el-dialog v-model="showCreate" title="新建项目" width="480px" :close-on-click-modal="false">
      <el-form :model="newProject" label-width="80px" label-position="top">
        <el-form-item label="项目名称" required>
          <el-input v-model="newProject.name" placeholder="例如：都市逆袭记" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="newProject.description" type="textarea" :rows="3" placeholder="简单描述这个短剧的题材和风格..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/project'

const router = useRouter()
const projectStore = useProjectStore()

const showCreate = ref(false)
const creating = ref(false)
const newProject = ref({ name: '', description: '' })

const statusMap = {
  draft: '草稿',
  scripting: '编剧中',
  storyboard: '分镜中',
  generating: '生成中',
  completed: '已完成',
}

onMounted(() => {
  projectStore.fetchProjects()
})

async function handleCreate() {
  if (!newProject.value.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }
  creating.value = true
  try {
    const project = await projectStore.createProject(newProject.value)
    showCreate.value = false
    newProject.value = { name: '', description: '' }
    ElMessage.success('创建成功')
    router.push(`/project/${project.id}`)
  } finally {
    creating.value = false
  }
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
</script>

<style scoped>
.dashboard-page { max-width: 1200px; }
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 16px;
}

.project-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
  text-decoration: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.project-card:hover {
  border-color: var(--primary-light);
  box-shadow: var(--shadow-md);
}
.card-cover {
  height: 150px;
  position: relative;
  overflow: hidden;
  background: var(--bg-input);
}
.card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #F0EDF8 0%, #E8E4F4 100%);
}

.card-info { padding: 14px 16px; }
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.meta-dot { color: #D0D0DE; }
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-status-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}
.card-status-tag.status-draft { background: #F0F0F6; color: #8E8EA0; }
.card-status-tag.status-scripting { background: var(--primary-bg); color: var(--primary); }
.card-status-tag.status-storyboard { background: var(--primary-bg); color: var(--primary); }
.card-status-tag.status-generating { background: rgba(255, 149, 0, 0.08); color: #E08800; }
.card-status-tag.status-completed { background: rgba(52, 199, 89, 0.08); color: #2DAF4F; }
.card-time {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
