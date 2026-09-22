# Lost MIDI Archive 部署与运行手册

适用版本：当前仓库基础工程、单管理员认证、档案与人物管理；2026-09-22 补充前端独立部署说明。

本文指导单机部署、前端 Vercel 分离部署、启动验收、更新和数据维护。架构与原生编译细节见 [README](README.md)，数据库规则见 [数据库说明](docs/database.md)。命令默认在**仓库根目录**执行；代码块标注了 Shell，服务器维护部分使用 Bash。

## 1. 部署方式与边界

前后端是同仓库中的独立项目，可以选择完整 Compose 部署，或仅把 `frontend/` 部署到 Vercel。完整单机部署使用仓库自带的 Docker Compose，一次部署四个服务：

| 服务 | 职责 | 数据与生命周期 |
| --- | --- | --- |
| `postgres` | PostgreSQL 17.11 | `postgres_data` named volume，持久保存数据库 |
| `migrate` | 应用 SQL migration，可选写入示例数据 | 一次性任务，成功后退出，退出码应为 0 |
| `backend` | C++20 / Drogon REST API | `./storage` 挂载到 `/app/storage` |
| `frontend` | Next.js 生产构建、公开站点和 Admin | 服务端通过内部 HTTP 地址访问 backend |

默认只将端口发布到宿主机 `127.0.0.1`，适合本机试运行，或置于服务器的 HTTPS 反向代理后。项目当前没有自带域名、证书、反向代理或高可用部署。

Admin 已接入单管理员登录、退出、8 小时会话和后端授权，可新增、编辑 MIDI 基本信息。管理员由部署环境配置，无公开注册或多角色管理。保存的档案立即出现在公开站点；归档状态不控制可见性。对外部署需使用 HTTPS 和 Secure Cookie。完整单机模式下 PostgreSQL 与后端不需要直接暴露到公网，`noindex` 仅控制索引。

### 前端 Vercel、后端独立运行

前端目录已包含自己的 package/lockfile、Node 版本约束、环境示例、忽略规则、许可证、Dockerfile 和 `vercel.json`，可以不带父目录文件单独安装、构建。Vercel 中导入当前仓库并选择 Root Directory=`frontend`，不需要新建 Git 仓库。完整设置和可选的一键克隆部署按钮见 [前端 Vercel 部署指引](docs/vercel-assessment.md)。

服务器仍按下文准备根目录 `.env`、数据库和存储，只需启动后端及其依赖，不启动本机前端：

```sh
docker compose --env-file .env up --build -d backend
```

Compose 仍会解析完整配置，因此根目录 `.env` 保留模板要求的变量；这些配置不会自动同步到 Vercel。这个命令不停止已经在运行的前端容器，也不删除数据卷。

在服务器部署 HTTPS 反向代理，将后端域名转发到 `http://127.0.0.1:8080`（端口以实际配置为准），让 Vercel 能访问其公开 API 和受认证保护的管理 API；数据库继续仅在本机或私网可达。在 Vercel 单独设置 `BACKEND_API_URL=https://api.example.com`、精确匹配前端域名的 `ADMIN_ORIGIN` 和 `ADMIN_COOKIE_SECURE=true`。示例域名必须替换成自己的地址，不要把 Docker 内部名称 `backend` 或 localhost 填进 Vercel。

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

### 3.1 创建环境文件

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

DB_POOL_SIZE=4
HTTP_THREADS=2
WORKER_THREADS=4
SEED_DEMO=false

ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=
ADMIN_ORIGIN=https://archive.example.org
ADMIN_COOKIE_SECURE=true
```

保留 `.env.example` 中其他配置即可。占位密码必须替换，`POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码必须对应。建议使用随机的 URL 安全字符；如果密码有 `@`、`:`、`/` 等保留字符，只在 URI 中进行百分号编码，数据库密码变量保留原值。

- `SEED_DEMO=true`：写入三条虚构档案，用于开发、演示和 smoke 检查。
- `SEED_DEMO=false`：空档案站点，适合正式数据环境。
- 从 true 改为 false **不会删除**此前已写入的示例。
- 不要提交 `.env`，也不要把完整的解析后 Compose 配置粘贴到公开日志；其中可能包含密码。

