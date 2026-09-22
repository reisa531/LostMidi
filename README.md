# Lost MIDI Archive

一个关于早期网络 MIDI 的数字档案与网络考古项目。记录作品、人物、历史来源和寻回过程，让文件与它的来历一起保存。当前版本包含公开查询 REST API、服务端渲染页面、单管理员后台、档案基本信息新增与编辑、数据库迁移和文件存储边界。

这是学习项目：优先选择清楚、正确、能测试的实现。仓库保留原有 [GPLv3 LICENSE](LICENSE)。示例完全虚构，不包含真实音乐或可下载的 MIDI。

部署与运维请从 [RUN.md](RUN.md) 开始：包含环境配置、启动验收、服务器访问、更新、备份恢复与故障排查。

前后端保留在同一 Git 仓库，但 `frontend/` 是完整、可独立复制和部署的 Next.js 项目。前端部署到 Vercel 时，导入当前仓库并将 Root Directory 设为 `frontend`；后端、数据库和文件存储继续单独运行。详见 [前端 Vercel 部署指引与一键部署入口](docs/vercel-assessment.md)。

## Architecture

```mermaid
flowchart TD
  Browser --> Next[Next.js App Router / Server Components]
  Next -->|REST JSON| Controller[Drogon Controller]
  Controller --> Service[C++ Services: midi / person / recovery]
  Service --> Repository[PostgreSQL Repositories]
  Repository --> DB[(PostgreSQL)]
  Import[Future import / upload] -.-> FileService[MidiFileService]
  FileService --> Repository
  FileService --> Storage[IObjectStorage]
  Storage --> Local[LocalObjectStorage / storage directory]
  Storage -. future .-> S3[S3-compatible storage]
```

后端是 **Modular Monolith**：一个程序、一个数据库，内部按领域分模块。Next.js 只负责页面和渲染，业务数据全部来自 C++ API。没有 Next.js 数据库连接，也没有 Redis、消息队列或额外搜索服务。

## Repository Structure

```text
frontend/src/app/          首页、档案列表/详情、人物、关于、错误页面
frontend/src/components/   档案展示组件
frontend/src/lib/api/      服务端 HTTP 客户端和 TypeScript 合约
frontend/src/lib/admin/    服务端登录态、来源检查与表单操作
frontend/Dockerfile       以前端目录为上下文的独立镜像构建
frontend/vercel.json      Vercel 的 Next.js 框架与构建配置
frontend/.env*.example    仅前端的本机和生产环境示例
backend/src/common/       配置、分页、Controller、JSON、日志
backend/src/auth/         密码验证、管理员会话与接口授权
backend/src/midi/         档案与文件登记 Service、Repository、模型
backend/src/person/       人物、昵称、署名的查询与模型
backend/src/recovery/     历史来源、寻回记录；未来外部档案接口
backend/src/storage/      对象存储接口、本地实现、SHA-256
backend/tests/            GoogleTest 业务与存储测试
database/migrations/      版本化 schema SQL
database/seeds/           单独启用的虚构数据
database/tests/           PostgreSQL 约束检查
database/migrate.sh       事务、版本与校验和管理
docker/                   后端多阶段 Dockerfile
docs/adr/                 五项架构决策
docs/database.md          关系、约束、迁移的详细说明
scripts/smoke.py          对运行中的栈执行只读端到端检查
scripts/admin_password.py  交互生成管理员密码哈希
scripts/admin_smoke.py     在专用测试库验证认证与档案写入
scripts/recovery_smoke.py  来源寻回 CRUD、日期精度、并发和回滚检查
storage/                  本地对象目录，内容不进入 Git
.github/workflows/ci.yml   Linux 构建和整栈检查
```

## Requirements

只开发或部署前端时，只需要 Node.js 22.13+（22.x）和 npm：在 `frontend/` 中运行 `npm ci`、`npm run check`。它不依赖 C++ 工具链、数据库或仓库根目录配置；使用真实业务数据时另行提供后端 API。Vercel 使用原生 Next.js 构建，Dockerfile 才显式启用 standalone 输出。

