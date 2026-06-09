<template>
  <aside class="sidebar">
    <nav class="sidebar-nav">
      <router-link to="/" class="nav-item" :class="{ active: $route.path === '/' }">
        <el-icon><Grid /></el-icon>
        <span>项目列表</span>
      </router-link>
      <template v-if="hasActiveProject">
        <div class="nav-divider"></div>
        <router-link
          :to="`/project/${activeProjectId}?tab=script`"
          class="nav-item"
          :class="{ active: isActiveTab('script') }"
        >
          <el-icon><Document /></el-icon>
          <span>剧本编辑</span>
        </router-link>
        <router-link
          :to="`/project/${activeProjectId}?tab=character`"
          class="nav-item"
          :class="{ active: isActiveTab('character') }"
        >
          <el-icon><UserFilled /></el-icon>
          <span>角色管理</span>
        </router-link>
        <router-link
          :to="`/project/${activeProjectId}?tab=scene`"
          class="nav-item"
          :class="{ active: isActiveTab('scene') }"
        >
          <el-icon><Picture /></el-icon>
          <span>场景管理</span>
        </router-link>
        <router-link
          :to="`/project/${activeProjectId}?tab=storyboard`"
          class="nav-item"
          :class="{ active: isActiveTab('storyboard') }"
        >
          <el-icon><Film /></el-icon>
          <span>分镜制作</span>
        </router-link>
        <router-link
          :to="`/project/${activeProjectId}?tab=asset`"
          class="nav-item"
          :class="{ active: isActiveTab('asset') }"
        >
          <el-icon><PictureFilled /></el-icon>
          <span>素材库</span>
        </router-link>
        <router-link
          :to="`/project/${activeProjectId}?tab=video`"
          class="nav-item"
          :class="{ active: isActiveTab('video') }"
        >
          <el-icon><VideoCameraFilled /></el-icon>
          <span>视频合成</span>
        </router-link>
        <router-link
          :to="`/project/${activeProjectId}?tab=adflow`"
          class="nav-item"
          :class="{ active: isActiveTab('adflow') }"
        >
          <el-icon><DataAnalysis /></el-icon>
          <span>模拟投流</span>
        </router-link>
      </template>
    </nav>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Grid, Document, UserFilled, Picture, Film, PictureFilled, VideoCameraFilled, DataAnalysis } from '@element-plus/icons-vue'
import { useProjectStore } from '../stores/project'

const route = useRoute()
const projectStore = useProjectStore()

const hasActiveProject = computed(() => !!route.params.id)
const activeProjectId = computed(() => route.params.id)

function isActiveTab(tab) {
  return route.name === 'ProjectWorkbench' && route.query.tab === tab
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px 0;
}
.sidebar-nav {
  padding: 0 10px;
  flex: 1;
}
.nav-divider {
  height: 1px;
  background: var(--border-color);
  margin: 10px 12px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 400;
  transition: all 0.15s ease;
  margin-bottom: 2px;
}
.nav-item:hover {
  color: var(--text-primary);
  background: var(--primary-bg);
}
.nav-item.active {
  color: var(--primary);
  background: var(--primary-bg-hover);
  font-weight: 500;
}
.nav-item .el-icon {
  font-size: 16px;
}
.nav-item.active .el-icon {
  color: var(--primary);
}
</style>
