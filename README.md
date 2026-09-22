# Lost MIDI Archive

一个关于早期网络 MIDI 的数字档案与网络考古项目。记录作品、人物、历史来源和寻回过程，让文件与它的来历一起保存。当前代码包含公开查询 REST API、服务端渲染页面、一次性安装与站点配置、单管理员后台、档案管理，以及默认关闭的管理员单文件 MIDI 导入（local / S3，上传即同意公开分发）。导入已实现并对真实 S3 桶完成联调验证。

这是学习项目：优先选择清楚、正确、能测试的实现。仓库保留原有 [GPLv3 LICENSE](LICENSE)。示例完全虚构，不包含真实音乐或可下载的 MIDI。

部署与运维请从 [RUN.md](RUN.md) 开始：包含环境配置、启动验收、服务器访问、更新、备份恢复与故障排查。

前后端保留在同一 Git 仓库，分别部署：前端 Vercel 项目的 Root Directory 为 `frontend`；生产后端已使用独立 Vercel 容器项目 + Neon Free，根 `vercel.json` 是后端配置。旧 VPS / Compose 部署仍可用。生产数据库上次迁移至 005，新增 006 尚未执行、当前代码尚未发布；更新应用前必须先安全迁移。详见 [Vercel 部署指引与前端一键部署入口](docs/vercel-assessment.md)。

## Architecture

```mermaid
flowchart TD
  Browser --> Next[Next.js App Router / Server Components]
  Next -->|REST JSON| Controller[Drogon Controller]
  Controller --> Service[C++ Services: midi / person / recovery]
  Service --> Repository[PostgreSQL Repositories]
  Repository --> DB[(PostgreSQL)]
  Next -->|Private admin import / Bearer| Import[MidiImportService]
  Import --> Repository
  Import --> Storage[IObjectStorage]
  Storage --> Local[LocalObjectStorage / durable storage directory]
  Storage --> S3[Private S3-compatible storage]
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
backend/src/storage/      对象存储接口、local / S3 实现、SHA-256
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

在仓库根目录操作；仅当 `.env` 不存在时复制：

```sh
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(32))"
# 将生成值填入 .env 的 INSTALLATION_TOKEN；新站保持 ADMIN_PASSWORD_HASH 为空
# 核对数据库连接、ADMIN_ORIGIN 与 ADMIN_COOKIE_SECURE 后再启动
docker compose config --quiet
docker compose up --build
```

PowerShell 第一步使用 `Copy-Item .env.example .env`。示例数据库密码是公开的本地开发值；真实 `.env` 已被忽略。服务仅发布到宿主 `127.0.0.1`。默认 `SEED_DEMO=false`，新库为空；仅在独立开发或测试库显式设置 true 以加载虚构示例。生产部署从 `.env.production.example` 配置，步骤见 [RUN.md](RUN.md)。

新站由部署者先准备数据库连接并应用全部迁移（Compose 的 migrate 服务负责执行），再访问 `/install`，填写站点名称、简介、管理员用户名、密码及确认密码，并输入安装令牌。`INSTALLATION_TOKEN` 仅配置到后端，空值禁用安装；非空必须匹配 `[A-Za-z0-9_-]{32,128}`，不得放入 `NEXT_PUBLIC_`、URL 或前端环境变量。安装成功不自动登录；请另行访问 `/admin/login`。之后可移除令牌并重建后端容器，数据库中的持久安装锁不会消失。安装页不创建数据库、不自动迁移或 seed，也没有重装、设置编辑或密码重置页。

`ADMIN_ORIGIN` 必须与浏览器访问地址完全一致且没有末尾斜杠，默认 `http://localhost:3000`；使用 `127.0.0.1`、其他端口或域名访问时同步修改。正式部署使用 HTTPS 并设 `ADMIN_COOKIE_SECURE=true`。前端配置表单仅生成 `BACKEND_API_URL` / `ADMIN_ORIGIN` / `ADMIN_COOKIE_SECURE` 变量文本，不写环境文件、不调用 Vercel API；Vercel 用户需自行保存项目变量后重新部署。

已有环境管理员部署继续支持完整有效的 `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`，并优先于数据库账号。升级第一次运行新版时必须保留这两项，待后端成功写入持久 environment 标记后才能改配置；提前移除会使系统无法推断曾安装。默认 `ADMIN_USERNAME=admin` 加空哈希不会遮盖新安装的数据库管理员。凭据恢复与会话注意事项见 [RUN.md](RUN.md)。

