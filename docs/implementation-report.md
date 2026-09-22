# Implementation Report

## 2026-09-22：历史来源与寻回记录后台管理

已实现历史来源与寻回记录的逐条新增、编辑和删除，入口为 MIDI 编辑页的“管理来源与寻回”。来源支持网站名称、原始链接、观察时间范围、Wayback 链接和备注；寻回记录支持可空日期、可空贡献者、过程叙述和文本证据。保存立即反映到公开详情，不自动改变档案状态或作品署名，不抓取用户填写的 URL，也不包含文件上传与下载。

迁移 `004_optional_recovery_date.sql` 仅允许寻回日期为空，保留已有记录；未知日期不以记录创建时间代替。升级时必须先执行全部迁移至 004，再启动新后端。启动与 `/ready` 同时检查迁移记录及实际列的可空结构。来源、寻回记录、基本信息和署名共用作品 revision；记录变动与作品版本在同一事务提交，错误、跨作品操作和旧版本均不留下部分写入。编辑保留子记录 ID 与寻回记录创建时间。

表单一次编辑一条记录，删除需确认，401／409 保留输入并提供新页面登录或重新打开入口。UTC 日期保留六位微秒，人物选择支持分页和刷新。真实会话到期测试发现 React 自动重置表单会清空原生人物选择框，现已阻止该重置，并加入日期及人物关联保留的浏览器回归断言。

本轮使用新建的独立 PostgreSQL 17.11 集群、临时随机凭据和前端隔离副本；未读取真实 `.env`，未改动用户原有数据库。Playwright 使用独立 Edge 浏览器上下文，不读取个人浏览器资料。

| 实际执行 | 结果 |
| --- | --- |
| Windows CMake Release / CTest，连接专用 PostgreSQL | 23/23 通过，无跳过；覆盖真实 CRUD、并发版本冲突、跨作品保护、无效人物及 SQL 约束失败后的完整回滚 |
| 迁移与就绪检查 | 001–003 升级至 004 后既有寻回行不变；重复迁移正常跳过；缺少 004 时拒绝启动；迁移记录缺失或实际列仍非空时 `/ready` 返回 503，恢复后返回 200 |
| 数据库约束脚本 | 通过，包括来源微秒时间顺序、未知寻回日期、人物删除后关联置空及子记录级联删除；测试行回滚 |
| 前端独立副本 | `npm ci`、lint、typecheck、生产 build 和生产启动通过；修复表单重置后重新构建并完成回归 |
| HTTP smoke | `smoke.py`、`people_smoke.py`、`recovery_smoke.py`、`admin_smoke.py` 通过；覆盖公开 API／HTML、认证撤销、字段与 DELETE 请求校验、日期精度、回滚、共享版本、公开同步及限流 |
| Playwright / Edge 全流程 | 登录、人物、MIDI、署名、历史来源与寻回 CRUD、删除确认、401／409 输入保留、公开详情及退出保护通过 |
| 补充浏览器边界场景 | 非零微秒在只改文字和改变日期／秒数时保留；首屏外人物及分页／刷新正常；真实数据库会话到期后在新标签页登录并重试，日期、人物和创建时间不丢失 |
| 桌面 1440px / 手机 390px | 已查看来源与寻回表单截图，排版及长文本换行正常；移动端无横向溢出断言通过 |
| 静态与部署配置 | Python 语法、相对文档链接、Compose 配置及 `git diff --check` 通过；只读生产检查在临时空表上通过，对两类 `recovery-check-*` 标记均按预期拒绝 |

CI 已加入来源／寻回 HTTP 检查，并将会触发登录限流的管理员检查保留在最后。本轮未执行 Linux Docker 镜像构建或 Compose 容器启动（本机 Linux Engine 不可用），未执行远程 GitHub Actions、Vercel 发布、生产迁移或备份恢复演练；未人为注入网络超时验证浏览器提示。超时不能据此断定数据库回滚，界面提示先核对已保存记录再重试创建。未提交、推送或发布任何改动。

管理规则见 [后台说明](admin.md)，升级步骤见 [RUN.md](../RUN.md)。下一阶段是带格式校验、重复归属和失败对象清理的 MIDI 文件导入，见 [Roadmap](roadmap.md)，本轮未开始实施。

## 2026-09-22：同仓库的前端独立项目与 Vercel 部署准备

