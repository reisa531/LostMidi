# Lost MIDI Archive 部署与运行手册

适用版本：当前仓库的一次性安装、单管理员档案管理，以及默认关闭的私有单文件 MIDI 导入（local / S3）。导入已在本地实现，真实桶认证、私有策略和联调待验证。

本文指导 Vercel 前后端独立项目、旧 VPS / Compose 单机方案、更新和数据维护。架构与原生编译细节见 [README](README.md)，数据库规则见 [数据库说明](docs/database.md)。命令默认在**仓库根目录**执行；代码块标注了 Shell，服务器维护部分使用 Bash。

## 1. 部署方式与边界

当前生产后端已运行于 **Vercel 容器 + Neon Free**，前端是独立 Vercel 项目。生产数据库上次迁移至 005，新增 `006_midi_import_journal.sql` 尚未执行，当前代码尚未发布；本文不代表本次云构建、真实桶联调或部署成功。更新应用前须按第 7.2 节安全迁移已有库，不能以空库安装流程替代。

前后端是同仓库中的独立项目；旧 VPS / Compose 整栈部署和“Vercel 前端 + VPS 后端”仍可用。完整单机部署使用仓库自带的 Docker Compose，一次部署四个服务：

| 服务 | 职责 | 数据与生命周期 |
| --- | --- | --- |
| `postgres` | PostgreSQL 17.11 | `postgres_data` named volume，持久保存数据库 |
| `migrate` | 应用 SQL migration，可选写入示例数据 | 一次性任务，成功后退出，退出码应为 0 |
| `backend` | C++20 / Drogon REST API | `./storage` 挂载到 `/app/storage` |
| `frontend` | Next.js 生产构建、公开站点和 Admin | 服务端通过内部 HTTP 地址访问 backend |

默认只将端口发布到宿主机 `127.0.0.1`，适合本机试运行，或置于服务器的 HTTPS 反向代理后。项目当前没有自带域名、证书、反向代理或高可用部署。

Admin 已接入单管理员登录、退出、8 小时会话和后端授权，可新增、编辑 MIDI 基本信息。管理员来自一次性数据库安装，或优先使用完整有效的环境凭据，无公开注册或多角色管理。保存的档案立即出现在公开站点；归档状态不控制可见性。对外部署需使用 HTTPS 和 Secure Cookie。完整单机模式下 PostgreSQL 与后端不需要直接暴露到公网，`noindex` 仅控制索引。

### 当前生产：Vercel 前后端独立项目 + Neon Free

后端项目使用仓库根目录及正式配置 `vercel.json`：`services.backend.root='.'`、`entrypoint='Dockerfile.vercel'`、region `iad1`，`/(.*)` rewrite 指向 backend。它不是前端配置，也不包含数据库或迁移任务；未来经确认发布时须显式选择此配置（CLI 对应 `--local-config vercel.json`），不能误部署到前端项目。

后端容器接受平台 `PORT`，优先于 `BACKEND_PORT`；监听 `0.0.0.0`，默认 `DB_POOL_SIZE=2`、`HTTP_THREADS=2`、`WORKER_THREADS=2`。`DATABASE_URL` 使用现有 Neon 连接配置，数据库与存储密钥仅放在后端项目、按 Production / Preview 隔离；不要复制 Compose 的 `postgres` DNS 名称到云端。前端继续 Root Directory=`frontend`，只配置 `BACKEND_API_URL`、`ADMIN_ORIGIN`、`ADMIN_COOKIE_SECURE`。

云容器 `/tmp` 不持久，导入默认关闭；只有完成第 3.3 节的真实桶认证与私有策略验证后，才可启用 S3 导入。保持小连接池，避免自动反复云构建、密集轮询和生产写入测试；已有桶无需新建存储产品。完整设置见 [Vercel 部署指引](docs/vercel-assessment.md)。

### 仍可用：前端 Vercel、后端 VPS / Compose

前端目录已包含自己的 package/lockfile、Node 版本约束、环境示例、忽略规则、许可证、Dockerfile 和 `vercel.json`，可以不带父目录文件单独安装、构建。Vercel 中导入当前仓库并选择 Root Directory=`frontend`，不需要新建 Git 仓库。

选择旧 VPS 方案时，服务器按下文准备根目录 `.env`、数据库和存储，只需启动后端及其依赖，不启动本机前端：

```sh
docker compose --env-file .env up --build -d backend
```

Compose 仍会解析完整配置，因此根目录 `.env` 保留模板要求的变量；这些配置不会自动同步到 Vercel。这个命令不停止已经在运行的前端容器，也不删除数据卷。

在服务器部署 HTTPS 反向代理，将后端域名转发到 `http://127.0.0.1:8080`（端口以实际配置为准），让 Vercel 能访问其公开 API 和受认证保护的管理 API；数据库继续仅在本机或私网可达。在 Vercel 单独设置 `BACKEND_API_URL=https://api.example.com`、精确匹配前端域名的 `ADMIN_ORIGIN` 和 `ADMIN_COOKIE_SECURE=true`，保存项目变量后重新部署；`/install` 只能生成这三项配置文本，不会代写变量或调用 Vercel API。安装令牌仅配置在后端，详见第 3.1 节。示例域名必须替换成自己的地址，不要把 Docker 内部名称 `backend` 或 localhost 填进 Vercel。

Vercel 使用原生 Next.js 构建；`frontend/Dockerfile` 在构建时设置 `NEXT_OUTPUT_STANDALONE=true`，仅供自托管镜像生成 standalone 输出。原有整栈 Compose 的前端 build context 现在是 `./frontend`，因此独立构建同样可以使用 `docker build -t lostmidi-frontend ./frontend`。

## 2. 环境准备

### 2.1 Docker 路径

- Linux：安装 Docker Engine 和 Compose 插件。
- Windows / macOS：安装并启动 Docker Desktop，使用 Linux containers。
- Compose 需支持 `--wait`、`service_healthy` 和 `service_completed_successfully`。
- 主机能访问基础镜像、npm 和 Conan 的依赖源。首次 C++ 依赖构建可能较慢，预留构建内存和磁盘空间。
- 选择稳定的部署目录；不要随意改名或改变 Compose 项目名，以免连接到另一组 named volume。

```sh
docker version
docker compose version
docker info
```

`docker info` 必须能连接到服务端。只有 Docker CLI、没有运行 Docker Engine 时，不能构建或运行容器。Docker 部署无需在宿主安装 Node.js、C++ 编译器或 PostgreSQL；交互生成管理员密码哈希及可选 smoke 检查需要 Python 3，可在可信的维护电脑上生成哈希后写入部署配置。

