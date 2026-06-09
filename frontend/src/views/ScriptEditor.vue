<template>
  <div class="script-editor">
    <!-- 操作面板 -->
    <div class="editor-toolbar">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        placeholder="输入一句话创意、小说原文或粘贴文本内容，然后点击「AI生成剧本」..."
        class="input-area"
      />
      <div class="toolbar-actions">
        <el-button type="primary" @click="handleGenerate" :loading="generating" :icon="MagicStick" size="large">
          {{ generating ? 'AI生成中...' : 'AI生成剧本' }}
        </el-button>
        <el-button @click="handleSave" v-if="scriptContent" :icon="Check">保存修改</el-button>
        <el-button @click="handleExtract" v-if="!generating && scriptContent" :icon="User" type="warning">
          提取角色 →
        </el-button>
      </div>
    </div>

    <!-- 剧本展示区 -->
    <div v-if="scriptContent" class="script-display">
      <h3 class="script-title">
        {{ scriptContent.title || '未命名剧本' }}
        <el-tag size="small">{{ episodeCount }}集</el-tag>
        <el-tag size="small" type="info">{{ sceneCount }}场</el-tag>
      </h3>

      <!-- 按集折叠展示 -->
      <el-collapse v-model="expandedEpisodes">
        <el-collapse-item
          v-for="(ep, epIdx) in (scriptContent.episodes || [])"
          :key="ep.id"
          :name="ep.id"
          class="episode-card"
        >
          <template #title>
            <span class="ep-title">
              <strong>{{ ep.title }}</strong>
              <el-tag size="small" type="info">{{ ep.scenes?.length || 0 }}场</el-tag>
            </span>
          </template>

          <!-- 场景列表 -->
          <div v-for="(scene, sIdx) in (ep.scenes || [])" :key="scene.id" class="scene-item">
            <div class="scene-header">
              <span class="scene-number">第{{ scene.scene_number }}场</span>
              <el-tag size="small" effect="plain">{{ scene.location }}</el-tag>
              <el-tag size="small" type="info">{{ scene.time_of_day }}</el-tag>
            </div>
            <div class="scene-visual">
              <el-icon><Picture /></el-icon>
              {{ scene.visual_description }}
            </div>
            <div class="scene-characters">
              {{ (scene.characters || []).join('、') }}
            </div>
            
            <!-- 对白 -->
            <div class="dialogue-list">
              <div v-for="(line, dIdx) in (scene.dialogue || [])" :key="dIdx" class="dialogue-item">
                <span class="speaker">{{ line.character }}</span>
                <span class="emotion-tag" v-if="line.emotion">{{ line.emotion }}</span>
                <p class="dialogue-text">{{ line.text }}</p>
                <span class="action-text" v-if="line.action">{{ line.action }}</span>
              </div>
            </div>
            
            <div class="scene-duration">预计时长: {{ scene.estimated_duration }}秒</div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="!generating" description="输入创意或文本后开始AI编剧">
      <div class="quick-templates">
        <p style="margin-bottom: 10px; color: var(--text-secondary);">快速模板：</p>
        <el-button size="small" round @click="inputText = '都市职场题材，一个普通打工人意外获得读心术能力，在职场逆袭的故事'">🏢 都市职场</el-button>
        <el-button size="small" round @click="inputText = '古代穿越题材，现代女孩穿越到古代成为公主，用现代知识改变命运'">👸 古代穿越</el-button>
        <el-button size="small" round @click="inputText = '悬疑推理题材，一桩看似普通的失踪案背后隐藏着惊天秘密'">🔍 悬疑推理</el-button>
        <el-button size="small" round @click="inputText = '甜宠恋爱题材，霸道总裁和笨拙实习生之间的欢喜冤家故事'">💕 甜宠恋爱</el-button>
      </div>
    </el-empty>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { MagicStick, Check, User, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'

const route = useRoute()
const editorStore = useEditorStore()
const projectStore = useProjectStore()

const inputText = ref('')
const generating = ref(false)
const expandedEpisodes = ref([])

// 从store获取剧本内容
const scriptContent = computed(() => editorStore.script?.content)
const episodeCount = computed(() => scriptContent.value?.episodes?.length || 0)
const sceneCount = computed(() => {
  return (scriptContent.value?.episodes || []).reduce((sum, e) => sum + (e.scenes?.length || 0), 0)
})

async function handleGenerate() {
  if (!inputText.value.trim()) {
    ElMessage.warning('请先输入创作内容')
    return
  }
  generating.value = true
  try {
    const res = await editorStore.generateScript(route.params.id, inputText.value)
    ElMessage.success(`✅ 剧本《${res.data.title}》生成成功！`)
    expandedEpisodes.value = (res.data.script?.episodes || []).map(e => e.id)
  } catch(e) {
    console.error('生成失败:', e)
    ElMessage.error('剧本生成失败，请检查API配置')
  } finally {
    generating.value = false
  }
}

async function handleSave() {
  try {
    await editorStore.saveScript(route.params.id, {
      content: typeof scriptContent.value === 'string' ? scriptContent.value : JSON.stringify(scriptContent.value),
      raw_text: inputText.value,
    })
    ElMessage.success('剧本已保存')
  } catch(e) { ElMessage.error('保存失败') }
}

async function handleExtract() {
  try {
    const res = await editorStore.extractCharacters ? 
      await api.character.extract(route.params.id) :
      await fetch(`/api/projects/${route.params.id}/characters`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ action: 'extract_from_script' })
      }).then(r => r.json())
    
    // 刷新角色列表
    await editorStore.loadCharacters(route.params.id)
    // 自动切换到角色Tab
    activeTab.value = 'character'
    ElMessage.success(`成功提取${res.data?.data?.length || 0}个角色`)
  } catch(e) { ElMessage.error('提取角色失败') }
}
</script>

<style scoped>
.script-editor { padding: 4px 0; }

.editor-toolbar {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 20px;
  margin-bottom: 20px;
  border: 1px solid var(--border-color);
}
.input-area { margin-bottom: 14px; }
.toolbar-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.script-display {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 24px;
  border: 1px solid var(--border-color);
}
.script-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.episode-card { margin-bottom: 4px; }
.ep-title { display: flex; align-items: center; gap: 8px; }

.scene-item {
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  margin-bottom: 12px;
  border-left: 3px solid var(--primary);
}
.scene-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.scene-number {
  font-weight: 600;
  color: var(--primary-light);
  font-size: 13px;
}
.scene-visual {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  line-height: 1.5;
}
.scene-characters {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.dialogue-list { margin-bottom: 8px; }
.dialogue-item {
  padding: 8px 12px;
  background: rgba(0, 102, 255, 0.05);
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
  border-left: 2px solid var(--border-color);
}
.speaker {
  font-weight: 600;
  color: var(--primary-light);
  font-size: 13px;
  margin-right: 6px;
}
.emotion-tag {
  font-size: 11px;
  color: var(--warning);
  margin-right: 6px;
}
.dialogue-text {
  color: var(--text-primary);
  font-size: 14px;
  margin: 4px 0;
  line-height: 1.6;
}
.action-text {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.scene-duration {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}

.quick-templates { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
</style>
