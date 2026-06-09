import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useEditorStore = defineStore('editor', () => {
  // 剧本数据
  const script = ref(null)
  const rawText = ref('')

  // 角色列表
  const characters = ref([])

  // 分镜列表
  const storyboards = ref([])

  // 素材列表
  const assets = ref([])

  // 当前任务
  const tasks = ref([])
  const activeTask = ref(null)

  // 加载剧本
  async function loadScript(projectId) {
    try {
      const res = await api.script.get(projectId)
      script.value = res.data.data
      if (script.value?.content) {
        try { script.value.content = JSON.parse(script.value.content) } catch(e) {}
      }
      if (script.value?.raw_text) rawText.value = script.value.raw_text
    } catch { script.value = null }
  }

  // 保存/生成剧本
  async function saveScript(projectId, data) {
    const res = await api.script.save(projectId, data)
    script.value = res.data.data
    if (script.value?.content) {
      try { script.value.content = JSON.parse(script.value.content) } catch(e) {}
    }
    return res.data
  }

  // AI生成剧本
  async function generateScript(projectId, text) {
    const res = await api.script.generate(projectId, text)
    script.value = { content: typeof res.data.data.script === 'string' ? JSON.parse(res.data.data.script) : res.data.data.script, title: res.data.data.title }
    rawText.value = text
    return res.data
  }

  // 加载角色
  async function loadCharacters(projectId) {
    try {
      const res = await api.character.list(projectId)
      characters.value = res.data.data || []
    } catch { characters.value = [] }
  }

  // 加载分镜
  async function loadStoryboards(projectId) {
    try {
      const res = await api.storyboard.list(projectId)
      storyboards.value = res.data.data || []
    } catch { storyboards.value = [] }
  }

  // 加载素材
  async function loadAssets(projectId) {
    try {
      const res = await api.asset.list(projectId)
      assets.value = res.data.data || []
    } catch { assets.value = [] }
  }

  // 重置当前编辑器状态
  function reset() {
    script.value = null
    rawText.value = ''
    characters.value = []
    storyboards.value = []
    assets.value = []
    tasks.value = []
    activeTask.value = null
  }

  return {
    script, rawText, characters, storyboards, assets, tasks, activeTask,
    loadScript, saveScript, generateScript,
    loadCharacters, loadStoryboards, loadAssets,
    reset,
  }
})