### 2.2 获取代码

将完整仓库放到部署目录，确认包含 `docker-compose.yml`、`docker/`、`backend/`、`frontend/`、`database/` 和 `storage/`。服务器部署应选择已经过测试的提交，记录版本：

```sh
git rev-parse HEAD
git status --short
```

存在未提交修改时先明确它们是否属于本次发布。本文不自动覆盖工作区。

## 3. 首次配置

### 3.1 首次配置与一次性安装

仅在 `.env` 不存在时复制，不要覆盖已有部署配置。以下使用生产模板，默认关闭示例数据并启用 Secure Cookie，数据库密码和站点来源必须填写；本机 HTTP 试运行使用 `.env.example`。

Linux / macOS：

```sh
cp .env.production.example .env
chmod 600 .env
```

PowerShell：

```powershell
Copy-Item .env.production.example .env
```

编辑 `.env`。本机体验可使用样例值；服务器应替换数据库密码，并根据用途选择 `SEED_DEMO`：

```dotenv
POSTGRES_USER=lostmidi
POSTGRES_PASSWORD=REPLACE_WITH_A_RANDOM_PASSWORD
POSTGRES_DB=lostmidi
POSTGRES_PORT=5432

DATABASE_URL=postgresql://lostmidi:REPLACE_WITH_A_RANDOM_PASSWORD@postgres:5432/lostmidi
BACKEND_API_URL=http://backend:8080
BACKEND_PORT=8080
FRONTEND_PORT=3000

DB_POOL_SIZE=2
HTTP_THREADS=2
WORKER_THREADS=2
STORAGE_BACKEND=local
MIDI_IMPORT_ENABLED=false
STORAGE_PATH=./storage
SEED_DEMO=false

ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=
INSTALLATION_TOKEN=
ADMIN_ORIGIN=https://archive.example.org
ADMIN_COOKIE_SECURE=true
```

保留环境模板中其他配置即可。占位密码必须替换，`POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码必须对应。建议使用随机的 URL 安全字符；如果密码有 `@`、`:`、`/` 等保留字符，只在 URI 中进行百分号编码，数据库密码变量保留原值。

- `SEED_DEMO=true`：写入三条虚构档案，用于开发、演示和 smoke 检查。
- `SEED_DEMO=false`：空档案站点，适合正式数据环境。
- 从 true 改为 false **不会删除**此前已写入的示例。
- 不要提交 `.env`，也不要把完整的解析后 Compose 配置粘贴到公开日志；其中可能包含密码。

**新站一次性安装：**

1. 部署者准备数据库、连接凭据与存储；启动前应用全部迁移至 `006_midi_import_journal.sql`（Compose 由 migrate 服务执行）。安装页不创建数据库、不自动迁移或 seed。
2. 保持后端 `ADMIN_PASSWORD_HASH` 为空，用下列命令生成令牌，安全保存后填入后端 `INSTALLATION_TOKEN`：

   ```sh
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   空令牌禁用安装；非空必须匹配 `[A-Za-z0-9_-]{32,128}`，格式无效不能使用。令牌**只配置在后端**，不得放入 `NEXT_PUBLIC_`、URL、前端环境变量或公开日志。它不是管理员密码或 Vercel API token。
3. 核对下述 `ADMIN_ORIGIN` 和 Cookie 配置，按第 4 节启动。从实际前端来源打开 `/install`，填写站点名称、简介、用户名、密码及确认密码，并输入安装令牌。
4. 名称 trim 后为 1–200 UTF-8 字节，简介 trim 后为 0–1000 字节；用户名不 trim，必须为 ASCII `[A-Za-z0-9_.-]{3,64}`；密码不 trim，为 12–1024 UTF-8 字节。拒绝 NUL。数据库保存随机盐 PBKDF2-HMAC-SHA256（600,000 次）哈希，不保存明文密码。
5. 安装成功不自动登录，另行前往 `/admin/login`。可移除 `INSTALLATION_TOKEN`，再用 `docker compose up -d --wait backend` 更新容器环境；原生后端移除变量后重启。`site_installation(id=1)` 的持久锁仍有效，`/install` 只显示已安装，不能重装或重置。

安装提交在同一事务保存站点与账号，主键保证并发只有一个成功，等待 commit 确认后响应。超时后刷新状态核对，不能假定已经回滚或删除安装记录重试。数据库故障返回 503，不能当作未安装。安装 API、错误码与字段详见 [Admin 文档](docs/admin.md)。没有重装/reset、站点设置编辑或密码重置页。

**前端配置与 Vercel：** `/install` 的配置表单只能生成 `BACKEND_API_URL`、`ADMIN_ORIGIN`、`ADMIN_COOKIE_SECURE` 变量文本，不写 `.env`，不调用 Vercel API。Vercel 用户需自行保存到项目相应环境变量并重新部署；本机用户自行写入前端环境配置并重启/重新部署。生成文本不探测用户输入的 URL，诊断仅使用当前已部署环境目标；修改表单不会立刻切换后端。数据库保存的站点名称用于页眉、页脚和标题，简介用于 meta description。

公开站点 `/(site)` 与 `/admin` 父 layout 在请求时检查状态：缺后端配置或明确 `installed=false` 才跳 `/install`；旧后端 404、非法响应或离线仅显示不可用，不开放安装。前端无后端也可构建，但运行必须 API 可用。

**旧环境管理员与应急覆盖：** 完整有效的 `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` 继续优先，哈希用 `python scripts/admin_password.py` 生成，环境用户名沿用最多 100 UTF-8 字节的旧规则。不要把明文密码填进哈希变量；非法非空哈希使后端启动失败。没有完整覆盖时读取数据库管理员，默认 `ADMIN_USERNAME=admin` 加空哈希不会遮盖它。覆盖只改变选用的认证凭据，不修改数据库站点设置或账号。

旧站第一次运行新版必须保留完整环境凭据，待成功写入 `auth_source=environment` 的持久标记后才能改配置；标记的 username/password_hash 为 NULL，不复制环境哈希。之后移除凭据仍 installed，但登录禁用，需恢复环境或维护者应急覆盖，不能删除表重装。升级前先移除凭据时系统无法推断曾安装，详见第 7.2 节。