整栈运行最简单的入口是 Docker Engine / Docker Desktop 的 Linux containers 模式，以及 Docker Compose v2 或更新版本。首次构建需联网下载 npm、Conan 和基础镜像，C++ 依赖可能需要较长时间编译。

| 原生工具 | 要求 |
| --- | --- |
| Node.js / npm | Node 22.13+（22.x）；安装用 npm ci |
| C++ 编译器 | C++20；Linux 可用 GCC 13，Windows 建议 Visual Studio Build Tools 2022 + Windows SDK |
| CMake | 3.24+ |
| Conan | 2.x；Docker 固定 2.32.0 |
| Python | 安装 Conan、运行 smoke.py |
| PostgreSQL | 17；原生需要 psql；Compose 使用 17.11-bookworm |
| Shell | POSIX sh + sha256sum 或 shasum；Windows 可用 Git Bash |

直接依赖固定在 package.json / conanfile.py：Next.js 16.3.5、React 19.3.0、Tailwind 4.3.3、TypeScript 6.0.3、Drogon 1.9.13、OpenSSL 3.6.4、GoogleTest 1.17.0。npm 提交 lockfile。Conan 的传递依赖仍可能随上游 recipe 更新，发布前应生成目标平台 lockfile 并验证升级。

## Local Development

### Docker workflow

在仓库根目录运行：

```sh
cp .env.example .env
docker compose config --quiet
docker compose up --build
```

PowerShell 第一步使用 `Copy-Item .env.example .env`。示例密码是公开的本地开发值；真实 `.env` 已被忽略。服务仅发布到宿主 `127.0.0.1`。默认 `SEED_DEMO=false`，新库为空；仅在独立开发或测试库显式设置 true 以加载虚构示例。生产部署从 `.env.production.example` 配置，步骤见 [RUN.md](RUN.md)。

启用后台前运行 `python scripts/admin_password.py`，把输出的 `ADMIN_PASSWORD_HASH=...` 填入 `.env`，并设置 `ADMIN_USERNAME`。空哈希会禁用管理员登录，公开查询仍可使用。`ADMIN_ORIGIN` 必须与浏览器访问地址完全一致且没有末尾斜杠，默认 `http://localhost:3000`；使用 `127.0.0.1`、其他端口或域名访问时同步修改。正式部署使用 HTTPS 并设 `ADMIN_COOKIE_SECURE=true`。详细步骤见 [RUN.md](RUN.md)。

- 页面：<http://localhost:3000>
- 存活检查：<http://localhost:8080/health>
- 数据库就绪：<http://localhost:8080/ready>
- 档案列表：<http://localhost:3000/midis>；只有显式加载示例后才存在 `/midis/example-midi`
- 管理员登录：<http://localhost:3000/admin/login>

启动顺序：PostgreSQL 健康检查 → 一次性 migrate 服务 → Backend 就绪检查 → Frontend。前端构建无需后端在线。Compose 运行构建后的程序，改源码后重新 `docker compose up --build`；前端热更新使用原生 `npm run dev`。

```sh
docker compose logs -f backend
docker compose run --rm migrate
docker compose down
```

普通 down 保留 PostgreSQL named volume 和宿主 storage/；不要为了升级 schema 删除 volume。修改数据库初始账号变量不会自动改变已有数据库，需要同步修改数据库账号和 DATABASE_URL。

后端容器以 UID 10001 运行。Linux 下测试文件写入时应让 storage/ 对该 UID 可写，由后端独占管理；当前后台仅写档案元数据，不写入文件。数据库和对象目录分别备份、恢复。

### Native workflow: Linux / macOS

先准备 PostgreSQL 数据库和用户；也可只运行 Compose 的数据库：

```sh
docker compose up -d postgres
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=lostmidi PGDATABASE=lostmidi
export PGPASSWORD=lostmidi_dev_only
SEED_DEMO=true sh database/migrate.sh
```

