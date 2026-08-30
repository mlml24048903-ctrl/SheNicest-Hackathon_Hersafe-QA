// 规则库 v0 —— 25 条 / 五维度各 5 条（PRD §6.1 格式）【遗留回归夹具：仅旧版评测对照使用，不再进入运行链路】
// 研究依据：GenderMag、UN Women（技术促成的针对女性的暴力）、
// Safety Net Project 开发者指南、Refuge Tech Safety 开发者清单
// 版本冻结后随代码库发布；每条规则必须标注来源。

/** v0 旧五维枚举（自包含，避免耦合新版六维 zod Schema） */
export type LegacyDimension = "privacy" | "control" | "location" | "harassment" | "help";

export interface SafetyRule {
  rule_id: string;
  dimension: LegacyDimension;
  /** 核心问题陈述（一句话） */
  statement: string;
  /** 判定所需的最小证据 */
  evidence_required: string;
  source: string;
  version: string;
  examples: { positive: string; negative: string };
}

export const RULES_VERSION = "v0.1.0";

export const RULES_V0: SafetyRule[] = [
  // ===== 隐私暴露 PRI =====
  {
    rule_id: "PRI-001",
    dimension: "privacy",
    statement: "私信/求助类通知在锁屏与通知栏默认不暴露发送者身份与内容摘要。",
    evidence_required: "系统通知设置页截图、应用通知行为说明、锁屏状态截图",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "通知默认“隐藏内容”，解锁后才可见，且提供逐会话开关",
      negative: "锁屏明文显示“某某：你昨晚在哪里”，共享设备场景下直接暴露求助/社交关系",
    },
  },
  {
    rule_id: "PRI-002",
    dimension: "privacy",
    statement: "站内搜索与浏览历史不默认对他人可见，且可一键清空。",
    evidence_required: "搜索历史页截图、隐私设置页、他人视角的主页截图",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "历史仅自己可见，设置中有“暂停记录搜索历史”开关",
      negative: "搜索记录出现在个人主页“足迹”板块并默认公开",
    },
  },
  {
    rule_id: "PRI-003",
    dimension: "privacy",
    statement: "个人主页不默认展示真名、手机号、微信号等可直接线下联系的信息。",
    evidence_required: "个人资料页截图、他人视角主页截图、资料可见范围设置",
    source: "UN Women（技术促成的针对女性的暴力）",
    version: RULES_VERSION,
    examples: {
      positive: "手机号默认仅自己可见，公开展示需二次确认并提示风险",
      negative: "注册手机号自动生成公开主页字段“138****”且可被搜索",
    },
  },
  {
    rule_id: "PRI-004",
    dimension: "privacy",
    statement: "默认关闭“通过手机号/通讯录找到我”，开启时明确告知可被谁找到。",
    evidence_required: "账号发现/隐私设置页截图、注册流程截图",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "默认关闭通讯录匹配，开启时弹窗说明“通讯录中的人可能看到你”",
      negative: "注册即静默上传通讯录并向全部联系人推荐新账号，无退出选项",
    },
  },
  {
    rule_id: "PRI-005",
    dimension: "privacy",
    statement: "资料变更（头像、昵称、感情状态等）不以公开动态形式推送给关注者。",
    evidence_required: "资料编辑页截图、动态/消息通知设置页、变更后关注者视角截图",
    source: "UN Women（技术促成的针对女性的暴力）",
    version: RULES_VERSION,
    examples: {
      positive: "资料变更不产生公开动态，仅有本人可见的修改记录",
      negative: "修改感情状态自动向全部好友推送“她更新了感情状态”通知",
    },
  },

  // ===== 关系性控制 CTRL =====
  {
    rule_id: "CTRL-001",
    dimension: "control",
    statement: "提供当前登录设备列表，并支持一键下线其他设备。",
    evidence_required: "账号安全页截图（设备列表）、下线操作后的会话状态",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "设置→账号安全→登录设备管理，逐设备显示型号/地点/时间并可远程退出",
      negative: "只能“修改密码”间接踢出，且旧会话仍保持登录 7 天",
    },
  },
  {
    rule_id: "CTRL-002",
    dimension: "control",
    statement: "修改密码或启用安全锁后，其他设备会话立即失效。",
    evidence_required: "改密流程截图、改密后其他设备访问结果（截图或文档说明）",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "改密后所有 refresh token 吊销，其他设备需重新登录",
      negative: "改密后已登录的网页端与 App 端仍可正常收发私信",
    },
  },
  {
    rule_id: "CTRL-003",
    dimension: "control",
    statement: "第三方授权（OAuth）可集中查看并随时撤销，撤销后立即失效。",
    evidence_required: "授权管理页截图、撤销后第三方访问结果",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "设置→授权应用列表，逐项显示权限范围并支持一键解除",
      negative: "授权过的应用无管理入口，卸载后仍持续读取账号数据",
    },
  },
  {
    rule_id: "CTRL-004",
    dimension: "control",
    statement: "换绑手机号/邮箱需要旧联系方式验证或设置冷静期，防止账号被他人接管。",
    evidence_required: "换绑流程截图（验证步骤）、安全设置文档",
    source: "UN Women（技术促成的针对女性的暴力）",
    version: RULES_VERSION,
    examples: {
      positive: "换绑需旧手机验证码 + 24 小时冷静期通知双方",
      negative: "拿到登录态即可直接换绑手机号，原机主无任何通知",
    },
  },
  {
    rule_id: "CTRL-005",
    dimension: "control",
    statement: "共享/情侣/家庭类功能支持任何一方单方退出，退出后对方立即失去访问。",
    evidence_required: "共享功能设置页、退出流程截图、退出后对方视角状态",
    source: "GenderMag + UN Women",
    version: RULES_VERSION,
    examples: {
      positive: "“情侣空间”任一方可独立解除，解除后历史内容互不可见",
      negative: "解除共享需对方同意，或解除后对方仍能查看 30 天内的位置",
    },
  },

  // ===== 位置与行程 LOC =====
  {
    rule_id: "LOC-001",
    dimension: "location",
    statement: "定位权限提供“仅使用期间/单次”最小化选项，不强制“始终允许”。",
    evidence_required: "App 权限弹窗截图、系统权限设置页截图",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "权限弹窗含“仅本次允许”，拒绝定位后核心功能仍可用",
      negative: "不授予“始终允许”就无法使用任何功能",
    },
  },
  {
    rule_id: "LOC-002",
    dimension: "location",
    statement: "位置分享明确展示“谁可以看到我”的名单，并支持逐人关闭。",
    evidence_required: "位置分享设置页截图、分享对象列表",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "“我的位置”页列出全部可见对象与有效期，逐项可关",
      negative: "分享后无法查看名单，只能“对所有人关闭”",
    },
  },
  {
    rule_id: "LOC-003",
    dimension: "location",
    statement: "停止/关闭位置分享后，对方端立即显示失效且不再收到任何更新。",
    evidence_required: "关闭分享操作截图、对方视角失效状态截图或文档说明",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "关闭后对方地图显示“位置共享已结束”，最后位置不保留",
      negative: "关闭后对方仍能看到“最后已知位置”且持续刷新",
    },
  },
  {
    rule_id: "LOC-004",
    dimension: "location",
    statement: "运动/打卡类功能不公开“常去地点”与活动时间规律。",
    evidence_required: "个人主页/运动记录页截图、可见范围设置",
    source: "UN Women（技术促成的针对女性的暴力）",
    version: RULES_VERSION,
    examples: {
      positive: "路线与时间默认仅自己可见，分享前提示“将暴露行程规律”",
      negative: "跑步路线地图默认公开，含每天固定时段的起终点",
    },
  },
  {
    rule_id: "LOC-005",
    dimension: "location",
    statement: "提供一键关闭所有位置共享/隐藏位置的紧急总开关。",
    evidence_required: "安全中心或快捷设置页截图、总开关操作结果",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "安全中心首屏“紧急隐藏我的位置”按钮，一键暂停全部共享",
      negative: "需逐个功能分别关闭，共 5 处入口且分散在不同菜单",
    },
  },

  // ===== 骚扰阻断 HRAS =====
  {
    rule_id: "HRAS-001",
    dimension: "harassment",
    statement: "拉黑立即生效且覆盖私信、评论、@提及与群聊，无缓存残留。",
    evidence_required: "拉黑操作流程截图、拉黑后各触点（私信/评论/群聊）行为证据",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "拉黑后 1 秒内私信、评论、@、共同群聊消息全部不可见",
      negative: "拉黑后评论区历史消息仍可见，群聊中仍能@并收到提醒",
    },
  },
  {
    rule_id: "HRAS-002",
    dimension: "harassment",
    statement: "新注册账号无法立即搜索/私信被拉黑用户（注册门槛或频控）。",
    evidence_required: "新账号注册流程截图、新账号搜索/私信行为测试结果",
    source: "UN Women（技术促成的针对女性的暴力）",
    version: RULES_VERSION,
    examples: {
      positive: "新号 24 小时内无法发起陌生人私信，搜索受限流保护",
      negative: "被拉黑后对方 1 分钟内注册新号即可继续私信骚扰",
    },
  },
  {
    rule_id: "HRAS-003",
    dimension: "harassment",
    statement: "举报流程步骤明确，处理后向举报人反馈进度与结果通知。",
    evidence_required: "举报入口与流程截图、举报记录页、结果通知截图",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "举报单可查进度，48 小时内收到“已处理+处理方式”通知",
      negative: "提交举报后无任何回执，也无处理结果告知",
    },
  },
  {
    rule_id: "HRAS-004",
    dimension: "harassment",
    statement: "提供“仅好友可评论/仅关注的人可私信”等可见范围控制且实际生效。",
    evidence_required: "评论/私信权限设置页截图、陌生人视角行为测试",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "设置“仅关注的人可私信”后，陌生人私信入口消失",
      negative: "设置后陌生人仍可通过“打招呼”功能绕过发送消息",
    },
  },
  {
    rule_id: "HRAS-005",
    dimension: "harassment",
    statement: "支持彻底关闭陌生人私信，关闭后不被任何运营消息绕过。",
    evidence_required: "私信设置页截图、关闭后陌生人触达行为测试",
    source: "UN Women（技术促成的针对女性的暴力）",
    version: RULES_VERSION,
    examples: {
      positive: "“接收陌生人私信”总开关关闭后，系统活动通知也不进入私信列表",
      negative: "关闭后官方“匹配/推荐”消息仍每天弹入私信",
    },
  },

  // ===== 求助与补救 HELP =====
  {
    rule_id: "HELP-001",
    dimension: "help",
    statement: "聊天记录等证据可导出或安全保存（截图存证、导出文件、存证编号）。",
    evidence_required: "聊天设置页导出/存证功能截图、导出结果样本",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "单聊支持“导出含时间戳的聊天记录 PDF”并生成校验码",
      negative: "记录只能逐条手动截图，一次误删即无法举证",
    },
  },
  {
    rule_id: "HELP-002",
    dimension: "help",
    statement: "提供快速退出/伪装界面等紧急入口，可在压力场景下一步离开。",
    evidence_required: "快捷手势或紧急按钮说明、触发后的界面截图",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "连按电源键 3 次切换到伪装的“计算器”界面",
      negative: "退出需 5 步导航且无任何紧急入口",
    },
  },
  {
    rule_id: "HELP-003",
    dimension: "help",
    statement: "内容删除与账号注销流程清晰，删除后服务端与 CDN 数据实际清除。",
    evidence_required: "删除/注销流程截图、注销条款文档、删除后他人视角状态",
    source: "Refuge Tech Safety 开发者清单",
    version: RULES_VERSION,
    examples: {
      positive: "注销流程 3 步完成，条款写明“X 日内删除服务器与备份”",
      negative: "注销需客服人工审核 15 个工作日，期间头像仍在 CDN 可访问",
    },
  },
  {
    rule_id: "HELP-004",
    dimension: "help",
    statement: "举报/申诉处理结果会通知用户，含采纳与否及理由。",
    evidence_required: "通知中心截图、举报记录页结果状态",
    source: "Safety Net Project 开发者指南",
    version: RULES_VERSION,
    examples: {
      positive: "举报处理后在通知中心收到“已封禁对方账号”结果",
      negative: "处理结果仅在再次进入举报页时可见，无主动通知",
    },
  },
  {
    rule_id: "HELP-005",
    dimension: "help",
    statement: "安全中心提供反家暴/反骚扰求助热线等外部求助资源入口。",
    evidence_required: "安全中心页面截图、外部资源链接列表",
    source: "UN Women（技术促成的针对女性的暴力）",
    version: RULES_VERSION,
    examples: {
      positive: "“帮助与反馈”首屏列出 12338 妇女维权热线并说明何时使用",
      negative: "全站无任何求助资源指引，帮助中心仅含功能 FAQ",
    },
  },
];