启用后台前运行以下命令，交互输入并确认至少 12 个字符的管理员密码：

```sh
python scripts/admin_password.py
```

把输出的整行 `ADMIN_PASSWORD_HASH=pbkdf2_sha256:600000:...` 替换到 `.env`。密码哈希采用随机盐和 PBKDF2-HMAC-SHA256；不要把明文密码填入哈希变量。`ADMIN_USERNAME` 最长 100 UTF-8 字节；空用户名或空哈希会关闭管理员登录，公开查询仍可使用。非空但格式错误的哈希会使后端启动失败。不存在预置管理员密码。

`ADMIN_ORIGIN` 是浏览器看到的完整来源，必须包含协议、主机和非默认端口，不能包含路径或末尾 `/`。上例域名必须换成实际域名。本机 HTTP 使用 `.env.example` 的 `ADMIN_ORIGIN=http://localhost:3000` 和 `ADMIN_COOKIE_SECURE=false`；若用 `http://127.0.0.1:3000`，必须相应修改来源。正式部署使用 HTTPS 与 `ADMIN_COOKIE_SECURE=true`，不要保留开发示例的 false。

修改用户名或重新生成密码哈希后，使用 `docker compose up -d --wait` 重建后端容器使配置生效；旧会话随新的凭据标识失效。会话最长 8 小时，不随访问续期。退出登录撤销当前会话，其他浏览器会话保留。单后端进程每分钟最多接受 10 次登录尝试（包括成功登录），超出返回 429；这不是跨实例的限流机制。

### 3.2 地址与端口对照

| 配置 | Compose 内使用 | 原生运行使用 |
| --- | --- | --- |
| `DATABASE_URL` 的主机 | `postgres` | `127.0.0.1` 或实际数据库地址 |
| 数据库连接端口 | 始终为容器内 `5432` | 数据库实际端口 |
| `BACKEND_API_URL` | `http://backend:8080` | `http://127.0.0.1:8080` |
| `BACKEND_HOST` | Compose 固定注入 `0.0.0.0` | 建议 `127.0.0.1` |
| `STORAGE_PATH` | Compose 固定 `/app/storage` | 建议使用绝对路径 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | 仅注入 backend | 在后端进程环境中设置 |
| `ADMIN_ORIGIN` / `ADMIN_COOKIE_SECURE` | 仅注入 frontend | 在 frontend/.env.local 中设置 |

容器内的 `localhost` 指容器自己，不能用它连接另一个服务。`POSTGRES_PORT` 只改变宿主映射，不改变容器间的 5432。修改 `BACKEND_PORT` 后需同步修改 `BACKEND_API_URL` 中的端口。

`FRONTEND_PORT` 同时设置前端宿主映射与容器端口；变更浏览器端口时同步修改 `ADMIN_ORIGIN`。`PORT`、`HOSTNAME` 和 `NEXT_TELEMETRY_DISABLED` 由 Compose 注入，不必另外添加。三个线程/连接数参数允许 1–64。

### 3.3 存储目录

保留根目录 `storage/`，不要把它放进临时构建目录。后端容器以 UID 10001 运行；Linux 服务器首次建立专用目录可执行：

```sh
sudo install -d -o 10001 -g 10001 -m 0750 ./storage
```

已有文件时先确认属主和访问需求，不要递归改动不属于本项目的目录。Windows Docker Desktop 使用其挂载权限机制，不照搬 Linux 的 UID 设置。当前示例只含元数据，没有 MIDI 文件是正常状态。

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

当前应用需要执行全部迁移至 `004_optional_recovery_date.sql`：002 新增管理员会话及档案 revision，003 新增人物 revision，004 允许未知寻回日期为 NULL，均保留已有资料。已有部署按第 7.2 节先迁移再启动新后端，不要修改已应用的迁移文件。启动时和 `/ready` 同时检查 004 迁移记录及 recovered_at 实际可空性；缺少迁移会导致启动失败，运行中结构缺失或不可查询时 `/ready` 返回 503。

## 5. 部署验收

生产库上线前运行以下只读检查，发现已知示例或测试标记时以非零退出，不删除数据：

