# 她测 Web 源码部署说明

## 交付内容

本目录是可直接安装、构建的 Next.js 全栈源码，包含：

- Web 前端、接口路由与 Prisma 数据模型；
- 规则库源码与规则镜像数据；
- 当前“悦历”和“美柚”两个演示项目的 SQLite 数据库；
- 两个项目实际使用的截图与文档材料。

交付压缩包不会包含 `.env`、模型密钥、`node_modules`、`.next`、运行日志或历史缓存。

## 环境要求

- Node.js 20 或更高版本；
- pnpm；
- 可访问 StepFun API 的网络环境；
- 持久化可写目录：`prisma/` 与 `data/uploads/`。

## 部署步骤

1. 复制 `.env.example` 为 `.env`。
2. 在 `.env` 中填写 `STEPFUN_API_KEY`，并按部署环境检查 `STEP_BASE_URL`。
3. 安装依赖：`pnpm install`。
4. 同步数据库结构：`pnpm db:push`。
5. 正式构建：`pnpm build`。
6. 启动服务：`pnpm exec next start -p 3013`。

浏览器访问 `http://服务器地址:3013`。根页面返回 HTTP 200 即表示服务已启动。

## 实时模型说明

用户项目的初步分析、待办对话、高风险复核和泡芙助手均通过 StepFun 实时模型生成。生产环境未配置 `STEPFUN_API_KEY` 时，系统会明确报错，不会自动生成模拟结论。确定性 mock 仅供 `NODE_ENV=test` 的自动化测试使用。

## 数据与部署注意事项

- 当前使用 SQLite，适合单实例演示部署；多实例生产部署需要另行迁移数据库方案。
- `prisma/dev.db` 已包含悦历和美柚两个演示项目，不要在部署后再次运行 `pnpm db:seed`，除非确实需要重建悦历演示数据。
- `data/uploads/` 保存项目材料，容器化部署时必须挂载持久化卷。
- 不要把 `.env`、模型密钥或包含真实用户信息的运行数据库提交到公开代码仓库。