`ADMIN_ORIGIN` 是浏览器看到的完整来源，必须包含协议、主机和非默认端口，不能包含路径或末尾 `/`。上例域名必须换成实际域名。本机 HTTP 使用 `.env.example` 的 `ADMIN_ORIGIN=http://localhost:3000` 和 `ADMIN_COOKIE_SECURE=false`；若用 `http://127.0.0.1:3000`，必须相应修改来源。正式部署使用 HTTPS 与 `ADMIN_COOKIE_SECURE=true`，不要保留开发示例的 false。

修改环境凭据后，使用 `docker compose up -d --wait` 重建后端容器；无完整环境覆盖时，每次登录和鉴权重新读取数据库凭据，当前选用的用户名与哈希决定会话 identity。不匹配的 session 被拒绝，但恢复旧凭据可能让未过期旧 session 再次匹配，不能称为永久撤销。会话最长 8 小时，不随访问续期；退出只撤销当前会话。单后端进程每分钟最多 10 次登录尝试（包括成功登录），安装另有独立的每进程 10 次/分钟额度，分别超限返回 429，不跨实例共享。

### 3.2 地址与端口对照

| 配置 | Compose 内使用 | 原生运行使用 |
| --- | --- | --- |
| `DATABASE_URL` 的主机 | `postgres` | `127.0.0.1` 或实际数据库地址 |
| 数据库连接端口 | 始终为容器内 `5432` | 数据库实际端口 |
| `BACKEND_API_URL` | `http://backend:8080` | `http://127.0.0.1:8080` |
| `BACKEND_HOST` | Compose 固定注入 `0.0.0.0` | 建议 `127.0.0.1` |
| `STORAGE_PATH` | Compose 固定 `/app/storage` | 建议使用绝对路径 |
| `INSTALLATION_TOKEN` | 仅注入 backend，空值禁用新安装 | 仅在后端进程环境中设置 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | 仅注入 backend；完整有效时覆盖数据库管理员 | 在后端进程环境中设置；新安装保持哈希为空，升级保留完整旧凭据 |
| `ADMIN_ORIGIN` / `ADMIN_COOKIE_SECURE` | 仅注入 frontend | 在 frontend/.env.local 中设置 |

容器内的 `localhost` 指容器自己，不能用它连接另一个服务。`POSTGRES_PORT` 只改变宿主映射，不改变容器间的 5432。修改 `BACKEND_PORT` 后需同步修改 `BACKEND_API_URL` 中的端口。

`FRONTEND_PORT` 同时设置前端宿主映射与容器端口；变更浏览器端口时同步修改 `ADMIN_ORIGIN`。`PORT`、`HOSTNAME` 和 `NEXT_TELEMETRY_DISABLED` 由 Compose 注入，不必另外添加。三个线程/连接数参数允许 1–64。

### 3.3 私有持久存储：local / 已有 S3 桶

`STORAGE_BACKEND=local|s3` 默认 `local`；`MIDI_IMPORT_ENABLED=true|false` 默认 `false`，这两项和全部 S3 变量仅由 backend 接收，不能传给 frontend 或浏览器。关闭导入不免除 006 迁移要求。

**local：** 使用 `STORAGE_PATH`，Compose 固定把宿主 `./storage` 挂载到 `/app/storage`。保留专用持久目录，不要放在构建目录；Vercel 容器默认 `/tmp/lostmidi-storage` 会丢失，不能用于云导入。后端容器以 UID 10001 运行，Linux 首次建立专用目录可执行：

```sh
sudo install -d -o 10001 -g 10001 -m 0750 ./storage
```

已有文件时先确认属主和访问需求，不要递归改动不属于本项目的目录。Windows Docker Desktop 使用其挂载权限机制，不照搬 Linux 的 UID 设置。示例仅含元数据，没有 MIDI 文件是正常状态。

**S3：** 接入已有桶，不需要创建新服务。根环境模板保留未知桶名和密钥空值，私下填写下表；不要把模板原样设为 `s3` 后期待连接成功。

| 变量 | 契约 |
| --- | --- |
| `S3_ENDPOINT` | HTTPS origin，不含对象路径、查询串或内嵌凭据 |
| `S3_REGION` | 默认 `us-east-1`，按服务商确认实际 region |
| `S3_BUCKET` | 必须是真实桶名，目前未知，不猜测、不使用占位桶 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 仅后端服务端密钥，示例留空；撤销并更换已暴露旧密钥，不能复用 |
| `S3_PREFIX` | 默认 `lostmidi`；非空，每段仅字母、数字、`_`、`-`，段间用 `/`，不得有空段或 `..` |
| `S3_PATH_STYLE` | `true` / `false`，默认 `true`，需验证供应商兼容性 |
| `S3_PRIVATE_CONFIRMED` | 模板默认 `false`；必须先人工验证桶/专用前缀不匿名可读，再设 `true` |

`S3_PRIVATE_CONFIRMED=true` 仅是操作者 ACK，**不是权限校验**；PUT 的 private ACL 不能覆盖允许公开读取的桶策略。先在服务商控制台核对桶策略、ACL、专用前缀及任何公开访问入口，并对已知对象进行无凭据读取验证（不存在对象的 404 不证明私有）。若无法证明禁止匿名读取，不启用 S3 导入。密钥按专用前缀授予所需对象读/写/删除权限，不授予公共访问；实现不列桶、不扫目录。真实认证、私有策略、PUT private ACL、`If-None-Match: *` 条件写入与 Range GET 兼容性目前都未验证；客户端不会在出错后回退到无条件覆盖写入，但供应商是否遵守这些请求语义仍须实测。TLS 证书验证保持开启；运行镜像已通过 `SSL_CERT_FILE` 指向系统 CA，原生环境应配置可信 CA，不关闭验证。

只有在隔离测试库 + 独立测试前缀验证后，才为正式后端设置真实 S3 配置、`STORAGE_BACKEND=s3` 与 `MIDI_IMPORT_ENABLED=true`。选择 S3 时即使导入关闭也需要完整 S3 配置与私有确认；未准备好时保留 `local` + 导入关闭。改变 backend/bucket/prefix 不会搬迁已有对象，数据库与存储定位必须一致；不要让测试库与生产共用对象命名空间。

根 `.dockerignore` 排除真实环境文件、工具缓存、存储数据及平台产物，仍保留项目构建源码；前端独立 context 为 `./frontend`，继续使用其自己的 `.dockerignore`，不依赖父目录。

### 3.4 管理员私有单文件导入与失败清理

