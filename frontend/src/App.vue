<template>
  <!-- 登录页：全屏无 chrome -->
  <router-view v-if="isLoginPage" />

  <!-- 主应用：带 Header + Sidebar -->
  <div v-else class="app-container">
    <HeaderBar />
    <div class="app-body">
      <Sidebar />
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import HeaderBar from './components/HeaderBar.vue'
import Sidebar from './components/Sidebar.vue'

const route = useRoute()
const isLoginPage = computed(() => route.name === 'Login')
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-main);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
