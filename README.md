# 她测 HerSafe QA

面向产品经理、设计师和测试人员的**女性友好与安全情境审查工具**。

> 她测不是通用 UI 可用性工具。截图和图层用于定位证据，产品最终审查的是女性在隐私、控制、位置、骚扰与求助情境中的安全。
>
> 本项目不构成法律意见、安全认证，也不替代真实女性用户研究和专业安全评审。

产品文档：[`docs/USAGE.md`](docs/USAGE.md)（使用文档）· [`docs/PRD.md`](docs/PRD.md)（需求基线）· [`docs/ROADMAP.md`](docs/ROADMAP.md)（开发路线）

## 快速开始

```bash
# 环境要求：Node 20+、pnpm 10+
pnpm install          # 安装依赖（原生构建脚本已在 pnpm-workspace.yaml 放行；postinstall 自动装 Chromium 并生成 Prisma 客户端）
pnpm db:push          # 初始化 SQLite 数据库（prisma/dev.db）
pnpm db:seed          # （可选）生成演示项目：截图→图层→待办→对话→确认写入→报告
pnpm dev              # 启动 http://localhost:3000
```

真实模型服务方：复制 `.env.example` 为 `.env`，填入 `STEPFUN_API_KEY`（阶跃星辰 StepFun，OpenAI 兼容接口）。
用户项目的初步分析、待办对话与高风险复核只允许真实模型调用；未配置 Key 时系统会明确报错，不会用预生成案例冒充分析结果。确定性 Mock 仅用于自动化测试。

网站抓取与 PDF 导出需要 Chromium（可选）：`pnpm install` 的 postinstall 已自动安装；若曾跳过，手动执行 `pnpm exec playwright install chromium`。

## 演示动线（黑客松脚本，对应 ROADMAP §8）

1. 首页开场声明 → 创建项目（或打开 seed 生成的演示项目）
2. 上传材料：URL / 截图优先，PDF / 文档补充（超限明确报错，重复图 pHash 去重）
3. 证据包与交互覆盖 → 确认产品理解
4. 图层审查台：标注模式核对候选图层 → 手工框选补一个漏识别 → 切风险图层模式看四态
5. 五选项确认流 → “截图未上传”唤起补充截图（进待复核，不消除风险）
6. 打开待办（零模型调用）→ 对话补充事实 → 拟写入证据摘要 → **确认 → 只更新关联风险**
7. 报告页：四类结论 / 来源 / 三类事实 / GWT 用例 → 导出 Markdown / PDF

## 技术栈与架构

Next.js 15（App Router）+ React 19 + TypeScript strict · Tailwind CSS · Zustand · Prisma + SQLite（正式版迁移 PostgreSQL）· Playwright（取证/导出）· sharp + 自研 pHash · pdfjs / mammoth / Tesseract.js · Vitest

```
app/
├── page.tsx                     # 上传产品页（项目列表/创建）
├── projects/[id]/page.tsx       # 图层审查与待办（审查台）
├── projects/[id]/report/        # 风险报告页
└── api/                         # projects / artifacts / analysis / controls
                                 # / todos(+messages,confirm) / report(+export) / uploads
lib/
├── ai-gateway/                  # ★ 模型调用唯一出口（三函数 + 缓存/预算/重试/记录）
│   ├── index.ts                 # analyzeProject / continueTodo / verifyHighRisk
│   ├── provider.ts mock.ts prompts.ts
│   └── cache.ts budget.ts retry.ts invocation-log.ts
├── layers/detect.ts             # ★ 图层引擎（Sobel+连通区域+矩形合并，纯函数零模型）
├── parsers/                     # image(pHash) / docs(pdf,docx,md,txt) / url(playwright) / ocr
├── services/                    # ingest / analysis / todo-chat / evidence-update(事务)
├── rules/                       # 规则库 v0（25 条/五维度，带研究来源）+ 评测集 v0（15 组）
├── state/todo-machine.ts        # 待办状态机（集中管理）
└── report.ts                    # 报告构建 + Markdown 渲染
prisma/schema.prisma             # 十大核心对象（PRD §4）
tests/                           # Vitest：图层算法 / 状态机 / pHash / 规则库
```

## AI 调用边界（PRD §5）

**不调用 AI**：解析管线、图层检测、状态同步、报告排版——全部确定性程序，零模型费用。

**只经网关三函数调用**：

| 函数 | 触发 | 频控 |
|---|---|---|
| `analyzeProject` | 用户点击“触发初始分析” | 每项目原则上一次 |
| `continueTodo` | 待办对话中用户发言 | 每待办 ≤3 轮，第 4 轮拦截转人工 |
| `verifyHighRisk` | 高严重度 Finding 自动复核 | 高风险 100% |

横切能力：输入 Hash 缓存（同材料+版本不重复计费）、三档预算（日/项目/用户）、有限重试（格式/限流/网络；密钥/预算/权限不重试）、zod 双层校验 + 一次修复重提示、ModelInvocation 全量留痕（模型/Prompt/规则/Schema 版本 + 输入 Hash，结论可复现）。

## 产品不变量（裁决依据）

1. 证据不足 ≠ 风险：材料缺失只生成待办/假设，永不直接判缺陷
2. 用户确认前不写入；确认后事务提交，失败回滚
3. 一次补充只更新关联 Finding；跨风险影响 → 新建关联待办
4. 确定性优先，AI 按需调用
5. 审查情境不审查审美（严格五维度）

## 常用脚本

```bash
pnpm dev / build / start     # 开发 / 构建 / 生产
pnpm lint / typecheck        # ESLint / tsc
pnpm test                    # Vitest 单测
pnpm db:push / db:seed       # 建库 / 演示数据
```

## 研究依据

规则库每条标注来源：[GenderMag](https://gendermag.org) · UN Women（技术促成的针对女性的暴力）· Safety Net Project 开发者指南 · Refuge Tech Safety 开发者清单。