- 页面：<http://localhost:3000>；未安装时跳转 `/install`
- 一次性安装：<http://localhost:3000/install>；已安装时仅显示锁定状态
- 存活检查：<http://localhost:8080/health>
- 数据库就绪：<http://localhost:8080/ready>
- 档案列表：<http://localhost:3000/midis>；只有显式加载示例后才存在 `/midis/example-midi`
- 管理员登录：<http://localhost:3000/admin/login>

启动顺序：PostgreSQL 健康检查 → 一次性 migrate 服务 → Backend 就绪检查 → Frontend。前端构建无需后端在线，但运行时必须能访问安装状态 API。公开站点与 `/admin` 父 layout 在请求时判断：缺后端配置或明确 `installed=false` 才跳 `/install`；旧后端 404、非法响应或离线只显示不可用，不开放安装。Compose 运行构建后的程序，改源码后重新 `docker compose up --build`；前端热更新使用原生 `npm run dev`。

```sh
docker compose logs -f backend
docker compose run --rm migrate
docker compose down
```

普通 down 保留 PostgreSQL named volume 和宿主 storage/；不要为了升级 schema 删除 volume。修改数据库初始账号变量不会自动改变已有数据库，需要同步修改数据库账号和 DATABASE_URL。

后端容器以 UID 10001 运行。Linux 下测试文件写入时应让 storage/ 对该 UID 可写，由后端独占管理；启用私有导入后会写入所选 local / S3 存储，不提供公开对象访问。数据库和对象目录分别备份、恢复。

### Native workflow: Linux / macOS

先准备 PostgreSQL 数据库和用户；也可只运行 Compose 的数据库：

```sh
docker compose up -d postgres
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=lostmidi PGDATABASE=lostmidi
export PGPASSWORD=lostmidi_dev_only
SEED_DEMO=false sh database/migrate.sh
```

仅专用演示/测试库可将 `SEED_DEMO` 显式改为 true。不用 Docker 时，通过本机 PostgreSQL 工具创建数据库和用户。迁移脚本不会创建数据库；应用全部迁移至 006 后再启动后端。从根目录构建后端：

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
# 仅全新站点；升级旧环境管理员部署时保留原来的完整凭据
export ADMIN_USERNAME=admin ADMIN_PASSWORD_HASH=
export INSTALLATION_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
./backend/build/Release/lostmidi_api
```

启动后端前，在可信终端安全保存 `INSTALLATION_TOKEN` 的值，稍后在 `/install` 输入，不要粘贴到公开日志。

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
# 仅全新站点；旧站升级保留原来的完整环境凭据
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD_HASH=''
$env:INSTALLATION_TOKEN=(python -c "import secrets; print(secrets.token_urlsafe(32))")
.\backend\build\Release\lostmidi_api.exe
```

迁移使用 Git Bash 执行上述 sh 命令，确保 PostgreSQL bin 在 PATH。后端不自动读取 .env：Compose 注入环境，原生运行显式设置。Next.js 原生开发读取 frontend/.env.local。

原生新站在可信终端安全保存生成的安装令牌，在 `frontend/.env.local` 配置 `BACKEND_API_URL`、`ADMIN_ORIGIN` 与 `ADMIN_COOKIE_SECURE`，启动后访问 `/install`；成功后单独登录，可移除后端令牌并重启。更新已有数据库时先执行全部待应用迁移（包含 002–005 和 `006_midi_import_journal.sql`），第一次启动新版仍保留完整环境管理员凭据，确认 legacy 标记写入后再改配置。不要用清空旧站凭据的方式进入安装页。

## Environment Variables