```sh
docker compose run --rm migrate psql -X -v ON_ERROR_STOP=1 -f /database/check_production.sql
```

新生产库保持 `SEED_DEMO=false`，通过后台录入真实资料。已有库改为 false 不会清除历史示例；纯演示库建议另建生产库，混合数据需备份后逐条核对处理，不要批量删除所有档案或将虚构记录改名冒充真实资料。检查仅识别仓库已知标记，通过后仍需人工复核内容。测试用 seed 和 smoke 不应在生产库运行。

默认地址如下，修改端口后相应调整：

| 地址 | 预期 |
| --- | --- |
| `http://127.0.0.1:3000/` | 公开首页 |
| `http://127.0.0.1:3000/midis` | 档案列表或正常空状态 |
| `http://localhost:3000/admin/login` | 管理员登录页；与默认 ADMIN_ORIGIN 一致 |
| `http://localhost:3000/admin` | 未登录转登录页，登录后显示工作台 |
| `http://localhost:3000/admin/midis` | 登录后显示后台档案表格与新增、编辑入口 |
| `http://localhost:3000/admin/modules` | 登录后显示模块目录 |
| `http://127.0.0.1:8080/health` | `{"status":"ok"}`，仅表示进程存活 |
| `http://127.0.0.1:8080/ready` | 200，确认数据库、作品/人物 revision、会话表及迁移 004 的实际结构 |
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

脚本假定至少存在三条示例及 `example-midi`，不能用于无 seed 的正式数据环境。除了检查 HTTP 状态，还需打开 `/midis` 和 `/admin` 确认实际数据显示；前端连接失败时可能呈现提示页，单独首页 200 不代表完整链路正常。

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
# 可选：已安装 Playwright 及对应浏览器；可加 --channel msedge 使用 Edge
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

采用可接受短暂停机的单机流程：

1. 记录旧提交、环境配置及镜像信息，按第 8 节备份。
2. 将部署代码更新到已经测试的目标提交；保留 `.env`、storage 和 Compose 项目标识。
3. 构建新镜像；构建失败时先修复，不继续切换。
4. 停止应用，执行数据库迁移，再启动新应用。

```sh
docker compose build
docker compose stop frontend backend
docker compose up -d --wait postgres
docker compose run --rm migrate
# 上一步退出码必须为 0；成功后再执行：
docker compose up -d --wait --wait-timeout 180
```

最后按第 5 节验收。迁移脚本对已执行版本校验并跳过，不会重复 seed；已应用 SQL 文件不能直接改写。`docker compose restart` 不会重建镜像，也不会更新容器环境变量；修改源码或 `.env` 后应使用相应的 build / up 流程。

### 7.3 回退

应用回退前确认旧版本兼容现有 schema，再切换旧提交或保留的镜像重新部署。当前没有 down migration；回退代码不会回退数据库。若 schema 不兼容，应恢复匹配的数据库与文件备份，并明确备份时间之后的数据如何处理。不要用删除 volume 的方式冒充回滚。

## 8. 备份与恢复

以下为 Linux 服务器 Bash 示例。备份应存于仓库之外，再复制到独立存储。数据库、对象目录、部署提交号和受控保存的 `.env` 共同构成恢复资料。

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

`.env` 备份包含数据库密码与管理员密码哈希，应使用受控权限和备份加密。数据库归档也包含会话摘要；正式恢复时重新生成管理员密码哈希并更新配置，使备份中的旧会话失效。不要把整个 PostgreSQL 正在运行的数据目录当普通文件复制作为逻辑备份。

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

正式切换恢复数据时，先停止所有应用和写入程序，恢复匹配的 storage，检查 UID 10001 的目录权限，将 `.env` 中 `POSTGRES_DB` 与 `DATABASE_URL` 指向已恢复的库，选定兼容的代码版本，再运行迁移及启动验收。不要在共享正式数据库上运行演练写入或盲目切换。

## 9. 不使用 Docker 的原生运行

