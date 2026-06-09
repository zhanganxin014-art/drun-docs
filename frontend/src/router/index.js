import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import ProjectWorkbench from '../views/ProjectWorkbench.vue'
import Settings from '../views/Settings.vue'
import Login from '../views/Login.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard,
    meta: { title: '项目列表' },
  },
  {
    path: '/project/:id',
    name: 'ProjectWorkbench',
    component: ProjectWorkbench,
    meta: { title: '项目工作台' },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { title: '系统设置' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  document.title = `${to.meta.title || ''} - E迅短剧平台`

  // 公开路由直接放行
  if (to.meta.public) return true

  // 检查 token
  const token = localStorage.getItem('auth_token')
  if (!token) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
