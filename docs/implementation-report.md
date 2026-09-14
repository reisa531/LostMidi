# Implementation Report

验证日期：2026-09-13。以下区分实际执行结果与尚未完成的运行验证。

## Created

- Next.js App Router 前端：`/`、`/midis`、`/midis/[slug]`、`/people/[id]`、`/about`，包含分页、404、空数据和服务不可用状态。
- C++20 / Drogon 后端：midi、person、recovery 模块，Controller → Service → Repository，普通领域模型、环境配置、JSON 错误及结构化应用日志。
- PostgreSQL 七张领域表、版本化迁移、独立虚构 seed、数据库约束检查。SHA-256 全局唯一，作品级版权字段和可空历史信息。
- IObjectStorage、LocalObjectStorage、SHA-256、内部文件登记 Service；未增加公开上传或下载接口。
- Conan 2、target-based CMake、GoogleTest、Dockerfile、Compose、环境示例、Git 忽略规则、CI 工作流。
- 详细 README、数据库文档和五份 ADR。保留原有 GPLv3 许可证。

## Architecture

Browser → Next.js Server Components → REST API → 单进程 C++ Modular Monolith → PostgreSQL。

同步数据库访问在独立工作线程池运行，HTTP 事件循环不等待 SQL。文件存储通过独立接口管理，数据库只保存元数据。当前只读页面与 API 没有用户、社区或审核系统。

## How to Run

安装 Docker Desktop 并启用 Linux containers 后，在根目录执行：

```powershell
Copy-Item .env.example .env
docker compose up --build
```

前端默认 http://localhost:3000，后端默认 http://localhost:8080。此处是提供的启动流程，**本机未验证容器整栈成功启动**。原生 Linux / Windows 步骤及所有环境变量见 [README](../README.md)。

## Tests

实际运行通过：

| 检查 | 结果 |
| --- | --- |
| npm install / npm audit 汇总 | 安装成功，报告 0 vulnerabilities |
| npm run build | 通过，五个要求的页面路由均生成 |
| npm run lint | 通过，无 warning |
| npm run typecheck | 通过 |
| Conan 2.32.0 install | 成功，Drogon / OpenSSL 等在本机编译完成 |
| CMake configure + Release build | MSVC 19.29 / Windows SDK 10.0.19041，成功；最终项目构建无 warning |
| CTest | **10/10 通过**，包含真实 PostgreSQL Repository 集成测试，没有跳过 |
| PostgreSQL 17.11 migration + seed | 成功，示例三条档案可查询 |
| 再次执行 migration | 成功，已有 schema 和 seed 被跳过 |
| database/tests/constraints.sql | 通过，测试行回滚 |
| python scripts/smoke.py --api-only | 通过，真实 HTTP API + PostgreSQL |
| docker compose --env-file .env.example config --quiet | 通过 |
| git diff --check | 通过 |

API smoke 实际检查了 `/health`、`/ready`、分页第一/第二/空页、非法参数 400、不存在档案 404、`/api/v1/midis/example-midi` 详情、人物及作品署名关系。后端日志实际记录了 startup、database_connected、backend_listening 和 HTTP 错误。

真实集成测试发现并修复了 PostgreSQL LIMIT 的参数宽度问题：Drogon 使用二进制绑定时，分页大小需绑定为 int64，与 PostgreSQL 的 LIMIT 类型匹配。

## Known Limitations

- **前端运行时联调和浏览器视觉检查未完成。** 上一轮执行中，前端启动及隐藏窗口启动均被自动执行策略拒绝，仅返回 `blocked by policy`，没有提供进一步原因。未绕过该限制，未声称完整 smoke 或浏览器测试通过。
- **Docker 镜像构建及容器整栈运行未验证。** 本机没有可用 Docker daemon；客户端检查提示 docker_engine named pipe 不存在。Compose 语法验证不等同于镜像或服务运行验证。
- GitHub Actions 已提供，但未推送或执行远端工作流。
- Wayback 仅有接口；S3、MIDI 格式解析、公开导入/上传/下载均未实现。示例没有 MIDI 二进制，所以文件列表为空。
- 本地存储仅适合由后端独占目录的当前部署；数据库失败可能留下待清理对象。没有分布式写入协调或跨数据库/文件的事务。
- 列表署名使用逐条查询，分页计数与数据并非事务快照；当前限制 pageSize ≤ 100。Conan 未提交跨平台依赖 lockfile。
- 没有实施认证、贡献审核、社区、通知等第二阶段功能。

## Next Recommended Step

1. 在具有 Docker Engine 的环境执行 Compose 和完整 `python scripts/smoke.py`，检查桌面及移动页面。
2. 为发布平台固定 Conan 依赖解析结果，运行现有 CI，形成可重复的构建基线。
3. 增加小型本地 MIDI 导入命令，先实现格式校验、重复归属提示和失败对象清理。
4. 用真实档案需求细化来源可信度、年代不确定性及权利信息，再考虑审核与用户流程。

临时编译工具、测试数据库和日志位于 Git 忽略的 `.tools/`；它们不是项目运行依赖，不会随仓库提交。
