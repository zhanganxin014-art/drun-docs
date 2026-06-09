<template>
  <div class="adflow-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title"><el-icon><DataAnalysis /></el-icon> 模拟投流分析</h2>
      <el-tag type="warning" size="large" effect="dark">Beta</el-tag>
    </div>

    <!-- 已选素材 + 投放参数 -->
    <div class="adflow-layout">
      <!-- 左：素材选择 + 投放参数 -->
      <div class="adflow-left">
        <!-- 素材选择 -->
        <el-card shadow="never" class="section-card">
          <template #header>
            <span class="section-title">🎬 选择精彩片段（可多选）</span>
          </template>
          <div v-loading="loadingCandidates" class="candidate-list">
            <el-empty v-if="candidates.length === 0" description="暂无已生成视频的分镜，请先完成视频合成" :image-size="80" />
            <div
              v-for="item in candidates"
              :key="item.id"
              class="candidate-item"
              :class="{ selected: selectedIds.has(item.id) }"
              @click="toggleSelect(item)"
            >
              <div class="candidate-thumb">
                <video
                  v-if="item.video_path"
                  :src="getVideoUrl(item.video_path)"
                  muted
                  preload="metadata"
                  @mouseenter="playPreview($event)"
                  @mouseleave="pausePreview($event)"
                />
                <img v-else-if="item.image_path" :src="getImageUrl(item.image_path)" />
                <span v-else>🎬</span>
              </div>
              <div class="candidate-info">
                <strong>#{{ item.scene_index }}</strong>
                <p class="candidate-desc">{{ item.description?.substring(0, 40) || '无描述' }}</p>
                <el-tag size="small" type="info">{{ (item.duration || 5) }}s</el-tag>
              </div>
              <el-icon v-if="selectedIds.has(item.id)" class="check-icon"><CircleCheckFilled /></el-icon>
            </div>
          </div>
          <div class="selected-bar" v-if="selectedIds.size > 0">
            已选 <strong>{{ selectedIds.size }}</strong> 个片段，总时长 {{ totalDuration }}s
          </div>
        </el-card>

        <!-- 投放参数 -->
        <el-card shadow="never" class="section-card" style="margin-top: 16px;">
          <template #header>
            <span class="section-title">⚙️ 投放参数设置</span>
          </template>
          <el-form :model="params" label-width="110px" size="default">
            <el-form-item label="投放平台">
              <el-checkbox-group v-model="params.platforms">
                <el-checkbox label="douyin">抖音</el-checkbox>
                <el-checkbox label="kuaishou">快手</el-checkbox>
                <el-checkbox label="xiaohongshu">小红书</el-checkbox>
                <el-checkbox label="wechat">微信视频号</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="总预算 (¥)">
              <el-input-number v-model="params.budget" :min="500" :max="1000000" :step="500" style="width: 100%;" />
              <div class="form-hint">建议：短剧投流预算 ≥ ¥3,000/天</div>
            </el-form-item>
            <el-form-item label="投放时长">
              <el-select v-model="params.durationDays" style="width: 100%;">
                <el-option label="1 天（测试）" :value="1" />
                <el-option label="3 天" :value="3" />
                <el-option label="7 天（推荐）" :value="7" />
                <el-option label="14 天" :value="14" />
                <el-option label="30 天" :value="30" />
              </el-select>
            </el-form-item>
            <el-form-item label="CPM (¥)">
              <el-input-number v-model="params.cpm" :min="5" :max="200" :step="1" style="width: 100%;" />
              <div class="form-hint">千次曝光成本，短剧均值 ¥20~50</div>
            </el-form-item>
            <el-form-item label="点击率 CTR (%)">
              <el-input-number v-model="params.ctr" :min="0.5" :max="15" :step="0.1" style="width: 100%;" />
              <div class="form-hint">短剧广告均值 1.5%~5%</div>
            </el-form-item>
            <el-form-item label="转化率 CVR (%)">
              <el-input-number v-model="params.cvr" :min="0.1" :max="10" :step="0.1" style="width: 100%;" />
              <div class="form-hint">点击到付费/订阅的转化率</div>
            </el-form-item>
            <el-form-item label="客单价 (¥)">
              <el-input-number v-model="params.unitPrice" :min="1" :max="5000" :step="10" style="width: 100%;" />
              <div class="form-hint">用户付费均价（会员/解锁/购买）</div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" size="large" style="width:100%" @click="runSimulation" :loading="simulating">
                🚀 开始模拟投流
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </div>

      <!-- 右：分析结果 -->
      <div class="adflow-right">
        <!-- 无结果提示 -->
        <el-empty v-if="!result" description="设置投放参数，点击「开始模拟投流」查看分析" :image-size="120" />

        <template v-else>
          <!-- 核心指标卡片 -->
          <el-card shadow="never" class="section-card result-cards">
            <template #header>
              <span class="section-title">📊 核心指标</span>
            </template>
            <div class="metric-grid">
              <div class="metric-card metric-blue">
                <div class="metric-value">{{ fmt(result.totalImpressions) }}</div>
                <div class="metric-label">预估总曝光</div>
              </div>
              <div class="metric-card metric-green">
                <div class="metric-value">{{ fmt(result.totalClicks) }}</div>
                <div class="metric-label">预估总点击</div>
              </div>
              <div class="metric-card metric-purple">
                <div class="metric-value">{{ fmt(result.totalConversions) }}</div>
                <div class="metric-label">预估转化数</div>
              </div>
              <div class="metric-card metric-orange">
                <div class="metric-value">{{ result.totalPlays >= 10000 ? (result.totalPlays/10000).toFixed(1)+'万' : fmt(result.totalPlays) }}</div>
                <div class="metric-label">预估播放量</div>
              </div>
            </div>
          </el-card>

          <!-- 收益分析 -->
          <el-card shadow="never" class="section-card" style="margin-top: 16px;">
            <template #header>
              <span class="section-title">💰 收益分析</span>
            </template>
            <div class="metric-grid">
              <div class="metric-card metric-red">
                <div class="metric-value">¥{{ fmt(result.totalCost) }}</div>
                <div class="metric-label">总成本</div>
              </div>
              <div class="metric-card metric-green">
                <div class="metric-value">¥{{ fmt(result.totalRevenue) }}</div>
                <div class="metric-label">总收益</div>
              </div>
              <div class="metric-card" :class="result.roi >= 1 ? 'metric-green' : 'metric-red'">
                <div class="metric-value">{{ result.roi.toFixed(2) }}</div>
                <div class="metric-label">ROI（投资回报率）</div>
              </div>
              <div class="metric-card" :class="result.roas >= 1 ? 'metric-green' : 'metric-red'">
                <div class="metric-value">{{ result.roas.toFixed(2) }}x</div>
                <div class="metric-label">ROAS（广告支出回报）</div>
              </div>
            </div>
            <el-alert
              v-if="result.roi < 1"
              title="当前参数下 ROI < 1，投放将亏损！建议调整：降低 CPM、提高 CVR、或提高客单价"
              type="error"
              :closable="false"
              style="margin-top: 12px;"
            />
            <el-alert
              v-else-if="result.roi >= 2"
              title="ROI ≥ 2，投放表现优秀！可考虑扩大预算或延长投放时长"
              type="success"
              :closable="false"
              style="margin-top: 12px;"
            />
            <el-alert
              v-else
              title="ROI 介于 1~2 之间，投放微利，可尝试优化素材或定向"
              type="warning"
              :closable="false"
              style="margin-top: 12px;"
            />
          </el-card>

          <!-- 导出素材 -->
          <el-card shadow="never" class="section-card" style="margin-top: 16px;">
            <template #header>
              <span class="section-title">📦 导出投流素材</span>
            </template>
            <p class="export-hint">已选 {{ selectedIds.size }} 个精彩片段，可导出为投放素材包</p>
            <div class="export-actions">
              <el-button type="primary" @click="exportMaterials('mp4')">
                📹 导出 MP4 素材包
              </el-button>
              <el-button type="success" @click="exportMaterials('info')">
                📝 生成投放说明文档
              </el-button>
              <el-button @click="exportMaterials('schedule')">
                📅 生成投放排期建议
              </el-button>
            </div>
            <div v-if="exportResult" class="export-result">
              <el-alert type="success" :closable="false">
                {{ exportResult }}
              </el-alert>
            </div>
          </el-card>

          <!-- 分平台预估 -->
          <el-card shadow="never" class="section-card" style="margin-top: 16px;">
            <template #header>
              <span class="section-title">📱 分平台预估</span>
            </template>
            <el-table :data="platformBreakdown" size="small" style="width:100%">
              <el-table-column prop="platform" label="平台" width="120" />
              <el-table-column prop="budget" label="预算 (¥)" width="100" align="right">
                <template #default="{ row }">¥{{ fmt(row.budget) }}</template>
              </el-table-column>
              <el-table-column prop="impressions" label="曝光" align="right">
                <template #default="{ row }">{{ fmt(row.impressions) }}</template>
              </el-table-column>
              <el-table-column prop="clicks" label="点击" align="right">
                <template #default="{ row }">{{ fmt(row.clicks) }}</template>
              </el-table-column>
              <el-table-column prop="conversions" label="转化" align="right">
                <template #default="{ row }">{{ fmt(row.conversions) }}</template>
              </el-table-column>
              <el-table-column prop="revenue" label="收益 (¥)" align="right">
                <template #default="{ row }">¥{{ fmt(row.revenue) }}</template>
              </el-table-column>
              <el-table-column prop="roi" label="ROI" width="80" align="right">
                <template #default="{ row }">
                  <el-tag :type="row.roi >= 1 ? 'success' : 'danger'" size="small">{{ row.roi.toFixed(2) }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataAnalysis, CircleCheckFilled } from '@element-plus/icons-vue'