不用 Docker 时，通过本机 PostgreSQL 工具创建数据库和用户。迁移脚本不会创建数据库。从根目录构建后端：

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install conan==2.32.0
conan profile detect
conan install backend --build=missing -s compiler.cppstd=20 -s build_type=Release
cmake -S backend -B backend/build/Release \
  -DCMAKE_TOOLCHAIN_FILE=generators/conan_toolchain.cmake -DCMAKE_BUILD_TYPE=Release
cmake --build backend/build/Release --parallel 2
ctest --test-dir backend/build/Release --output-on-failure

export DATABASE_URL=postgresql://lostmidi:lostmidi_dev_only@127.0.0.1:5432/lostmidi
export BACKEND_HOST=127.0.0.1 BACKEND_PORT=8080 STORAGE_PATH="$PWD/storage"
./backend/build/Release/lostmidi_api
```

已有 Conan profile 时先检查编译器，不必重复 detect。Conan 生成的 CMakeUserPresets.json 不提交。单配置生成器默认用 backend/build/Release；Visual Studio 多配置生成器用 backend/build，不能混用同一个构建目录。

另一个终端启动前端：

```sh
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

### Native workflow: Windows

安装 C++ Build Tools 和 Windows SDK，优先使用 x64 Developer PowerShell。原生 C++ 初次配置较复杂，尤其是编译器、SDK、代理证书与依赖二进制不匹配时；Docker 提供更统一的入口。

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install conan==2.32.0
conan profile detect
conan install backend --build=missing -s compiler.cppstd=20 -s build_type=Release
cmake -S backend -B backend/build '-DCMAKE_TOOLCHAIN_FILE=generators/conan_toolchain.cmake'
cmake --build backend/build --config Release --parallel 2
ctest --test-dir backend/build -C Release --output-on-failure

