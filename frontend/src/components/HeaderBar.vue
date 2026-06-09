<template>
  <header class="header-bar">
    <div class="header-left">
      <router-link to="/" class="logo">
        <img src="/logo.png" alt="全迅云" class="logo-img" />
        <span class="logo-text">E迅短剧助手</span>
      </router-link>
      <span v-if="currentProjectName" class="project-badge">
        {{ currentProjectName }}
      </span>
    </div>
    <div class="header-right">
      <el-button text @click="$router.push('/settings')" :icon="Setting">
        设置
      </el-button>
      <el-button text @click="handleLogout" :icon="SwitchButton" class="logout-btn">
        退出
      </el-button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting, SwitchButton } from '@element-plus/icons-vue'
import { useProjectStore } from '../stores/project'
import { logout } from '../api/index.js'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const currentProjectName = computed(() => {
  if (route.name === 'ProjectWorkbench') {
    return projectStore.currentProject?.name || route.params.id
  }
  return ''
})

async function handleLogout() {
  await logout()
  router.replace('/login')
}
</script>

<style scoped>
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 20px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-color);
  z-index: 100;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}
.logo-img {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  object-fit: contain;
}
.logo-text {
  font-size: 15px;
  font-weight: 600;
  color: #1A1A2E;
  letter-spacing: 0.02em;
}
.project-badge {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 10px;
  background: var(--primary-bg);
  border-radius: 20px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-right .el-button {
  color: var(--text-secondary);
  font-size: 13px;
}
.header-right .el-button:hover {
  color: var(--primary);
}
.logout-btn {
  color: var(--text-secondary) !important;
}
.logout-btn:hover {
  color: #f87171 !important;
}
</style>
