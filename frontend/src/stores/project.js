import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useProjectStore = defineStore('project', () => {
  const projects = ref([])
  const currentProject = ref(null)
  const loading = ref(false)

  // 获取项目列表
  async function fetchProjects() {
    loading.value = true
    try {
      const res = await api.project.list()
      projects.value = res.data.data || []
    } finally {
      loading.value = false
    }
  }

  // 创建项目
  async function createProject(data) {
    const res = await api.project.create(data)
    projects.value.unshift(res.data.data)
    return res.data.data
  }

  // 更新项目
  async function updateProject(id, data) {
    const res = await api.project.update(id, data)
    const idx = projects.value.findIndex(p => p.id === Number(id))
    if (idx !== -1) projects.value[idx] = res.data.data
    if (currentProject.value?.id === Number(id)) currentProject.value = res.data.data
    return res.data.data
  }

  // 删除项目
  async function deleteProject(id) {
    await api.project.delete(id)
    projects.value = projects.value.filter(p => p.id !== Number(id))
  }

  // 获取单个项目详情
  async function fetchProject(id) {
    const res = await api.project.get(id)
    currentProject.value = res.data.data
    return res.data.data
  }

  return { projects, currentProject, loading, fetchProjects, createProject, updateProject, deleteProject, fetchProject }
})
