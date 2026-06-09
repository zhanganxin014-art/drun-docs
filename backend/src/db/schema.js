/**
 * 数据库Schema定义 - 供Drizzle ORM或直接查询参考
 * 实际使用better-sqlite3原生查询，此文件作为文档参考
 */

module.exports = {
  // 项目状态枚举
  projectStatus: {
    DRAFT: 'draft',        // 草稿
    SCRIPTING: 'scripting', // 编剧中
    STORYBOARD: 'storyboard', // 分镜中
    GENERATING: 'generating', // 生成中
    COMPLETED: 'completed',   // 已完成
  },

  // 任务状态枚举
  taskStatus: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },

  // 任务类型枚举
  taskType: {
    GENERATE_SCRIPT: 'generate_script',
    GENERATE_CHARACTER_IMAGE: 'generate_character_image',
    GENERATE_SCENE_IMAGE: 'generate_scene_image',
    GENERATE_STORYBOARD: 'generate_storyboard',
    GENERATE_VIDEO: 'generate_video',
    TTS_GENERATE: 'tts_generate',
    COMPOSE_VIDEO: 'compose_video',
  },

  // 素材类型
  assetType: {
    CHARACTER: 'character',     // 角色形象
    SCENE: 'scene',             // 场景图
    STORYBOARD: 'storyboard',   // 分镜图
    VIDEO: 'video',             // 视频片段
    AUDIO: 'audio',             // 音频
    COVER: 'cover',             // 封面
  },

  // 镜头类型
  shotType: {
    WIDE_SHOT: '全景',         // 全景/远景
    FULL_SHOT: '全身',          // 全身镜头
    MEDIUM_SHOT: '中景',        // 中景(腰部以上)
    CLOSE_UP: '近景',           // 近景(胸部以上)
    EXTREME_CLOSEUP: '特写',    // 特写(面部细节)
  },

  // 角色动作数据结构 (character_actions JSON)
  // [
  //   {
  //     "character_id": 1,    // 角色ID
  //     "role": "lead",       // lead | support | extra
  //     "position": "会议桌主位", // 空间位置
  //     "action": "面色铁青地坐着", // 动作描述
  //     "expression": "愤怒",   // 表情
  //     "is_speaking": false,  // 是否为当前说话者
  //     "stance": "seated"     // seated | standing
  //   }
  // ]
  characterActionRoles: {
    LEAD: 'lead',       // 主位/主角
    SUPPORT: 'support', // 配角
    EXTRA: 'extra',     // 背景/群演
  },
};