$env:DATABASE_URL='postgresql://lostmidi:lostmidi_dev_only@127.0.0.1:5432/lostmidi'
$env:BACKEND_HOST='127.0.0.1'
$env:BACKEND_PORT='8080'
$env:STORAGE_PATH="$PWD\storage"
.\backend\build\Release\lostmidi_api.exe
```

迁移使用 Git Bash 执行上述 sh 命令，确保 PostgreSQL bin 在 PATH。后端不自动读取 .env：Compose 注入环境，原生运行显式设置。Next.js 原生开发读取 frontend/.env.local。

原生模式启用后台时，在启动后端的环境中另外设置 `ADMIN_USERNAME` 和密码生成器输出的 `ADMIN_PASSWORD_HASH`；在 `frontend/.env.local` 设置 `ADMIN_ORIGIN` 与 `ADMIN_COOKIE_SECURE`。更新已有数据库时必须先执行全部待应用迁移（包含 002、003 和 `004_optional_recovery_date.sql`），再启动新后端。

## Environment Variables

| 变量 | 用途 / 示例 |
| --- | --- |
| POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB | Compose 数据库初始账号、密码和库名 |
| POSTGRES_PORT | 宿主数据库端口，5432；容器内固定 5432 |
| DATABASE_URL | 后端必填 PostgreSQL URI；Compose 主机 postgres，原生改 127.0.0.1 |
| BACKEND_API_URL | Next.js 服务端后端地址；Compose http://backend:8080，原生 http://127.0.0.1:8080 |
| BACKEND_HOST | 后端必填监听地址；原生建议 127.0.0.1，Compose 注入 0.0.0.0 |
| BACKEND_PORT | 后端必填端口，Compose 示例 8080 |
| FRONTEND_PORT | Compose 前端端口，3000 |
| PORT / HOSTNAME | Compose 为 standalone Next.js 注入的端口/监听地址 |
| STORAGE_PATH | 后端必填对象路径；原生建议绝对路径，Compose /app/storage 挂载 ./storage |
| DB_POOL_SIZE | 数据库连接数，默认 4，允许 1–64 |
| HTTP_THREADS | HTTP 事件循环线程，默认 2，允许 1–64 |
| WORKER_THREADS | 同步查询工作线程，默认 4，允许 1–64 |
| SEED_DEMO | migration 默认 false；开发示例 .env 显式 true |
| PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD | migration 和 psql 标准变量；runner 的 DATABASE_URL 优先 |
| NEXT_TELEMETRY_DISABLED | Compose 中设为 1 |
| ADMIN_USERNAME | 后端单管理员用户名；Compose 默认 admin；最长 100 UTF-8 字节 |
| ADMIN_PASSWORD_HASH | 后端密码哈希，由 scripts/admin_password.py 生成；空值禁用登录，非法格式导致启动失败 |
| ADMIN_ORIGIN | 前端必填的完整浏览器来源，例如 http://localhost:3000 或 https://archive.example.org；无路径与末尾斜杠 |
| ADMIN_COOKIE_SECURE | 前端仅在值为 false 时允许 HTTP Cookie；正式 HTTPS 部署设 true |
| LOSTMIDI_TEST_DATABASE_URL | 可选 C++ 集成测试连接串，指向已迁移且含 demo seed 的专用测试库；未设置时跳过该测试 |

修改后端端口时同步修改 BACKEND_API_URL。修改数据库密码时同步修改 DATABASE_URL，URI 密码中的保留字符需要 URL 编码。不要使用 NEXT_PUBLIC 暴露后端配置，也不要提交真实密码。

## Database

详见 [数据库设计说明](docs/database.md)。七张领域表：midi_entries、people、person_aliases、midi_credits、midi_files、historical_sources、recovery_events。

迁移 `004_optional_recovery_date.sql` 允许寻回日期为 NULL，保留原有日期。所有来源与寻回编辑保留记录 ID、寻回创建时间，和基础资料及署名共用作品 revision。当前后端启动及 `/ready` 检查 004 已应用且列实际可空；先迁移再启动新后端。

迁移 `002_admin_sessions_and_revision.sql` 另增 `admin_sessions` 会话表，以及 `midi_entries.revision` 和自动递增触发器。管理员账号来自部署配置，不属于人物表；数据库仅存会话令牌的 SHA-256 摘要及凭据标识，不存原始令牌。修改档案时必须提交读取时的 revision，以检测并发修改。

- MidiEntry 是作品；MidiFile 是二进制版本，SHA-256 全局唯一。相同文件当前归属一个作品，真实需要跨作品复用后再拆关联表。
- 所有实体 ID 在 JSON 中使用字符串，避免 JavaScript 大整数丢失精度。
- 人物可以承担多个署名角色；人物档案不等同于未来用户账户。
- 推测年份、来源日期、版权归属与分发许可分别表达，未知使用 NULL / unknown。
- MIDI 字节不存入 PostgreSQL，公开 JSON 不返回 storage_key。

migrate.sh 在事务内持有 advisory lock，按文件名执行 migration，并记录校验和。重复运行跳过已有版本；修改已应用 SQL 会报错回滚。新增 NNN_description.sql，勿修改旧文件。当前仅支持向前迁移，无自动降级。

seed 独立启用，关闭 SEED_DEMO 不会删除此前的数据。示例 slug 为 example-midi、clockwork-tide、lantern-map，包含人物、来源和寻回叙述；没有假物理文件记录。

## Backend Architecture

推荐阅读顺序：main.cpp → common/ApiController.cpp → midi/MidiService.cpp → midi/PostgresMidiRepository.cpp → SQL migration → tests/services_test.cpp。

Controller 处理 HTTP 参数和响应；Service 校验业务输入、处理不存在的档案并组织关联数据；Repository 执行绑定参数的 SQL、构造普通 C++ 模型。Repository 接口是数据库边界，测试用小型内存档案替代数据库，不为每个内部类创建 mock。

main.cpp 是组合入口，通过普通对象、引用和共享数据库客户端表达所有权。同步 SQL 在独立工作线程执行，不阻塞 HTTP 事件循环。队列接受最多 256 个待处理任务，繁忙返回 503，数据库查询有超时。

列表目前采用 count、列表和逐条署名查询，最多 100 条。并发写入时计数和行不保证同一快照；数据量增长后，根据真实测量批量读取署名并改进事务边界。

MidiFileService 是未来导入基础：计算散列、检查重复、写入内容寻址对象，并用数据库 UNIQUE 处理并发重复。目前不验证 MIDI 格式、没有公开上传接口。文件与数据库不能共用事务；数据库写入失败可能留下对象供重试，将来需要清理流程。重复登记返回原记录，不改写它的归属。

本地存储只接受小写 SHA-256 key，拒绝路径穿越和对象符号链接，临时文件写完后 rename，重复写入核对内容。目录必须由后端独占管理；mutex 只保护同一实例，不提供分布式协调或断电后的事务保证。

## API

| 请求 | 行为 |
| --- | --- |
| GET /health | 进程存活，`{"status":"ok"}`；不代表数据库正常 |
| GET /ready | 查询已迁移数据库，失败 503 |
| GET /api/v1/midis?page=1&pageSize=20 | 有序分页，每项包含 credits |
| GET /api/v1/midis/:slug | entry、credits、people、historical_sources、recovery_events、files |
| GET /api/v1/people/:id | person、aliases、midis |
| POST /api/v1/admin/login | 验证用户名和密码，返回有效期 8 小时的令牌 |
| GET /api/v1/admin/session | 验证 Bearer 会话，返回管理员用户名 |
| POST /api/v1/admin/logout | 撤销当前 Bearer 会话 |
| POST /api/v1/admin/midis | 验证管理员后新增基本信息，成功 201 |
| GET /api/v1/admin/midis/:id | 验证管理员后读取编辑数据和 revision |
| PUT /api/v1/admin/midis/:id | 验证管理员后更新基本信息；slug 冲突或旧 revision 返回 409 |

page 为 1–1000000，pageSize 为 1–100，默认 1 / 20。无效参数返回 400；超出末页返回空 data 和原 total。slug 最多 160 个小写字母、数字和词间连字符；人物 ID 为正数 BIGINT 范围。

```json
{"data": [], "pagination": {"page": 1, "pageSize": 20, "total": 0}}
```

缺失资源返回 404，错误 JSON 结构统一：

```json
{"error": {"code": "MIDI_NOT_FOUND", "message": "The requested MIDI entry does not exist."}}
```

异常响应不含 SQL、文件路径或调用栈。应用单行 JSON 日志记录 startup、数据库连接、HTTP 错误和意外异常，不记录连接串或异常原文。公开查询无需登录；后台接口在 C++ 验证会话，写入立即反映到公开站点。字段合约和错误码见 [后台平台说明](docs/admin.md)。尚无上传、下载接口。

## Testing

```sh
cd frontend
npm ci
npm run build
npm run lint
npm run typecheck
```

后端按上文 Conan / CMake 流程构建并运行 CTest。GoogleTest 覆盖特定 404、分页与输入、署名组合、已知 SHA-256 向量、重命名去重、缺失对象修复、路径拒绝和损坏检测。设置 LOSTMIDI_TEST_DATABASE_URL 后额外执行真实数据库集成测试，覆盖公开查询、管理员会话生命周期、档案及来源寻回写入冲突、跨作品归属和失败回滚；未设置时明确标为 skipped。必须使用已迁移并包含示例的专用测试库：会话测试使用事务临时表隔离，档案测试创建并清理自身记录，identity 序列可能递增。

在专用测试库运行数据库检查，所有测试行回滚；identity 序列可能递增：

```sh
psql -X -v ON_ERROR_STOP=1 -f database/tests/constraints.sql
```

完整测试栈显式设置 `SEED_DEMO=true` 并执行迁移后运行（不用于生产库）：

```sh
python scripts/smoke.py
python scripts/smoke.py --api http://127.0.0.1:8080 --frontend http://127.0.0.1:3000
# 仅验证运行中的后端：
python scripts/smoke.py --api-only
```

脚本检查分页、400/404、人物关系和 HTML 是否包含后端数据。GitHub Actions 配置 Linux Docker 构建、CTest、约束和 smoke 检查；提供配置不等于已在 GitHub 成功执行。实际结果见 [Implementation Report](docs/implementation-report.md)。

来源寻回检查使用 `python scripts/recovery_smoke.py --api http://127.0.0.1:8080 --allow-writes`，只能指向专用测试库；它会留下带 recovery-check 前缀的记录。与人物及浏览器验收一起先执行，再执行会耗尽登录限流额度的 admin_smoke。