| 变量 | 用途 / 示例 |
| --- | --- |
| POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB | Compose 数据库初始账号、密码和库名 |
| POSTGRES_PORT | 宿主数据库端口，5432；容器内固定 5432 |
| DATABASE_URL | 后端必填 PostgreSQL URI；Compose 主机 postgres，原生改 127.0.0.1 |
| BACKEND_API_URL | Next.js 服务端后端地址；Compose http://backend:8080，原生 http://127.0.0.1:8080 |
| BACKEND_HOST | 后端必填监听地址；原生建议 127.0.0.1，容器监听 0.0.0.0 |
| BACKEND_PORT | 未提供 PORT 时的后端端口，Compose 示例 8080 |
| FRONTEND_PORT | Compose 前端端口，3000 |
| PORT / HOSTNAME | Compose 为 standalone Next.js 注入端口/监听地址；后端也读取平台 PORT，优先于 BACKEND_PORT，勿覆盖云平台值 |
| STORAGE_BACKEND | 仅后端，local / s3，默认 local |
| MIDI_IMPORT_ENABLED | 仅后端，true / false，默认 false；验证私有持久存储后才启用 |
| STORAGE_PATH | local 必填；原生建议绝对路径，Compose /app/storage 挂载 ./storage；云容器 /tmp 不持久 |
| S3_ENDPOINT / S3_REGION | HTTPS endpoint 无路径；region 默认 us-east-1，按真实服务确认 |
| S3_BUCKET | 现有真实桶名，尚未知；示例留空，不可用占位名启用 |
| S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY | 仅后端密钥，示例留空，禁止复用已暴露旧密钥 |
| S3_PREFIX | 默认 lostmidi；非空安全目录段，仅字母、数字、下划线、连字符，段间用 /；无空段或路径穿越 |
| S3_PATH_STYLE | true / false，默认 true |
| S3_PUBLIC_DISTRIBUTION_CONFIRMED | 默认 false；确认上传对象将公开分发（允许匿名读取）后设 true。只是 ACK，不是权限校验 |
| DB_POOL_SIZE | 数据库连接数；容器与模板默认 2，原生 Config 未设置时为 4，允许 1–64 |
| HTTP_THREADS | HTTP 事件循环线程，默认 2，允许 1–64 |
| WORKER_THREADS | 同步工作线程；容器与模板默认 2，原生 Config 未设置时为 4，允许 1–64 |
| SEED_DEMO | migration 与环境模板默认 false；仅专用演示/测试库显式 true |
| PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD | migration 和 psql 标准变量；runner 的 DATABASE_URL 优先 |
| NEXT_TELEMETRY_DISABLED | Compose 中设为 1 |
| INSTALLATION_TOKEN | 仅后端；空值禁用安装，非空须匹配 `[A-Za-z0-9_-]{32,128}`；生成方式见上文，禁止放入 URL、NEXT_PUBLIC_ 或前端变量 |
| ADMIN_USERNAME | 后端环境覆盖用户名；Compose 默认 admin，沿用最长 100 UTF-8 字节的旧规则；安装表单另用 ASCII 3–64 字符规则 |
| ADMIN_PASSWORD_HASH | 后端环境覆盖哈希，由 scripts/admin_password.py 生成；完整有效环境凭据优先。空值不遮盖数据库管理员，无任一可用来源才禁用登录；非法非空格式导致启动失败 |
| ADMIN_ORIGIN | 前端安装/后台表单使用的完整浏览器来源，例如 http://localhost:3000 或 https://archive.example.org；无路径与末尾斜杠 |
| ADMIN_COOKIE_SECURE | 前端仅在值为 false 时允许 HTTP Cookie；正式 HTTPS 部署设 true |
| LOSTMIDI_TEST_DATABASE_URL | 可选 C++ 集成测试连接串，仍指向已迁移且含 demo seed 的专用测试库；installation 用例创建隔离 schema，需 CREATE SCHEMA 权限；未设置时跳过数据库集成测试 |
| INSTALLATION_TEST_TOKEN | 仅安装 smoke 进程使用，应与专用测试后端的 INSTALLATION_TOKEN 一致，不是前端部署变量 |
| ADMIN_TEST_USERNAME / ADMIN_TEST_PASSWORD | 测试脚本凭据；安装浏览器 smoke 用于创建并登录新管理员，不用于生产环境 |

修改后端端口时同步修改 BACKEND_API_URL。修改数据库密码时同步修改 DATABASE_URL，URI 密码中的保留字符需要 URL 编码。不要使用 NEXT_PUBLIC 暴露后端配置，也不要提交真实密码。

## Database

详见 [数据库设计说明](docs/database.md)。七张领域表：midi_entries、people、person_aliases、midi_credits、midi_files、historical_sources、recovery_events；另有 admin_sessions、site_installation 与 midi_import_objects（导入 journal）。