按用户选择保留一个 Git 仓库，将 `frontend/` 整理为可独立安装、构建和部署的项目。Dockerfile 从 `docker/` 移入前端目录，Compose 改用 `./frontend` 上下文；补齐前端自己的环境示例、忽略规则、Node 22.x 约束、许可证及 Vercel 配置。默认使用原生 Next.js 输出，仅 Docker 构建显式启用 standalone。CI 增加不依赖后端的隔离前端作业，原有 Compose 整栈检查保留。

部署说明区分“导入当前仓库、Root Directory=frontend”和“克隆副本的一键按钮”，不把前端部署描述为整个后端、数据库和对象存储的迁移。未修改业务页面、管理员 Origin 规则、数据库或对象存储；原有 favicon、生成脚本、IDE 配置和 next-env.d.ts 未提交改动保持原样。

| 实际执行 | 结果 |
| --- | --- |
| 独立副本安装 | 仅复制前端，排除真实环境文件、node_modules 和 .next；Node 22.14.0 / npm 10.9.2 下 `npm ci` 通过 |
| 原生 Next.js 检查 | 隔离副本 `npm run check`（lint、typecheck、生产 build）通过，不要求后端在线 |
| 原生生产启动 | 首页、关于、登录、favicon、后端不可用提示均通过 HTTP 检查；未登录 `/admin` 返回 307 跳转登录 |
| standalone 构建与运行 | `NEXT_OUTPUT_STANDALONE=true` 构建通过；只复制 standalone、static、public 到另一个运行目录后，六项 HTTP 检查通过 |
| Compose 配置 | `docker compose --env-file .env.example config --quiet` 通过 |
| 项目边界 | package/lock 一致，前端许可证与根许可证一致；实际检查真实环境和 Vercel 元数据被忽略，示例与部署配置可跟踪 |
| 代码／配置复核 | 未发现阻塞性问题；同步修正原生生产环境模板用法和 Node 22.x 文档约束 |

Docker CLI 已安装，但 Linux Engine 未运行，因此没有执行 Linux 镜像构建或启动 Compose；本机 standalone 验证不能代替 Linux 镜像验收。未连接真实后端进行本轮登录／写入回归，未运行远程 GitHub Actions、Vercel 发布或云端域名验收。由于未安装 gh，未核实 GitHub 仓库可见性；按钮参数按 Vercel 官方文档核对，并未实际走克隆流程。未提交、推送或发布任何改动。

## 2026-09-18：人物、历史昵称与作品署名管理

已完成下一阶段后台功能：人物分页列表、创建与编辑、简介和历史昵称维护，以及 MIDI 署名添加、角色调整和移除。人物和昵称在同一事务保存；作品署名与作品 revision 在同一事务保存。错误和旧版本不会覆盖已有资料。管理员权限及来源检查沿用现有边界，保存立即反映到公开人物及作品详情。

迁移 003 为人物增加 revision 和触发器，启动与就绪检查要求该结构。已有部署必须先迁移再启动新版本。本轮使用独立 Compose 项目 `lostmidi-people-test`、独立数据库卷和临时凭据；未升级用户原有数据库。测试资料保留在专用测试卷，不应导入生产。

| 实际执行 | 结果 |
| --- | --- |
| Windows CMake Release / CTest，连接专用 PostgreSQL | 19/19 通过，无跳过 |
| Linux Docker 后端编译及 CTest | 16 项通过；3 项需数据库的集成测试在镜像构建阶段跳过，已由上述原生 CTest 补足 |
| Next.js lint、typecheck、Docker 生产构建 | 通过 |
| Compose 全栈启动、迁移 001–003、数据库及应用健康检查 | 通过；再次执行迁移正常跳过已应用文件 |
| 数据库约束脚本 | 通过，包括人物 revision 初始值、自动递增及非正值拒绝；测试行回滚 |
| people_smoke | 通过：权限、昵称校验、人物编辑、并发 409、署名角色、无效人物回滚、双向公开关系及会话撤销 |
| 原有 smoke 与 admin_smoke | 通过：公开 API / HTML、登录退出、限流、受保护写入、slug 与并发 revision 冲突、no-store |
| Playwright / Edge 无头浏览器 | 通过：登录 Cookie、人物与昵称、MIDI 创建编辑、旧表单保留输入、署名添加和清空、公开详情及退出后禁止访问 |
| 桌面 1440px / 手机 390px 截图检查 | 通过；修复长标题导致的移动端横向溢出 |