接口为 `GET/POST /api/v1/admin/midis/{id}/files`，两者均需 `Authorization: Bearer <管理员会话>`。GET 读取私有文件管理数据；POST 请求体是单个 MIDI 的原始字节，不是 multipart：

- `Content-Type: application/octet-stream`
- `X-File-Name: encodeURIComponent(原文件名)`
- `X-Entry-Revision: 当前档案 revision`
- `X-Rights-Confirmed: true`（确认有权私有归档，不是公开分发授权）

只接受单个 `.mid` / `.midi`、SMF 0/1/2，文件不超过 **1 MiB（1,048,576 字节）**；前端 Server Action 请求上限是 `2mb`，用于容纳表单开销，并不放宽文件限制。浏览器经 Next.js 服务端向 C++ 转发 Bearer；密钥不会传到前端。文件完全私有，不提供公开下载、试听或对象 URL，不修改版权、分发许可或归档状态。

相同档案相同 SHA-256 内容幂等；跨档案返回 `409 FILE_OWNERSHIP_CONFLICT`。新增文件登记与父档案 revision 递增原子提交，共用基本信息、来源、寻回、署名的版本边界；旧表单需刷新并合并，不能直接覆盖。HTTP 使用 `MidiImportService`，旧内部 `MidiFileService` 不是此导入入口。

对象与数据库无法共用事务：写存储前先持久化 journal，同 digest 使用数据库 advisory lock 串行化导入/清理。失败后的对象由 journal 跟踪，不靠列桶或扫描目录找“孤儿”。显式维护命令为 **`lostmidi_api --cleanup-imports`**（容器内可执行文件为 `/app/lostmidi_api`）；只处理超过 24 小时且没有文件引用的 journal，每次最多 100 条，不在启动时自动清理。

清理会删除对象，**禁止拿生产运行清理命令做测试**。必须使用原导入的同一数据库、`STORAGE_BACKEND`、bucket/prefix（local 则同一 `STORAGE_PATH`），并具备所需配置和权限；错配可能删除另一个环境的数据。先在独立测试库与独立前缀验证重试、并发和清理，正式维护需备份、核对目标并单独确认；不要添加定时任务或循环扩大清理范围。

## 4. 构建与启动

### 4.1 快速启动

```sh
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps -a
```

