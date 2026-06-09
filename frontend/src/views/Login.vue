<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <span class="logo-icon">🎬</span>
        <h1 class="logo-title">E迅短剧平台</h1>
        <p class="logo-sub">AI短剧创作工作台</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        @submit.prevent="handleLogin"
        class="login-form"
      >
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入访问密码"
            size="large"
            show-password
            @keyup.enter="handleLogin"
            :prefix-icon="Lock"
            autofocus
          />
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          :loading="loading"
          class="login-btn"
          @click="handleLogin"
        >
          {{ loading ? '登录中...' : '进入平台' }}
        </el-button>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      </el-form>

      <p class="login-hint">默认密码：admin123</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Lock } from '@element-plus/icons-vue'
import { login } from '../api/index.js'

const router = useRouter()
const formRef = ref()
const loading = ref(false)
const errorMsg = ref('')

const form = reactive({ password: '' })

const rules = {
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  errorMsg.value = ''
  await formRef.value?.validate().catch(() => {})
  if (!form.password) return

  loading.value = true
  try {
    const res = await login(form.password)
    if (res.code === 0) {
      localStorage.setItem('auth_token', res.token)
      const redirect = router.currentRoute.value.query.redirect || '/'
      router.replace(redirect)
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.error || '登录失败，请检查密码'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #16213e 100%);
  position: relative;
  overflow: hidden;
}

.login-page::before {
  content: '';
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
  top: -100px;
  right: -100px;
  pointer-events: none;
}

.login-page::after {
  content: '';
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%);
  bottom: -50px;
  left: -50px;
  pointer-events: none;
}

.login-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 48px 40px;
  width: 380px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 1;
}

.login-logo {
  text-align: center;
  margin-bottom: 36px;
}

.logo-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}

.logo-title {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 6px;
  letter-spacing: 1px;
}

.logo-sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
}

.login-form {
  margin-top: 8px;
}

.login-form :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: none;
  border-radius: 10px;
}

.login-form :deep(.el-input__wrapper:hover) {
  border-color: rgba(99, 102, 241, 0.6);
}

.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.login-form :deep(.el-input__inner) {
  color: #fff;
  font-size: 15px;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.login-form :deep(.el-input__prefix-icon) {
  color: rgba(255, 255, 255, 0.4);
}

.login-form :deep(.el-input__suffix) {
  color: rgba(255, 255, 255, 0.4);
}

.login-btn {
  width: 100%;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  height: 44px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  letter-spacing: 1px;
  margin-top: 4px;
  transition: all 0.2s ease;
}

.login-btn:hover {
  background: linear-gradient(135deg, #4f52e0, #7c3aed);
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
}

.error-msg {
  color: #f87171;
  font-size: 13px;
  text-align: center;
  margin: 10px 0 0;
}

.login-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  margin: 20px 0 0;
}
</style>
