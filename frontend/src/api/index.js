import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5分钟超时(AI生成任务可能较长)
})

// 请求拦截器：自动带 token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// 响应拦截器
request.interceptors.response.use(
  (res) => res,
  (err) => {
    // 401 跳转登录
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      if (!location.pathname.includes('/login')) {
        location.href = `/login?redirect=${encodeURIComponent(location.pathname)}`
      }
      return Promise.reject(err)
    }
    const msg = err.response?.data?.error || err.message || '网络错误'
    ElMessage.error(msg)
    return Promise.reject(err)
  }
)

// 登录 / 登出（独立导出，不走上面的 401 拦截）
const authRequest = axios.create({ baseURL: '/api', timeout: 10000 })
export const login = (password) =>
  authRequest.post('/auth/login', { password }).then((r) => r.data)
export const logout = () => {
  const token = localStorage.getItem('auth_token')
  return authRequest
    .post('/auth/logout', {}, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .finally(() => localStorage.removeItem('auth_token'))
}

// API模块
const project = {
  list: () => request.get('/projects'),
  create: (data) => request.post('/projects', data),
  get: (id) => request.get(`/projects/${id}`),
  update: (id, data) => request.put(`/projects/${id}`, data),
  delete: (id) => request.delete(`/projects/${id}`),
}

const script = {
  get: (projectId) => request.get(`/projects/${projectId}/scripts`),
  save: (projectId, data) => request.post(`/projects/${projectId}/scripts`, { ...data, action: 'save' }),
  generate: (projectId, text) => request.post(`/projects/${projectId}/scripts`, { raw_text: text, action: 'generate' }),
}

const character = {
  list: (projectId) => request.get(`/projects/${projectId}/characters`),
  create: (projectId, data) => request.post(`/projects/${projectId}/characters`, data),
  update: (id, data) => request.put(`/characters/${id}`, data),
  delete: (id) => request.delete(`/characters/${id}`),
  generateImage: (id, options) => request.post(`/characters/${id}/generate`, options),
  extract: (projectId) => request.post(`/projects/${projectId}/characters`, { action: 'extract_from_script' }),
}

const storyboard = {
  list: (projectId) => request.get(`/projects/${projectId}/storyboards`),
  create: (projectId, data) => request.post(`/projects/${projectId}/storyboards`, data),
  update: (id, data) => request.put(`/storyboards/${id}`, data),
  delete: (id) => request.delete(`/storyboards/${id}`),
  generateImage: (id) => request.post(`/storyboards/${id}/generate-image`),
  generateVideo: (id) => request.post(`/storyboards/${id}/generate-video`),
  aiGenerate: (projectId) => request.post(`/projects/${projectId}/storyboards`, { action: 'ai_generate' }),
}

const asset = {
  list: (projectId, type) => request.get(`/projects/${projectId}/assets${type ? `?type=${type}` : ''}`),
  upload: (file, extraData) => {
    const formData = new FormData()
    formData.append('file', file)
    if (extraData) Object.entries(extraData).forEach(([k, v]) => formData.append(k, v))
    return request.post('/assets/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  delete: (id) => request.delete(`/assets/${id}`),
}

const video = {
  compose: (data) => request.post('/videos/compose', data),
  getList: (projectId) => request.get(`/videos/${projectId}/info`),
}

const task = {
  list: (params) => request.get('/tasks', { params }),
  get: (id) => request.get(`/tasks/${id}`),
}

const settings = {
  get: () => request.get('/settings'),
  update: (data) => request.put('/settings', { settings: data }),
}

const ai = {
  test: (data) => request.post('/ai/test', data),
  models: () => request.get('/ai/models'),
}

export default { project, script, character, storyboard, asset, video, task, settings, ai }
