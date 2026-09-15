# Vercel 部署评估

需求 R2：尝试评估整站 Vercel 一键部署；无法在现有架构下直接实现时放弃。核对日期：2026-09-15。

结论：本轮不提供整站 Deploy Button 或未经验证的 Vercel 配置，继续采用 [RUN.md](../RUN.md) 的 Compose 部署。

Vercel 已支持 OCI 容器和多服务部署，所以不能仅因后端使用 C++ 就判定无法部署。但容器实例无状态，持久数据需外置。[官方容器说明](https://vercel.com/kb/guide/does-vercel-support-docker-deployments)

当前仓库依赖 Compose 提供 PostgreSQL 持久卷、一次性迁移与启动顺序，以及后端独占的本地 storage 目录。后端启动时还会检查数据库结构和存储目录。Vercel Functions 的文件系统不能代替现有持久卷。[运行时及文件系统说明](https://vercel.com/docs/functions/runtimes)

完整迁移需要外部 PostgreSQL、可靠的迁移发布流程、持久对象存储实现，并验证容器构建、数据库连接和伸缩时的认证行为。仅增加 vercel.json 或按钮不能完成这些工作。按本次“不能则放弃”的范围，不为部署平台重写后端或增加存储基础设施。

前端本身是 Next.js，可以独立部署到 Vercel，但仍需已经部署好的 HTTPS 后端，并配置 BACKEND_API_URL、ADMIN_ORIGIN 和安全 Cookie。这属于分离部署，不代表整站一键部署，本轮未创建或发布 Vercel 项目。