import { useProjectStore } from '../stores/project'

const route = useRoute()
const projectStore = useProjectStore()

const loadingCandidates = ref(false)
const candidates = ref([])
const selectedIds = ref(new Set())
const simulating = ref(false)
const result = ref(null)
const platformBreakdown = ref([])
const exportResult = ref('')

const params = ref({
  platforms: ['douyin', 'xiaohongshu'],
  budget: 5000,
  durationDays: 7,
  cpm: 30,
  ctr: 3.0,
  cvr: 2.0,
  unitPrice: 29,
})

const totalDuration = computed(() => {
  return Array.from(selectedIds.value).reduce((sum, id) => {
    const item = candidates.value.find(c => c.id === id)
    return sum + (item?.duration || 5)
  }, 0)
})

function toggleSelect(item) {
  const s = new Set(selectedIds.value)
  if (s.has(item.id)) s.delete(item.id); else s.add(item.id)
  selectedIds.value = s
}

function getVideoUrl(path) {
  if (!path) return ''
  const base = '/static'
  if (path.startsWith('/')) return base + path
  return `${base}/${path}`
}
function getImageUrl(path) {
  if (!path) return ''
  const base = '/static'
  if (path.startsWith('/')) return base + path
  return `${base}/${path}`
}
function playPreview(e) { e.target.currentTime = 0; e.target.play().catch(() => {}) }
function pausePreview(e) { e.target.pause() }
function fmt(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return Number(n || 0).toLocaleString('zh-CN')
}