迁移 `004_optional_recovery_date.sql` 允许寻回日期为 NULL，保留原有日期。来源、寻回、基础资料、署名及新文件导入共用作品 revision。005 保存安装配置与持久锁；新增 `006_midi_import_journal.sql` 添加导入 journal 和分发确认字段（列名保留 `private_archive_confirmed`，现记录公开分发确认），不改旧迁移。启动及 `/ready` 检查 006 记录与实际结构，同时保留 005 安装表和 004 日期可空检查；即使关闭导入也须先迁移。生产已迁移至 006；升级其他库时先备份并用现有幂等 `database/migrate.sh`、`SEED_DEMO=false` 更新至 006，再发布新版，不使用要求空库的 `.tools` 临时脚本。

`site_installation` 至多一行 `id=1`，保存 `site_name`、`site_description` 和 `auth_source`（database 或 environment）。database 时保存用户名及随机盐 PBKDF2-HMAC-SHA256、600,000 次哈希；environment 时 username/password_hash 均为 NULL。事务和主键保证安装并发只有一个成功，提交确认后返回；移除令牌或重启不清除锁，无重装/reset 接口。

迁移 `002_admin_sessions_and_revision.sql` 另增 `admin_sessions` 会话表，以及 `midi_entries.revision` 和自动递增触发器。管理员来自数据库安装或完整环境覆盖，不属于人物表；会话表仅存令牌 SHA-256 摘要及凭据标识，不存原始令牌。选用的用户名与哈希决定会话 identity，切换期间不匹配的会话拒绝，但恢复旧凭据可能重新匹配未过期旧会话。数据库备份现可能含管理员密码哈希，恢复时需明确撤销历史 sessions 或使用新凭据，防止重新启用旧会话。修改档案时必须提交读取时的 revision，以检测并发修改。

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

管理员 HTTP 导入使用 `MidiImportService`：校验单文件 SMF 0/1/2、大小与公开分发权利确认，按 SHA-256 去重；同档案同内容幂等，跨档案返回 `409 FILE_OWNERSHIP_CONFLICT`。新文件登记与父 revision 递增原子提交。旧内部 `MidiFileService` 保留，但不用于 HTTP 导入。

对象与数据库不能共用事务。新导入在写存储前先持久化 journal，以同 digest 的数据库 advisory lock 串行化导入与清理。显式 `lostmidi_api --cleanup-imports` 只处理超过 24 小时且无引用的 journal，每次最多 100 条，不列桶、不扫目录；必须使用相同数据库与存储 backend/bucket/prefix（local 使用相同路径），禁止拿生产清理做测试。操作边界见 [RUN.md](RUN.md)。

本地存储接受 SHA-256 key，拒绝路径穿越和对象符号链接；目录由后端独占管理。S3 使用已有桶及专用前缀，密钥仅在后端配置。`S3_PUBLIC_DISTRIBUTION_CONFIRMED` 是人工 ACK，不证明权限正确；产品决策为上传即同意公开分发，对象允许匿名读取。已对真实雨云 ROS（Ceph RGW）桶联调验证：签名读写、PUT 必须携带并签名 `Content-Type`（否则 RGW 返回 `403 AccessDenied`）、`If-None-Match: *` 条件写入返回 `412`、Range GET 与 DELETE 均正常。云 `/tmp` 不能代替持久存储。

## API

| 请求 | 行为 |
| --- | --- |
| GET /health | 进程存活，`{"status":"ok"}`；不代表数据库正常 |
| GET /ready | 查询已迁移数据库，含 006 导入结构、005 安装表与 004 日期可空检查；失败 503，不验证桶权限 |
| GET /api/v1/installation | 公开、no-store；返回 installed、installation_enabled、site: {name, description}，无秘密 |
| POST /api/v1/installation | X-Installation-Token 授权；仅 site_name、site_description、username、password，成功 201、同 GET 响应；并发仅一成功 |
| GET /api/v1/midis?page=1&pageSize=20 | 有序分页，每项包含 credits |
| GET /api/v1/midis/:slug | entry、credits、people、historical_sources、recovery_events、files |
| GET /api/v1/people/:id | person、aliases、midis |
| POST /api/v1/admin/login | 验证用户名和密码，返回有效期 8 小时的令牌 |
| GET /api/v1/admin/session | 验证 Bearer 会话，返回管理员用户名 |
| POST /api/v1/admin/logout | 撤销当前 Bearer 会话 |
| POST /api/v1/admin/midis | 验证管理员后新增基本信息，成功 201 |
| GET /api/v1/admin/midis/:id | 验证管理员后读取编辑数据和 revision |
| PUT /api/v1/admin/midis/:id | 验证管理员后更新基本信息；slug 冲突或旧 revision 返回 409 |
| GET /api/v1/admin/midis/{id}/files | Bearer 管理员读取私有文件管理数据 |
| POST /api/v1/admin/midis/{id}/files | Bearer 管理员私有单文件导入，默认关闭；新文件原子递增父 revision |