认证与写入检查使用 `python scripts/admin_smoke.py --api http://127.0.0.1:8080 --allow-writes`。先将该后端连接到**专用测试数据库**并配置测试管理员，通过环境变量 `ADMIN_TEST_USERNAME`、`ADMIN_TEST_PASSWORD` 提供同一账号的明文测试凭据。脚本会创建并保留测试档案，验证未登录访问、错误登录、登录限流、注销、字段校验、slug 唯一性及 revision 冲突；不要对正式数据运行。后台浏览器操作验收见 [RUN.md](RUN.md)。

## Development Philosophy

上线前执行只读检查 `psql -X -f database/check_production.sql`，排查已知示例及测试记录；切换 `SEED_DEMO=false` 不会删除旧数据。支持前端独立部署到 Vercel；后端、数据库和持久存储不随前端部署，当前操作说明及历史整站评估见 [Vercel 部署指引](docs/vercel-assessment.md)。

- Modular Monolith：保持一个可理解的后端。
- Simple first：朴素模型、明确所有权、直接 SQL。
- No premature microservices：有真实独立部署需求时再拆分。
- Backend owns business logic：规则与数据访问由 C++ 负责。
- Next.js owns presentation/rendering：优先 Server Components；导航高亮、交互表单和错误重试使用 client 组件，数据库与授权规则留在 C++。