这次已补齐上一阶段未完成的 HTTP 和后台浏览器验收。浏览器脚本为可选开发依赖，使用独立上下文，不读取个人浏览器资料。未执行线上发布、GitHub Actions 远程运行或备份恢复演练。下一步为历史来源与寻回记录管理，见 [Roadmap](roadmap.md)。逐文件需求对应见 [变更清单](releases/2026-09-18-people.md)。

## 2026-09-15：生产文案与部署整理

公开页已移除开发示例声明，后台移除建设说明与未开放的功能卡片，公开权利状态使用中文标签。默认不加载示例数据，新增独立生产配置模板与只读数据检查。Vercel 整站一键部署按需求评估后放弃，详见 [评估记录](vercel-assessment.md)。

本次前端 lint、typecheck、生产构建通过；开发模板及填入临时检查值的生产模板均通过 Compose 配置校验。只读生产数据检查在含示例的专用测试库按预期失败，在临时隔离的无示例数据表上通过；未更改现有档案。`git diff --check` 通过。未执行线上部署或数据库清理，HTTP/浏览器联调限制仍见下文。

逐文件需求对应关系见 [本次提交清单](releases/2026-09-15-production.md)，覆盖此前未提交的后台收尾修改及本次生产调整。

## 2026-09-15：管理员认证与档案写入

用户已确认此前整站部署验收完成；此确认属于基础站点阶段，不自动覆盖本轮新增的管理员功能。

本轮已实现单管理员登录、退出、8 小时会话、C++ 请求授权、密码哈希与令牌摘要存储、登录限流，以及 Next.js HttpOnly Cookie 和表单来源检查。后台支持 MIDI 基本信息新增与编辑、字段校验、slug 唯一性和 revision 并发保护；保存立即公开。迁移 002 新增会话表和 revision 触发器，启动及就绪检查要求新结构存在。登录失败保留用户名，保存失败保留输入，注销失败保留会话并显示错误。

本轮实际运行结果：

| 检查 | 结果 |
| --- | --- |
| CMake Release build | 通过 |
| CTest，提供专用 PostgreSQL 测试库 | **17/17 通过，无跳过** |
| 前端 lint、typecheck、生产 build | 全部通过，包含登录、后台、新增及编辑路由 |
| database/tests/constraints.sql | 通过，包含会话摘要格式和 revision 递增；测试行回滚 |
| Python smoke/密码生成脚本语法编译 | 通过 |
| Compose config --quiet | 通过，不等同于容器启动验证 |

真实数据库测试覆盖正确和错误登录、摘要存储、会话到期、凭据标识变化、注销、限流、管理员未配置，以及档案创建、编辑、重复 slug、旧 revision、不存在档案和失败后原数据保留。会话用事务临时表隔离，档案测试只清理自身生成的记录。既有公开 Repository、Service 和 Storage 测试也通过。

上轮 HTTP smoke 在编辑重复 slug 时返回 503。本轮数据库测试复现：当前 Drogon PostgreSQL 驱动返回通用 Failure，不提供 SQLSTATE，单纯捕获 UniqueViolation 或 SqlError 无法处理。现通过失败后查询确认冲突档案来返回 409，不解析本地化错误文本；其他失败仍交由通用异常处理。此修复已通过真实数据库集成测试。

**待完成的验证：**启动临时 HTTP 后端被自动审批拒绝，原因仅为 `blocked by policy`，未提供更多说明；此前启动前端也被拒绝。未绕过策略，本轮未重新跑通 HTTP smoke、未完成后台浏览器验收。更新后的 admin_smoke 包含并发保存与 no-store 检查，但尚未对运行中的服务执行；CTest 的旧 revision 检查为顺序提交，不能替代并发 HTTP 检查。GitHub Actions 已增加临时凭据生成及管理员 smoke，但未推送或执行。本轮未运行 Docker 整栈及备份恢复演练。

部署和剩余验收按 [RUN.md](../RUN.md) 执行。写入 smoke 必须使用专用测试库。后台运行验收后，可继续人物署名、历史来源及寻回记录管理；文件导入另需 MIDI 格式校验、重复归属和失败清理。多用户、角色、审核、删除、上传与下载不属于本轮已实现范围。

## 历史记录：2026-09-13 基础工程

以下保留当时的实现与验证记录；其中“当前”“未完成”及下一步建议仅指该历史阶段，本轮状态以上述记录为准。

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