导入 POST 使用 `application/octet-stream` 原始字节，带 `X-File-Name=encodeURIComponent(文件名)`、`X-Entry-Revision`、`X-Rights-Confirmed=true`。只接受单个 `.mid` / `.midi`、SMF 0/1/2、最大 1 MiB；前端 Server Action 上限 `2mb` 不放宽文件限制。同档案同内容幂等、跨档案 `409 FILE_OWNERSHIP_CONFLICT`；不改变版权、分发许可或归档状态，不提供公开下载、试听或对象 URL。

page 为 1–1000000，pageSize 为 1–100，默认 1 / 20。无效参数返回 400；超出末页返回空 data 和原 total。slug 最多 160 个小写字母、数字和词间连字符；人物 ID 为正数 BIGINT 范围。

```json
{"data": [], "pagination": {"page": 1, "pageSize": 20, "total": 0}}
```

缺失资源返回 404，错误 JSON 结构统一：

```json
{"error": {"code": "MIDI_NOT_FOUND", "message": "The requested MIDI entry does not exist."}}
```

异常响应不含 SQL、文件路径或调用栈。应用单行 JSON 日志不记录连接串或异常原文。公开查询无需登录；后台接口在 C++ 验证会话，基本资料写入立即反映到公开站点，但文件导入完全私有。已有管理员导入接口，无公开上传、下载或试听接口；导入及清理契约见 [RUN.md](RUN.md)，其他后台合约见 [后台平台说明](docs/admin.md)。

## Testing

```sh
cd frontend
npm ci
npm run build
npm run lint
npm run typecheck
```

后端按上文 Conan / CMake 流程构建并运行 CTest。GoogleTest 覆盖特定 404、分页与输入、署名组合、已知 SHA-256 向量、重命名去重、缺失对象修复、路径拒绝和损坏检测。设置 LOSTMIDI_TEST_DATABASE_URL 后额外执行真实数据库集成测试，覆盖公开查询、管理员会话生命周期、档案及来源寻回写入冲突、跨作品归属和失败回滚；未设置时明确标为 skipped。必须使用已迁移并包含示例的专用测试库：会话测试使用事务临时表隔离，档案测试创建并清理自身记录，identity 序列可能递增。installation 与 import 集成测试创建隔离 schema，测试用户需要 CREATE SCHEMA 权限；仍不可使用生产库。导入测试还覆盖 SMF 0/1/2、1 MiB 边界、独立 SigV4 签名向量、连续并发重试、真实 SQL/提交失败、journal 保留与只清理过期无引用对象。

安装测试另备**两个各自全新、已迁移的专用测试库及对应后端**，保持环境密码哈希为空并配置安装令牌。`python scripts/installation_smoke.py --api <专用测试后端> --allow-install` 要求 `INSTALLATION_TEST_TOKEN` 与后端令牌一致；`python scripts/installation_browser_smoke.py --frontend <另一个专用测试前端> --allow-install` 还要求 `ADMIN_TEST_USERNAME` / `ADMIN_TEST_PASSWORD`，可加 `--channel msedge`、`--screenshots <目录>`（需 Playwright 和相应浏览器）。两个脚本均永久安装，不能顺序指向同库，也不能在已安装或生产站点运行。本地验收结果与尚未执行的部署检查见 [Implementation Report](docs/implementation-report.md)。

在专用测试库运行数据库检查，所有测试行回滚；identity 序列可能递增：

```sh
psql -X -v ON_ERROR_STOP=1 -f database/tests/constraints.sql
```

普通整栈 smoke 使用显式 `SEED_DEMO=true` 的专用测试库，执行全部迁移并完成安装或持久化 legacy 标记后运行（不用于生产库，也不是上面两个全新安装测试库）：

```sh
python scripts/smoke.py
python scripts/smoke.py --api http://127.0.0.1:8080 --frontend http://127.0.0.1:3000
# 仅验证运行中的后端：
python scripts/smoke.py --api-only
```