`--wait-timeout` 用于服务就绪等待，不是整个镜像构建的时限。如果命令报错，先查看日志，不要直接跳过失败步骤。`up` 的选项说明见 [Docker 官方文档](https://docs.docker.com/reference/cli/docker/compose/up/)。

希望将首次构建和启动分开排查时：

```sh
docker compose build
docker compose up -d --wait --wait-timeout 180
```

后端 Dockerfile 在构建阶段运行 CTest；未提供测试数据库连接时，数据库集成用例会跳过。前端构建不要求后端或数据库同时在线。

### 4.2 正常启动顺序

1. PostgreSQL 健康检查成功。
2. `migrate` 执行事务化迁移，退出码为 0。
3. Backend 启动并连接已迁移数据库，`/ready` 检查成功。
4. Frontend 启动并通过页面健康检查。

`migrate` 显示 **Exited (0)** 是正常情况；其他三个服务应处于运行且健康状态。依赖规则参考 [Compose 启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)。

当前应用需要执行全部迁移至 `006_midi_import_journal.sql`：002 新增管理员会话及档案 revision，003 新增人物 revision，004 允许未知寻回日期为 NULL，005 保存站点配置与持久安装锁，006 新增导入 journal 与私有归档确认字段，均保留已有资料。已有部署按第 7.2 节先迁移再启动新后端，旧环境管理员首次升级安装功能时保留完整凭据，不要修改已应用迁移。启动和 `/ready` 检查 006 记录、`midi_import_objects` 及 `midi_files.private_archive_confirmed`，继续检查 005 安装表与 004 日期可空性；关闭导入也不能跳过。缺少迁移会启动失败，运行中结构缺失或不可查询时返回 503，不解释为未安装。

## 5. 部署验收

生产库上线前运行以下只读检查，发现已知示例或测试标记时以非零退出，不删除数据：

```sh
docker compose run --rm migrate psql -X -v ON_ERROR_STOP=1 -f /database/check_production.sql
```

新生产库保持 `SEED_DEMO=false`，通过后台录入真实资料。已有库改为 false 不会清除历史示例；纯演示库建议另建生产库，混合数据需备份后逐条核对处理，不要批量删除所有档案或将虚构记录改名冒充真实资料。检查仅识别仓库已知标记，通过后仍需人工复核内容。测试用 seed 和 smoke 不应在生产库运行。

默认地址如下，修改端口后相应调整：

| 地址 | 预期 |
| --- | --- |
| `http://127.0.0.1:3000/` | 已安装显示公开首页；缺后端配置或明确未安装跳 `/install`，API 故障显示不可用 |
| `http://127.0.0.1:3000/midis` | 已安装时显示档案列表或正常空状态 |
| `http://localhost:3000/install` | 新站安装/配置引导；已安装只显示锁定；表单来源需匹配 ADMIN_ORIGIN |
| `http://localhost:3000/admin/login` | 已安装时显示管理员登录页；与默认 ADMIN_ORIGIN 一致 |
| `http://localhost:3000/admin` | 已安装但未登录转登录页，登录后显示工作台 |
| `http://localhost:3000/admin/midis` | 登录后显示后台档案表格与新增、编辑入口 |
| `http://localhost:3000/admin/modules` | 登录后显示模块目录 |
| `http://127.0.0.1:8080/health` | `{"status":"ok"}`，仅表示进程存活 |
| `http://127.0.0.1:8080/ready` | 200，确认数据库、revision、会话表、006 导入结构、005 安装表及 004 日期可空；不验证桶权限 |
| `http://127.0.0.1:8080/api/v1/installation` | 公开 no-store；installed、installation_enabled 和 site: {name, description}，不返回秘密 |
| `http://127.0.0.1:8080/api/v1/midis?page=1&pageSize=20` | 包含 data 与 pagination 的 JSON |

Linux / macOS：

```sh
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
curl -fsS 'http://127.0.0.1:8080/api/v1/midis?page=1&pageSize=20'
```

PowerShell 使用 `curl.exe`，避免旧版 PowerShell 将 `curl` 解释为别名。

**只有启用了 demo seed 的测试环境**才运行以下脚本：

```sh
python scripts/smoke.py
# 前端尚未启动时，仅检查后端：
python scripts/smoke.py --api-only
```

脚本假定至少存在三条示例及 `example-midi`，不能用于无 seed 的正式数据环境。包含前端的普通 smoke 应先完成安装或已成功写入 legacy 标记，否则页面会转向 `/install`。除了检查 HTTP 状态，还需打开 `/midis` 和 `/admin` 确认实际数据显示；前端连接失败时可能呈现提示页，单独首页 200 不代表完整链路正常。

**安装专项检查必须另备两个独立的全新已迁移专用测试库**，不能顺序指向同库；两个脚本都会永久安装。不要在生产库、已安装库或普通 seed 验收栈上试图重装。两个后端均保持 `ADMIN_PASSWORD_HASH` 为空、配置有效 `INSTALLATION_TOKEN`，并先用 GET 确认 `installed=false`、`installation_enabled=true`。不要通过删除安装行来重复测试。

- API 测试进程设置 `INSTALLATION_TEST_TOKEN`，与第一个后端令牌一致：

  ```sh
  python scripts/installation_smoke.py --api http://127.0.0.1:8080 --allow-install
  ```

- 浏览器测试使用**另一个**后端/新库，前端指向该后端且 `ADMIN_ORIGIN` 与浏览器来源一致。测试进程设置其 `INSTALLATION_TEST_TOKEN`，另设符合安装规则的 `ADMIN_TEST_USERNAME` / `ADMIN_TEST_PASSWORD`；这是要创建的新管理员，不是已有环境覆盖。安装 Playwright 及相应浏览器后执行：

  ```sh
  python scripts/installation_browser_smoke.py --frontend http://localhost:3000 --allow-install
  # 可选参数：--channel msedge --screenshots <截图目录>
  ```

安装验收应核对首次跳转、无令牌/错误令牌拒绝、输入校验、并发仅一成功、超时后的状态核对、成功后单独登录、数据库保存的站点名称/简介展示，以及重启/新浏览器下锁仍有效。数据库不可用、旧 API 404 和非法响应只能提示不可用，不得变成可安装状态。不要把测试秘密写进命令行、截图或日志。

CTest 的 `LOSTMIDI_TEST_DATABASE_URL` 仍使用已迁移且带 demo seed 的专用测试库；新增 installation 集成测试建立隔离 schema，连接用户需 CREATE SCHEMA 权限。此库与两种安装 smoke 的新库分开。本地验收结果及尚未执行的场景见 [Implementation Report](docs/implementation-report.md)；部署到目标环境后仍需按本节核对。

后台功能在独立测试环境完成以下验收。登录页面必须从 `ADMIN_ORIGIN` 配置的来源打开：

1. 未登录访问 `/admin/midis/new` 和编辑 URL，应跳转登录；直接调用后台写 API 应返回 401。
2. 错误密码显示错误；正确账号登录后进入工作台，Cookie 为 HttpOnly、SameSite=Strict、Path=/admin，HTTPS 部署还应为 Secure。
3. 新增一条测试档案，检查成功提示、公开列表与详情；修改基本信息后公开详情应反映最新值。修改 slug 后旧 URL 返回 404，当前没有自动重定向。
4. 重复 slug 和非法字段应显示错误且保留表单内容；两个标签页编辑同一档案时，后保存的旧版本应收到冲突提示，不能覆盖已保存内容。
5. 从作品编辑页进入「管理来源与寻回」：新增、编辑、删除来源和寻回记录，公开详情同步更新。未知时间、人物可留空；网址及 UTC 日期必须合法，来源首次时间不能晚于最后时间。
6. 来源、寻回、署名及基础信息共用作品版本；并发旧表单不得覆盖新内容，401/409 保留输入，删除需确认且取消不丢输入。检查桌面及手机宽度。
7. 退出后重新访问后台应要求登录，已撤销的令牌不能写入；会话到期后也应重新登录。

管理员自动检查命令（admin_smoke 会触发登录限流，放在最后）：

```sh
python scripts/people_smoke.py --api http://127.0.0.1:8080 --allow-writes
python scripts/recovery_smoke.py --api http://127.0.0.1:8080 --allow-writes
# 导入测试还要求独立 local 目录或 S3 测试前缀，以及已启用 MIDI_IMPORT_ENABLED。
python scripts/midi_import_smoke.py --api http://127.0.0.1:8080 --allow-writes
# 可选：已安装 Playwright 及对应浏览器；可加 --channel msedge 使用 Edge
python scripts/midi_import_browser_smoke.py --frontend http://localhost:3000 --allow-writes
python scripts/admin_browser_smoke.py --frontend http://localhost:3000 --allow-writes
python scripts/admin_smoke.py --api http://127.0.0.1:8080 --allow-writes
```

运行前将 API 指向专用测试数据库，配置测试管理员，再通过 `ADMIN_TEST_USERNAME` 和 `ADMIN_TEST_PASSWORD` 环境变量提供该账号凭据。脚本会新增并保留测试档案，且触发登录限流；不适合正式数据库。可在交互终端隐藏输入测试密码，例如 Bash 使用 `read -r -s -p 'Test password: ' ADMIN_TEST_PASSWORD` 后 `export ADMIN_TEST_PASSWORD`；不把密码写进命令行或测试输出。各项验证的实际执行状态见 [Implementation Report](docs/implementation-report.md)。

## 6. 服务器访问与长期运行

### 6.1 远程试用

默认回环地址不会直接向外提供服务。可以从自己的电脑建立 SSH 隧道：

```sh
ssh -N -L 3000:127.0.0.1:3000 deploy@YOUR_SERVER
```

随后访问本机 `http://127.0.0.1:3000`。本机 3000 被占用时，将 `-L` 的第一个端口改为 3001，并访问该端口。后台操作需要将服务端 `ADMIN_ORIGIN` 设置为浏览器访问的隧道来源；HTTP 本机试用使用 `ADMIN_COOKIE_SECURE=false`。切回正式域名时恢复 HTTPS 来源和 Secure Cookie。

### 6.2 域名与 HTTPS

在宿主机已有反向代理上，将站点域名转发至 `http://127.0.0.1:3000`，配置证书以及 Host、X-Forwarded-For、X-Forwarded-Proto。App Router 使用流式响应，代理应允许流式传输。代理若运行在容器中，不能用它自己的 localhost 指向宿主，应根据代理的实际网络配置连接前端。

公开页面和 Admin 共用前端进程。将 `ADMIN_ORIGIN` 设置为实际 HTTPS 域名，`ADMIN_COOKIE_SECURE=true`，代理保留与该域名一致的 Host 和来源信息，否则登录或保存会被来源检查拒绝。后台通过 HttpOnly Cookie 与 C++ 会话校验控制访问；如需仅内部使用，可另在代理层限制 `/admin` 及其子路径。后端请求由 Next.js 服务端发起，不需要将 8080 或 5432 映射到公网。域名、证书和代理配置取决于部署主机，不包含在本仓库的 Compose 中。

### 6.3 重启行为

当前 Compose 没有为长期服务配置自动重启策略。`-d` 只表示后台运行，不是系统开机自启或自动故障恢复。若需要，可在部署目录创建本地 `docker-compose.override.yml`：

```yaml
services:
  postgres:
    restart: unless-stopped
  backend:
    restart: unless-stopped
  frontend:
    restart: unless-stopped
```

保持 `migrate` 的一次性行为，不给它添加循环重启。创建 override 后重新执行 `docker compose config --quiet` 和 `docker compose up -d --wait`。另需确保 Docker 服务随系统启动。健康检查失败本身不会自动重启容器，仍需监控及排障。

## 7. 日常操作与更新

### 7.1 查看和停止

```sh
docker compose ps -a
docker compose logs --tail=100 frontend backend migrate postgres
docker compose logs -f backend
docker compose stop
```

恢复完整依赖检查使用 `docker compose up -d --wait`。`docker compose down` 移除容器和默认网络，但保留 named volume 与宿主 storage。**不要使用 `down -v` 作为常规排障手段**，它会删除数据库 volume。

### 7.2 更新发布

**当前 Vercel + Neon 已有库：先迁移，再更新应用。** 生产目前至 005，新 006 尚未执行；即使 `MIDI_IMPORT_ENABLED=false`，新版启动与 `/ready` 也需要 006 journal 表及确认字段。

1. 记录当前版本与配置，安排维护窗口、暂停写入，安全备份现有 Neon 数据库及匹配存储；确认备份可恢复。迁移用受控维护连接，核对目标库，不能重新创建或清空数据库。
2. 在可信维护环境使用已经配置好的 libpq 连接变量（不得打印凭据），保持 `SEED_DEMO=false`，执行仓库现有幂等脚本：

   ```sh
   SEED_DEMO=false sh database/migrate.sh
   ```

   脚本支持已有库，以事务和 advisory lock 串行迁移，校验并跳过已应用版本；`DATABASE_URL` 非空时优先于 `PG*`。保留原 001–005 与校验和，不使用要求空库的 `.tools` 临时脚本，不直接只跑 006 SQL 绕过迁移账本。
3. 退出码必须为 0，再只读核对 `schema_migrations` 中的 `006_midi_import_journal.sql` 与新增结构，保留 `site_installation` 锁及已有资料。失败先排障，不能发布新版绕过检查。
4. 本地检查及迁移确认后，另行确认发布到**后端独立项目**并显式选择 `vercel.json`，再更新前端；不反复触发云构建。核对 `/ready`、已有安装状态与只读页面。真实桶未验证前保持导入关闭；S3 配置与密钥不得复制到前端。

本轮没有执行上述迁移、云构建或发布，不能据此声称联调成功。

**旧 VPS / Compose** 仍采用可接受短暂停机的单机流程：

1. 记录旧提交、环境配置及镜像信息，按第 8 节备份。
2. 将部署代码更新到已经测试的目标提交；保留 `.env`、storage 和 Compose 项目标识。旧环境管理员首次升级至含安装功能的版本时，**必须保留完整有效的 `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`**，不要先清空凭据。
3. 构建新镜像；构建失败时先修复，不继续切换。
4. 停止应用，执行全部待应用迁移至 006，再启动新应用。保留 005 安装表，不改旧迁移，不 seed 生产库。

```sh
docker compose build
docker compose stop frontend backend
docker compose up -d --wait postgres
docker compose run --rm migrate
# 上一步退出码必须为 0；成功后再执行：
docker compose up -d --wait --wait-timeout 180
```

旧环境部署启动成功后会在 `site_installation(id=1)` 写入 `auth_source=environment` 的持久 legacy 标记，不复制用户名或哈希。先确认 `/ready`、`GET /api/v1/installation` 的 `installed=true`，并可由维护者只读查询 `SELECT id, auth_source FROM site_installation WHERE id=1;` 核对标记，再调整配置。仅应用 005 不等于旧站标记已经写入；在第一次运行新版前移除环境凭据，系统无法推断曾安装。

移除 legacy 环境凭据不会重新开放安装，而是保留 installed 并禁用登录；需恢复原凭据或维护者应急覆盖，不得删表/行重装。数据库安装的账号在无完整环境覆盖时使用，完整环境覆盖不更改站点设置或数据库账号。

最后按第 5 节验收。迁移脚本对已执行版本校验并跳过，不会重复 seed；已应用 SQL 文件不能直接改写。`docker compose restart` 不会重建镜像，也不会更新容器环境变量；修改源码或 `.env` 后应使用相应的 build / up 流程。Vercel 项目变量修改后也须重新部署，不会自动同步后端配置。

### 7.3 回退

应用回退前确认旧版本兼容现有 schema，再切换旧提交或保留的镜像重新部署。当前没有 down migration；回退代码不会回退数据库。若 schema 不兼容，应恢复匹配的数据库与文件备份，并明确备份时间之后的数据如何处理。不要用删除 volume 的方式冒充回滚。

## 8. 备份与恢复

以下命令是 **VPS / Compose + local** 的 Linux Bash 示例，不适用于直接备份 Neon 或 S3。备份存于仓库之外并复制到独立存储；数据库、对应对象、部署版本和受控配置共同构成恢复资料。

Vercel + Neon + S3 需另行使用受控数据库备份与服务商对象备份/版本保留机制，记录 backend、endpoint、bucket、prefix，并保持匹配的恢复时间点。`storage.tar.gz` 不包含 S3 对象；不能把仅数据库备份当完整归档，也不能直接将恢复测试库指向生产前缀运行导入或清理。暂停导入、清理及其他写入后再制作一致备份，先在隔离目标演练，避免无计划的全桶复制消耗额度。

### 8.1 创建一致的维护备份

停止应用并暂停所有导入、后台写入和其他写数据库的程序；PostgreSQL 保持运行。管理员保存档案和登录、退出都会写数据库，维护备份期间应停止应用写入。

```bash
backup_dir="../lostmidi-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
docker compose stop frontend backend
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/lostmidi-backup.dump'
docker compose cp postgres:/tmp/lostmidi-backup.dump "$backup_dir/database.dump"
sudo tar -czf "$backup_dir/storage.tar.gz" -C . storage
git rev-parse HEAD > "$backup_dir/commit.txt"
cp .env "$backup_dir/environment.env"
chmod 600 "$backup_dir/environment.env"
docker compose exec -T postgres pg_restore --list /tmp/lostmidi-backup.dump
```

逐项确认命令成功、备份文件存在后，执行 `docker compose up -d --wait` 恢复服务。`pg_restore --list` 只检查归档可读取，不替代实际恢复演练。数据库归档先写到容器再 `compose cp`，避免 Windows PowerShell 旧版本重定向二进制造成损坏；Windows 操作者需将目录变量和文件操作改为对应 PowerShell 命令。

`.env` 备份可能包含数据库密码、环境管理员哈希、安装令牌和 S3 密钥；数据库归档现在还可能包含 `site_installation` 中的数据库管理员哈希，以及 `admin_sessions` 会话摘要，不能只保护环境哈希。两类备份都应使用受控权限与备份加密。正式恢复时明确撤销历史 sessions，或改用不同于历史的有效凭据，并防止以后恢复旧凭据重新匹配未过期会话。不要把整个 PostgreSQL 正在运行的数据目录当普通文件复制作为逻辑备份。

### 8.2 恢复演练：新数据库，不覆盖原库

选择待恢复的备份目录，使用一个不存在的测试库名。不要先对恢复目标执行项目 migration，dump 已包含 schema 和迁移历史。

```bash
backup_dir="../lostmidi-backups/REPLACE_WITH_BACKUP_TIMESTAMP"
docker compose cp "$backup_dir/database.dump" postgres:/tmp/lostmidi-restore.dump
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" lostmidi_restore_check'
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d lostmidi_restore_check --no-owner --no-privileges --exit-on-error --single-transaction /tmp/lostmidi-restore.dump'
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d lostmidi_restore_check -c "SELECT count(*) FROM midi_entries;"'
mkdir -p "$backup_dir/restore-check"
sudo tar -xzf "$backup_dir/storage.tar.gz" -C "$backup_dir/restore-check"
```

本例不会删除原数据库或替换当前 storage。若测试库名已存在，应另选名称；不要直接对已有库执行覆盖恢复。`--no-owner` 和 `--no-privileges` 适用于当前单应用账号模型，有多角色部署时需另行恢复角色与授权。归档恢复参数见 [PostgreSQL 17 pg_restore 文档](https://www.postgresql.org/docs/17/app-pgrestore.html)。

正式切换恢复数据时，先停止所有应用和写入程序，恢复匹配的 storage，检查 UID 10001 的目录权限，将 `.env` 中 `POSTGRES_DB` 与 `DATABASE_URL` 指向已恢复的库，选定兼容的代码版本，再运行迁移及启动验收。恢复含 005 的备份时保留安装行；旧环境部署备份则必须带完整有效环境凭据完成首次新版启动和 legacy 标记写入。不要在共享正式数据库上运行演练写入或盲目切换。

开放恢复站点前，维护者应明确撤销恢复库中的历史 `admin_sessions`（维护窗口内、确认目标库后清除会话记录，不是删除安装表），或配置新的有效凭据使历史会话不再匹配。仅临时覆盖后又恢复原用户名与哈希，可能让尚未过期的历史 session 再次有效；因此采用凭据切换时还须防止恢复旧 identity，不能把它当作永久撤销。

### 8.3 忘记管理员密码 / 环境凭据丢失

1. 不要清空安装行、删除表、重装或删除数据卷；`/install` 锁定是预期行为，没有密码重置页或 reset API。
2. 在可信终端运行 `python scripts/admin_password.py` 生成**新**随机盐哈希，将它与有效的 `ADMIN_USERNAME` 一起配置在后端，作为完整环境应急覆盖；重建容器或重启原生后端使环境生效，不向前端项目配置这些凭据；Vercel 部署时也仅放在后端项目。
3. 环境覆盖优先于数据库管理员，但不更改数据库账号、站点名称或简介。保持覆盖直到维护者妥善维护数据库凭据；撤掉覆盖会重新选用原数据库账号，这不是自动永久重置。若是 environment 标记的旧站，标记本身没有账号哈希，必须保留/恢复有效环境凭据才能登录。
4. 按前述方式处理历史 sessions；无完整环境覆盖时，每次登录/鉴权重读数据库凭据，切换时不匹配的会话被拒绝，但恢复旧凭据可重新匹配未过期会话。完成登录与授权核对后再恢复对外服务。

## 9. 不使用 Docker 的原生运行

原生编译命令按平台见 [README 的 Local Development](README.md#local-development)。基本顺序不能省略：

1. 安装 Node 22.13+（22.x）、npm、C++20 编译器、CMake 3.24+、Conan 2、PostgreSQL 17 与 psql。
2. 创建数据库和用户，设置 libpq 连接变量，执行 `SEED_DEMO=false sh database/migrate.sh`，应用至 006；Windows 可用 Git Bash。连接/迁移由部署者准备，不由安装页执行。
3. Conan 安装依赖，CMake configure / build / CTest。
4. 设置 DATABASE_URL、BACKEND_HOST、BACKEND_PORT、STORAGE_PATH。新站保持 ADMIN_PASSWORD_HASH 为空、仅在后端设置有效 INSTALLATION_TOKEN；旧环境部署首次新版启动保留完整 ADMIN_USERNAME、ADMIN_PASSWORD_HASH。运行后端可执行程序。
5. 在 frontend 目录配置 BACKEND_API_URL、ADMIN_ORIGIN、ADMIN_COOKIE_SECURE；开发使用 `.env.local`，生产使用 `.env.production.local`，然后构建并运行前端。
6. 新站按第 3.1 节访问 `/install` 完成一次性初始化，成功后单独登录；可移除后端令牌并重启，数据库锁仍有效。已有站点则核对 installed 和所选凭据来源，不重新安装。

原生前端生产模式示例（仅在目标文件不存在时复制）：

```sh
cd frontend
cp .env.production.example .env.production.local
# 填入真实 BACKEND_API_URL、精确的 ADMIN_ORIGIN，并保持 ADMIN_COOKIE_SECURE=true
npm ci
npm run build
npm run start
```

PowerShell 对应使用 `Copy-Item` 和 `npm.cmd`。后端不会自动读取根目录 `.env`；Next.js 原生模式读取 frontend/.env.local。`npm run start` 使用已有构建，修改页面后必须重新 build 并重启进程；开发热更新则使用 `npm run dev`。

`.tools/` 中的便携 PostgreSQL、编译缓存或测试脚本是开发时的临时产物，不属于标准部署依赖。原生长期服务应交由主机的服务管理器管理，不能依赖交互终端一直打开。

## 10. 常见故障

| 现象 | 检查与处理 |
| --- | --- |
| Docker named pipe 不存在 / Cannot connect to daemon | 启动 Docker Engine / Desktop，确认 Linux containers；先让 docker info 成功 |
| 缺少环境变量 | 确认根目录 .env 存在，运行 config --quiet；不要输出含密码的完整配置 |
| 端口被占用 | 停止旧的本机服务或调整宿主端口；同步后端 URL，注意数据库内部仍用 5432 |
| Backend 启动失败或 /ready 503 | 查看 backend、migrate、postgres 日志；核对连接、006 迁移与导入结构、005 安装表，以及 004 日期实际可空；不要将数据库故障当作未安装 |
| 改密码后仍无法连接 | PostgreSQL 初始化变量只用于首次初始化；已有库需要实际修改数据库角色密码，再同步 URI |
| migrate Exited (0) | 正常的一次性任务结束，不要手工强制保持运行 |
| migrate 非零退出 / checksum changed | 找出失败 SQL；恢复被改写的历史 migration，以新文件表达变更，不跳过失败或删迁移历史 |
| storage Permission denied | 检查宿主挂载目录及 UID 10001 的访问权限，不使用全员可写作为常规修复 |
| 首页可开，列表提示不可用 | 首页成功不代表 API 可用；检查 BACKEND_API_URL 与 /ready |
| /admin 404 或页面仍为旧版 | 确认请求到本项目进程；重建前端并重建容器，原生模式重新 build、重启 |
| 未安装但 INSTALLATION_DISABLED / 403 | 后端 INSTALLATION_TOKEN 为空；仅在后端配置有效令牌后更新容器环境或重启，不将令牌写到前端 |
| INVALID_INSTALLATION_TOKEN / 403 | 核对输入与后端环境令牌，令牌须匹配 `[A-Za-z0-9_-]{32,128}`；不得在 URL 或日志传递 |
| 安装 INVALID_INPUT / 400 | 核对 UTF-8 字节长度、用户名 ASCII 规则、密码不 trim、NUL 和未知字段；确认密码不是后端 API 字段 |
| 安装 ALREADY_INSTALLED / 409 或页面锁定 | 持久安装锁正常生效；刷新核对，不删除安装行/表，不通过清空凭据重装 |
| 安装提交超时 | 刷新安装状态核对是否已提交；超时不证明回滚，数据库不可用时先恢复服务，不能假定未安装 |
| 安装状态 API 404 / 非法响应 / 离线 | 升级并检查已部署后端目标及 /ready；仅显示不可用是预期行为，不应开放安装 |
| 前端配置生成后仍使用旧地址 | 表单只生成文本且不探测新 URL；用户自行保存 Vercel 项目对应环境变量并 Redeploy，诊断只用已部署目标 |
| 管理员账号尚未配置 / ADMIN_DISABLED | 无完整环境覆盖时需有数据库管理员；新站先安装。legacy 标记没有数据库凭据，恢复有效环境凭据或按第 8.3 节应急覆盖，不能删表重装 |
| 忘记数据库管理员密码 | 用 scripts/admin_password.py 生成新环境应急覆盖并保持，直到维护者妥善维护数据库凭据；无自动永久重置，处理历史 sessions 见第 8.3 节 |
| 管理员配置无效导致后端退出 | 检查是否误填明文密码、哈希是否完整、环境用户名是否超过 100 UTF-8 字节；安装表单用户名另用 ASCII 3–64 字符规则 |
| 请求来源与后台配置不一致 | ADMIN_ORIGIN 必须精确匹配浏览器协议、主机和端口，无末尾斜杠；安装同样受检查，反向代理需保留 Host |
| 登录成功后仍返回登录页 | 检查 Cookie 是否写入及发送；本机 HTTP 使用 false，正式 HTTPS 使用 true；核对实例的凭据来源及当前用户名/哈希是否一致 |
| 登录或安装尝试过多 / 429 | LOGIN_RATE_LIMITED 与 INSTALLATION_RATE_LIMITED 各为每进程 10 次/分钟、互不共用；等相应窗口结束，自动测试也会消耗次数 |
| 编辑提示版本冲突 | 保留当前输入，重新打开编辑页获得新版本后合并修改；不能直接重复提交旧 revision |
| 修改 slug 后旧链接 404 | 当前无 slug 历史与重定向，使用保存后的公开链接并更新引用 |
| 没有档案 / example-midi 404 | SEED_DEMO=false 的空库正常；不要为通过演示测试向正式库注入示例 |
| 修改环境后没生效 | 使用 compose up 重建对应容器；仅 restart 不更新容器环境 |
| Conan 下载或 TLS 验证失败 | 检查网络、代理及受信任证书配置，不通过关闭 TLS 验证解决 |
| C++ 构建资源不足 | 给 Docker 增加可用资源并检查磁盘；首次依赖构建可能比应用编译更耗时 |

## 11. 验证记录与文档维护

当前生产为前后端独立 Vercel 项目、后端容器 + Neon Free；旧 VPS / Compose 整栈模式仍可用。历史上放弃的是把数据库持久卷、迁移和本地存储一起塞入前端一键部署，不限制当前后端容器方案。配置与边界见 [Vercel 部署指引](docs/vercel-assessment.md)。

本手册说明部署契约与验收步骤。历史安装与双来源认证验收见 [Implementation Report](docs/implementation-report.md)，不是新导入功能的验收证明。当前私有 MIDI 导入已在本地实现、尚未发布，生产只迁移至 005、006 尚未执行；真实桶认证、私有策略及联调均待验证。本轮配置文档工作未执行构建、远程 CI、生产迁移、清理或发布；代码编译测试、目标环境验收和备份恢复应另行记录，不将待验证事项写为通过。

每次修改端口、存储挂载、环境变量、migration 策略、权限模型或构建路径时，同步更新本文件。发布记录至少保存提交号、部署时间、迁移结果、验收结果及备份位置；不记录明文密码。