新功能先确定规则与数据关系，再依次修改迁移、Repository、Service、Controller、API 类型和页面。给重要规则添加测试，不为猜测中的需求提前造空模块。

## Future Roadmap

以下内容均未实现：

- **User System**：面向用户的注册、多账号与角色权限；当前仅有部署配置的单管理员登录，人物档案与登录账号分离。
- **Contribution System**：提交 MIDI / 历史资料，先设计格式校验与失败清理。
- **Moderation**：审核贡献、署名和权利信息。
- **Community**：帖子、评论、讨论，有需求后加入内部模块。
- **Wanted MIDI**：可考虑 OPEN、POSSIBLE_LEAD、CANDIDATE_FOUND、VERIFIED、RECOVERED。
- **Wayback Machine Integration**：已有 IHistoricalArchive 边界，未来实现 captures 查询。
- **Search**：首先考虑 PostgreSQL Full Text Search。
- **Notification**：有真实通知事件和偏好需求后加入。

## Admin Platform

统一后台入口为 `/admin`，未登录时转到 `/admin/login`。包含工作台、档案列表、新增与编辑表单和模块目录。单管理员通过部署配置建立，浏览器使用 HttpOnly Cookie；Next.js 服务端向 C++ 传递 Bearer 会话，后端逐次验证权限。当前可维护标题、slug、简介、推测年份、归档与版权状态、许可、权利人和分发许可，以及人物资料、历史昵称和作品署名。作品编辑页的「管理来源与寻回」支持逐条新增、编辑、删除历史网站和寻回经过，保存后立即公开。未知日期和人物可留空，来源与寻回共用作品 revision，不会自动调整归档状态。文件管理仍待实现。扩展方法和访问边界见 [后台平台说明](docs/admin.md)，下一阶段见 [开发路线](docs/roadmap.md)。

## Architecture Decisions

见 [模块化单体](docs/adr/0001-use-modular-monolith.md)、[Drogon](docs/adr/0002-use-drogon.md)、[PostgreSQL](docs/adr/0003-use-postgresql.md)、[前后端分离](docs/adr/0004-separate-nextjs-and-backend.md)、[外部存储](docs/adr/0005-store-midi-outside-database.md)。依赖参考 [Next.js 官方文档](https://nextjs.org/docs/app/getting-started/installation)、[Drogon 数据库文档](https://github.com/drogonframework/drogon/wiki/ENG-08-1-Database-DbClient)、[Conan 2 文档](https://docs.conan.io/2/)。