脚本检查分页、400/404、人物关系和 HTML 是否包含后端数据。GitHub Actions 配置 Linux Docker 构建、CTest、约束和 smoke 检查；提供配置不等于已在 GitHub 成功执行。实际结果见 [Implementation Report](docs/implementation-report.md)。

来源寻回检查使用 `python scripts/recovery_smoke.py --api http://127.0.0.1:8080 --allow-writes`，只能指向专用测试库；它会留下带 recovery-check 前缀的记录。与人物及浏览器验收一起先执行，再执行会耗尽登录限流额度的 admin_smoke。

私有导入检查使用 `python scripts/midi_import_smoke.py --api <专用测试后端> --allow-writes`；可选浏览器检查为 `python scripts/midi_import_browser_smoke.py --frontend <专用测试前端> --allow-writes`，使用已安装的 Playwright / Edge，可指定 `--channel` 与 `--screenshots`。两者从 `ADMIN_TEST_USERNAME` / `ADMIN_TEST_PASSWORD` 读取测试凭据，会保留测试档案和文件，必须使用独立数据库与独立 local 目录或 S3 前缀。禁用模式可在后端关闭导入后给 API 脚本加 `--expect-disabled`。

2026-09-22 本地已通过 50 项后端测试（含隔离 PostgreSQL 集成测试）、迁移与重复迁移、导入/禁用 HTTP 检查、前端 lint/类型检查/生产构建，以及桌面和手机宽度的浏览器导入验收。已对真实雨云 ROS（Ceph RGW）桶联调验证签名读写、条件 PUT（`412`）、Range GET 与 DELETE，并定位/修复了 PUT 必须签名 `Content-Type` 的兼容性问题；此前使用本地对象目录的测试不覆盖真实桶。

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

- **User System**：面向用户的注册、多账号与角色权限；当前仅有数据库安装或环境覆盖的单管理员登录，人物档案与登录账号分离。
- **Contribution System**：面向贡献者的 MIDI / 历史资料提交；当前仅实现管理员私有单文件导入，不是公开投稿。
- **Moderation**：审核贡献、署名和权利信息。
- **Community**：帖子、评论、讨论，有需求后加入内部模块。
- **Wanted MIDI**：可考虑 OPEN、POSSIBLE_LEAD、CANDIDATE_FOUND、VERIFIED、RECOVERED。
- **Wayback Machine Integration**：已有 IHistoricalArchive 边界，未来实现 captures 查询。
- **Search**：首先考虑 PostgreSQL Full Text Search。
- **Notification**：有真实通知事件和偏好需求后加入。

## Admin Platform

统一后台入口为 `/admin`，未安装时转到 `/install`，已安装且未登录时转到 `/admin/login`。包含工作台、档案列表、新增与编辑表单和模块目录。单管理员通过一次性数据库安装建立，完整有效的环境凭据可优先覆盖；浏览器使用 HttpOnly Cookie，Next.js 服务端向 C++ 传递 Bearer 会话，后端逐次验证权限。当前可维护标题、slug、简介、推测年份、归档与版权状态、许可、权利人和分发许可，以及人物资料、历史昵称和作品署名。作品编辑页的「管理来源与寻回」支持逐条新增、编辑、删除历史网站和寻回经过，保存后立即公开。未知日期和人物可留空，来源与寻回共用作品 revision，不会自动调整归档状态。管理员单文件 MIDI 导入已实现，默认关闭，已对真实 S3 桶联调验证；上传即同意公开分发，本后台页仅展示元数据、不开放下载试听或对象 URL。导入契约见 [RUN.md](RUN.md)，其他后台边界见 [后台平台说明](docs/admin.md)，验证计划见 [开发路线](docs/roadmap.md)。

## Architecture Decisions

见 [模块化单体](docs/adr/0001-use-modular-monolith.md)、[Drogon](docs/adr/0002-use-drogon.md)、[PostgreSQL](docs/adr/0003-use-postgresql.md)、[前后端分离](docs/adr/0004-separate-nextjs-and-backend.md)、[外部存储](docs/adr/0005-store-midi-outside-database.md)。依赖参考 [Next.js 官方文档](https://nextjs.org/docs/app/getting-started/installation)、[Drogon 数据库文档](https://github.com/drogonframework/drogon/wiki/ENG-08-1-Database-DbClient)、[Conan 2 文档](https://docs.conan.io/2/)。