原生编译命令按平台见 [README 的 Local Development](README.md#local-development)。基本顺序不能省略：

1. 安装 Node 22.13+（22.x）、npm、C++20 编译器、CMake 3.24+、Conan 2、PostgreSQL 17 与 psql。
2. 创建数据库和用户，设置 libpq 连接变量，执行 `sh database/migrate.sh`；Windows 可用 Git Bash。
3. Conan 安装依赖，CMake configure / build / CTest。
4. 设置 DATABASE_URL、BACKEND_HOST、BACKEND_PORT、STORAGE_PATH，以及 ADMIN_USERNAME、ADMIN_PASSWORD_HASH，运行后端可执行程序。
5. 在 frontend 目录配置 BACKEND_API_URL、ADMIN_ORIGIN、ADMIN_COOKIE_SECURE；开发使用 `.env.local`，生产使用 `.env.production.local`，然后构建并运行前端。

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
| Backend 启动失败或 /ready 503 | 查看 backend、migrate、postgres 日志；核对 URI、密码、表是否迁移，以及是否混用了容器 localhost |
| 改密码后仍无法连接 | PostgreSQL 初始化变量只用于首次初始化；已有库需要实际修改数据库角色密码，再同步 URI |
| migrate Exited (0) | 正常的一次性任务结束，不要手工强制保持运行 |
| migrate 非零退出 / checksum changed | 找出失败 SQL；恢复被改写的历史 migration，以新文件表达变更，不跳过失败或删迁移历史 |
| storage Permission denied | 检查宿主挂载目录及 UID 10001 的访问权限，不使用全员可写作为常规修复 |
| 首页可开，列表提示不可用 | 首页成功不代表 API 可用；检查 BACKEND_API_URL 与 /ready |
| /admin 404 或页面仍为旧版 | 确认请求到本项目进程；重建前端并重建容器，原生模式重新 build、重启 |
| 管理员账号尚未配置 / ADMIN_DISABLED | 为后端配置非空 ADMIN_USERNAME 和生成器输出的 ADMIN_PASSWORD_HASH；重建容器或重启原生进程 |
| 管理员配置无效导致后端退出 | 检查是否误填明文密码、哈希是否完整、用户名是否超过 100 UTF-8 字节 |
| 请求来源与后台配置不一致 | ADMIN_ORIGIN 必须精确匹配浏览器协议、主机和端口，无末尾斜杠；检查反向代理转发的 Host |
| 登录成功后仍返回登录页 | 检查 Cookie 是否写入及发送；本机 HTTP 使用 false，正式 HTTPS 使用 true；核对新旧后端实例的凭据是否一致 |
| 登录尝试过多 / 429 | 等当前一分钟窗口结束；单进程计数包含成功登录，自动测试也会消耗次数 |
| 编辑提示版本冲突 | 保留当前输入，重新打开编辑页获得新版本后合并修改；不能直接重复提交旧 revision |
| 修改 slug 后旧链接 404 | 当前无 slug 历史与重定向，使用保存后的公开链接并更新引用 |
| 没有档案 / example-midi 404 | SEED_DEMO=false 的空库正常；不要为通过演示测试向正式库注入示例 |
| 修改环境后没生效 | 使用 compose up 重建对应容器；仅 restart 不更新容器环境 |
| Conan 下载或 TLS 验证失败 | 检查网络、代理及受信任证书配置，不通过关闭 TLS 验证解决 |
| C++ 构建资源不足 | 给 Docker 增加可用资源并检查磁盘；首次依赖构建可能比应用编译更耗时 |

## 11. 验证记录与文档维护

当前支持前端独立部署到 Vercel，同时保留 Compose 整栈模式。2026-09-15 放弃的是“将数据库、迁移和持久存储一起搬到 Vercel”的整站方案，不是前端部署；配置方法与边界见 [Vercel 部署指引](docs/vercel-assessment.md)。

本手册根据当前 Dockerfile、Compose、配置读取逻辑和迁移脚本核对。用户已确认此前整站部署验收完成；此确认属于基础站点阶段，不自动覆盖本次新增的管理员认证和档案写入。代理实际执行的编译与检查、本次后台运行验证的限制见 [Implementation Report](docs/implementation-report.md)。备份恢复仍需在目标环境单独演练并记录结果。

每次修改端口、存储挂载、环境变量、migration 策略、权限模型或构建路径时，同步更新本文件。发布记录至少保存提交号、部署时间、迁移结果、验收结果及备份位置；不记录明文密码。
