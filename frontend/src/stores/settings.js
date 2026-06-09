import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref({})
  const connected = ref(false)
  const testing = ref(false)

  // 加载设置
  async function loadSettings() {
    try {
      const res = await api.settings.get()
      settings.value = res.data.data || {}
    } catch { settings.value = {} }
  }

  // 保存设置
  async function saveSettings(data) {
    const res = await api.settings.update(data)
    settings.value = res.data.data
    return res.data
  }

  // 测试API连接
  async function testConnection(model) {
    testing.value = true
    try {
      const res = await api.ai.test({ model })
      connected.value = res.data.data?.connected || false
      return res.data
    } finally {
      testing.value = false
    }
  }

  return { settings, connected, testing, loadSettings, saveSettings, testConnection }
})