// 核心模拟计算
function runSimulation() {
  if (selectedIds.value.size === 0) {
    ElMessage.warning('请先选择至少一个精彩片段')
    return
  }
  if (params.value.platforms.length === 0) {
    ElMessage.warning('请至少选择一个投放平台')
    return
  }

  simulating.value = true

  // 延迟一下让 UI 更新
  setTimeout(() => {
    const p = params.value
    const dailyBudget = p.budget / p.durationDays

    // 核心计算
    const totalImpressions = Math.round(p.budget / p.cpm * 1000)
    const totalClicks = Math.round(totalImpressions * p.ctr / 100)
    const totalConversions = Math.round(totalClicks * p.cvr / 100)
    const totalCost = p.budget
    const totalRevenue = totalConversions * p.unitPrice
    const roi = totalCost > 0 ? totalRevenue / totalCost : 0
    const roas = totalCost > 0 ? (totalRevenue / totalCost) : 0

    // 预估播放量（通常曝光量的 60%~90% 会转化为播放）
    const playRate = 0.75
    const totalPlays = Math.round(totalImpressions * playRate)

    result.value = {
      totalImpressions,
      totalClicks,
      totalConversions,
      totalCost,
      totalRevenue,
      roi,
      roas,
      totalPlays,
    }

    // 分平台拆解
    const platformNames = { douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书', wechat: '微信视频号' }
    const platformWeights = { douyin: 0.45, kuaishou: 0.20, xiaohongshu: 0.20, wechat: 0.15 }
    platformBreakdown.value = p.platforms.map(key => {
      const weight = platformWeights[key] || 1 / p.platforms.length
      const pb = Math.round(totalImpressions * weight)
      const pc = Math.round(pb * p.ctr / 100)
      const pv = Math.round(pc * p.cvr / 100)
      return {
        platform: platformNames[key] || key,
        budget: Math.round(totalCost * weight),
        impressions: pb,
        clicks: pc,
        conversions: pv,
        revenue: pv * p.unitPrice,
        roi: totalCost * weight > 0 ? (pv * p.unitPrice) / (totalCost * weight) : 0,
      }
    })

    simulating.value = false
    ElMessage.success('模拟投流分析完成！')
  }, 300)
}

// 导出素材
function exportMaterials(type) {
  const ids = Array.from(selectedIds.value)
  const items = ids.map(id => candidates.value.find(c => c.id === id)).filter(Boolean)

  if (type === 'mp4') {
    exportResult.value = `✅ 素材包已准备！包含 ${ids.length} 个 MP4 文件，总时长 ${totalDuration.value}s。请前往"视频合成"页面下载视频文件。`
  } else if (type === 'info') {
    const lines = items.map((it, i) => {
      return `【素材${i+1}】分镜#${it.scene_index} | 时长${it.duration || 5}s | ${it.description?.substring(0, 30) || ''}`
    }).join('\n')
    exportResult.value = `✅ 投放说明文档已生成（可复制）：\n\n${lines}\n\n投放平台：${params.value.platforms.join('、')}\n预算：¥${params.value.budget}/天\n投放时长：${params.value.durationDays}天`
  } else if (type === 'schedule') {
    exportResult.value = `✅ 投放排期建议已生成：\n\n第1-2天：冷启动测试，预算 ${Math.round(params.value.budget * 0.3)}¥/天，观察 CTR\n第3-5天：CTR>2% 则加倍预算，放量投放\n第6-${params.value.durationDays}天：稳定投放，ROI<1 则暂停，ROI>2 则持续加量`
  }
}

// 加载候选视频片段
async function loadCandidates() {
  const pid = route.params.id
  if (!pid) return
  loadingCandidates.value = true
  try {
    const res = await fetch(`/api/projects/${pid}/storyboards`).then(r => r.json())
    if (res.code === 0 && res.data) {
      // 只保留真实可用的视频（后端已验证 video_available）
      candidates.value = res.data.filter(s => s.video_available && s.video_path)
    }
  } catch (e) {
    console.error('加载候选片段失败', e)
  } finally {
    loadingCandidates.value = false
  }
}

onMounted(() => {
  loadCandidates()
})
</script>

<style scoped>
.adflow-page { padding: 0; }
.page-header {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 20px;
}
.page-title {
  font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px;
}
.adflow-layout {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 20px;
  align-items: start;
}
.section-card { border-radius: 8px; }
.section-title { font-weight: 600; font-size: 14px; }

/* 素材列表 */
.candidate-list {
  max-height: 420px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
}
.candidate-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; border-radius: 8px; cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s;
}
.candidate-item:hover { background: var(--bg-card); }
.candidate-item.selected { border-color: var(--primary); background: var(--primary-bg); }
.candidate-thumb {
  width: 80px; height: 48px; border-radius: 6px; overflow: hidden;
  background: #222; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.candidate-thumb video, .candidate-thumb img {
  width: 100%; height: 100%; object-fit: cover;
}
.candidate-info { flex: 1; min-width: 0; }
.candidate-desc { font-size: 12px; color: var(--text-secondary); margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.check-icon { color: var(--primary); font-size: 20px; flex-shrink: 0; }
.selected-bar {
  margin-top: 10px; padding: 8px 12px; border-radius: 6px;
  background: var(--primary-bg); color: var(--primary); font-size: 13px;
}

/* 指标卡片 */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.metric-card {
  padding: 16px; border-radius: 8px; text-align: center;
}
.metric-value { font-size: 22px; font-weight: 700; }
.metric-label { font-size: 12px; margin-top: 4px; color: var(--text-secondary); }
.metric-blue { background: #ecf5ff; color: #409eff; }
.metric-green { background: #f0f9eb; color: #67c23a; }
.metric-purple { background: #f9ecff; color: #9c27b0; }
.metric-orange { background: #fff7e6; color: #e6a23c; }
.metric-red { background: #fef0f0; color: #f56c6c; }

.form-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

.export-hint { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }
.export-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.export-result { margin-top: 12px; }

/* 响应式 */
@media (max-width: 1100px) {
  .adflow-layout { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
