# Vercel 前端独立部署

当前方案（2026-09-22）：保留同一个 Git 仓库，`frontend/` 是可单独复制、安装、构建和部署的 Next.js 项目；后端、PostgreSQL、数据库迁移和文件存储仍独立运行。不是把整个 Compose 栈部署到 Vercel。

## 1. 直接关联当前仓库（维护者推荐）

在 [Vercel 新建项目](https://vercel.com/new) 中导入已有的 `reisa531/LostMidi` 仓库。无需新建前端 Git 仓库，也无需配置 npm workspace。

| 设置 | 值 |
| --- | --- |
| Production Branch | `main` |
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Node.js Version | 22.x，项目要求至少 22.13 |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | 保持 Next.js 默认值，不要填 `out` 或 `.next/standalone` |
| Include source files outside of the Root Directory | 不需要开启 |

`frontend/vercel.json` 声明框架与构建命令；Root Directory 是 Vercel 项目设置，不是该 JSON 的字段。首次完成关联后，后续 Git 推送可由 Vercel Git Integration 自动构建前端；实际触发行为以项目设置为准。

入口读取远程仓库，不会上传本地未提交的文件。先将本次改动提交、推送到要部署的分支；本文和本轮准备工作不代表已替你执行提交、推送或发布。

## 2. 一键创建副本并部署前端

[![Deploy frontend with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Freisa531%2FLostMidi&root-directory=frontend&env=BACKEND_API_URL%2CADMIN_ORIGIN%2CADMIN_COOKIE_SECURE&envDefaults=%7B%22ADMIN_COOKIE_SECURE%22%3A%22true%22%7D&envDescription=Use%20an%20HTTPS%20backend%20URL%20and%20the%20exact%20frontend%20HTTPS%20origin.%20See%20the%20deployment%20guide.&envLink=https%3A%2F%2Fgithub.com%2Freisa531%2FLostMidi%2Fblob%2Fmain%2Fdocs%2Fvercel-assessment.md)

这是 Vercel 标准 Deploy Button：会克隆仓库，预设 `root-directory=frontend`，并要求填写三项前端环境变量；其中安全 Cookie 默认是 `true`。副本内依然保留前后端目录，但此 Vercel 项目只部署前端。若要直接跟踪当前仓库，不要使用克隆按钮，使用上一节的导入流程。

“一键”是进入预配置的部署流程，不会代替准备 HTTPS 后端、登录 Vercel、授权 Git 或核对域名。标准按钮面向公开模板；私有仓库优先授权 Git Integration 后使用已有仓库导入。本轮未核实远程仓库的可见性，也未实际执行克隆部署。若从 fork 使用按钮，应将其 `repository-url` 和 `envLink` 换成自己的仓库地址。

## 3. 前端环境变量

以下变量在 Vercel Project Settings → Environment Variables 中设置；仅供服务端使用，不要添加 `NEXT_PUBLIC_` 前缀。参考 [`frontend/.env.production.example`](../frontend/.env.production.example)。

| 变量 | 生产示例 | 说明 |
| --- | --- | --- |
| `BACKEND_API_URL` | `https://api.example.com` | 已运行且从 Vercel 可访问的后端根地址，不包含 `/api/v1` |
| `ADMIN_ORIGIN` | `https://archive.example.com` | 浏览器实际访问前端的完整来源，不含路径或末尾斜杠 |
| `ADMIN_COOKIE_SECURE` | `true` | HTTPS 部署必须使用安全 Cookie |

Vercel 中的 `localhost`、`127.0.0.1` 或 `http://backend:8080` 不会指向你的服务器。应让 HTTPS 反向代理转发到后端，并保持 PostgreSQL 不对公网开放。环境管理员用户名和密码哈希、`INSTALLATION_TOKEN`、数据库连接串、`STORAGE_PATH` 只配置在后端，不能存入 Vercel 前端项目变量；新安装管理员则持久化在后端数据库。浏览器不直接请求 C++ API，现有服务端转发模式无需为此放宽 CORS 或 Origin 校验。

首次部署前填写预期的前端域名。Vercel 项目名称不保证对应你预期的可用域名；部署分配域名后核对 `ADMIN_ORIGIN`，不一致时修改并重新部署，之后再安装或使用后台。绑定或更换自定义域名也必须更新。未匹配的来源应被拒绝，不要用通配符绕过。

### `/install` 配置与一次性初始化

1. 部署者在后端准备数据库连接，应用全部迁移至 `005_site_installation.sql`，确认 `/ready` 可用。安装页不创建数据库、不自动迁移或 seed；005 只加安装表，不改旧迁移。
2. 新站保持后端 `ADMIN_PASSWORD_HASH` 为空，使用 `python -c "import secrets; print(secrets.token_urlsafe(32))"` 生成安装令牌，仅将其设为后端 `INSTALLATION_TOKEN`。空值禁用安装；非空必须匹配 `[A-Za-z0-9_-]{32,128}`。它不是 Vercel API token，不得放进 `NEXT_PUBLIC_`、URL、部署按钮参数或任何前端环境变量。
3. 前端缺少后端配置时可打开 `/install` 的配置表单，它**只能生成** `BACKEND_API_URL`、`ADMIN_ORIGIN`、`ADMIN_COOKIE_SECURE` 三项变量文本。用户自行复制到 Vercel Project Settings → Environment Variables，选择正确环境、保存并 **Redeploy**；仅在表单填值或仅保存项目变量不会更新已部署进程。页面不写 `.env`、不持久化平台配置、不调用 Vercel API。
4. URL 文本生成不会探测用户输入的地址；连接诊断只访问已部署环境中的 `BACKEND_API_URL`，不是任意地址的 SSRF 探针。若诊断仍指向旧地址，先检查变量作用环境与重新部署结果。
5. 重新部署后从精确匹配 `ADMIN_ORIGIN` 的域名访问 `/install`，填写站点名称、简介、用户名、密码和确认密码，并输入令牌。令牌仅作为本次安装提交的秘密，由前端服务端向后端发送 `X-Installation-Token`，不成为前端配置。成功不自动登录，请另行前往 `/admin/login`。
6. 安装成功可移除后端令牌并重启后端，数据库单行持久锁仍有效；已安装的 `/install` 只显示锁定。没有重装/reset、站点设置编辑或密码重置页。数据库中的名称用于页眉、页脚和标题，简介用于 meta description。

公开站点与 `/admin` 父 layout 在请求时判断安装状态：缺少后端配置或 API 明确返回 `installed=false` 才跳 `/install`；旧后端 404、非法响应、离线或数据库故障只显示不可用，不开放安装。数据库故障返回 503，不能当作新站。安装提交须等待 commit 确认；超时后刷新核对，不能假定回滚或删除锁重试。前端可在无后端时完成 build，但运行必须有可用 API。

已有环境管理员升级时，第一次运行新版须保留完整有效的 `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`，成功持久化 environment 标记后才能改配置。环境凭据优先但不修改数据库站点设置；移除 legacy 凭据不会重新开放安装，只会禁用登录，需恢复或提供维护者应急覆盖。密码恢复及历史会话处理见 [RUN.md](../RUN.md)。

Production 与 Preview 的环境变量应分开配置。默认将生产值仅用于 Production；需要后台预览验收时使用专用测试后端及固定的预览域名，并填写对应的精确 `ADMIN_ORIGIN`。随机预览域名不会自动获得生产后台操作权限，也不要让预览构建指向正式数据做写入测试。

不要在 Vercel 设置 `NEXT_OUTPUT_STANDALONE`：Vercel 使用 Next.js 原生构建，Dockerfile 才在构建时将其设为 `true`。本地复制目录部署时要排除真实 `.env*`、`.vercel/`、`node_modules/` 和 `.next/`；示例环境文件可保留。

## 4. 独立开发与 Docker

前端只需 Node.js 22.13+（22.x）及 npm；无需安装 C++、Conan、PostgreSQL 或读取仓库根目录 `.env`。以下命令在 `frontend/` 中执行：

```sh
cp .env.example .env.local
npm ci
npm run dev
```

后端 API 另外启动，并按实际地址修改 `.env.local`。只检查静态构建时不需要后端在线：

```sh
npm run check
npm run start
```

`check` 包含 lint、typecheck 和生产 build；`start` 使用已有构建，运行时仍需要可用的 API。独立原生生产主机请从 `.env.production.example` 配置 `.env.production.local`，不要把本机 HTTP 配置带到生产环境。

Dockerfile 也位于前端项目内，从仓库根目录构建：

```sh
docker build -t lostmidi-frontend ./frontend
```

容器启动时另外注入三项前端环境变量。原有 `docker compose up --build` 仍支持全栈联调，其前端 build context 已改成 `./frontend`。Vercel 模式下可按 [RUN.md](../RUN.md) 的分离部署说明仅运行后端相关服务，不必启动本机前端。

## 5. 验收与限制

构建成功不等于 API 已连通。发布后应检查安装状态、公开列表、真实档案详情、人物页及后台登录；首页 200 可能只是不可用提示页，不能作为完整验收。后台写入、注销和来源校验仅在专用测试环境做自动化验收。

安装 API smoke 使用 `python scripts/installation_smoke.py --api <测试后端> --allow-install`，要求 `INSTALLATION_TEST_TOKEN`；浏览器 smoke 使用 `python scripts/installation_browser_smoke.py --frontend <测试前端> --allow-install`，还要求 `ADMIN_TEST_USERNAME` / `ADMIN_TEST_PASSWORD`，可加 `--channel msedge`、`--screenshots <目录>`。两者都会永久安装，必须各用独立、全新、已迁移的专用测试库，不能顺序指向同一个库或生产后端。完整准备步骤见 [RUN.md](../RUN.md)。

CI 的 `frontend` 作业会把前端复制到独立临时目录，在无根目录文件、无后端的条件下执行 `npm ci` 和 `npm run check`；`stack` 作业保留 Compose 整栈检查。本地安装、前端独立构建及浏览器回归已通过；本轮未执行远程 GitHub Actions、Linux Docker 镜像及容器验收或 Vercel 发布。实际执行记录与限制见 [Implementation Report](implementation-report.md)。

## 历史：2026-09-15 的整站评估

当时的需求是评估整个应用在 Vercel 一键部署；由于现有 PostgreSQL 持久卷、迁移顺序和后端本地对象目录不能随一个前端按钮迁移，当轮继续使用 Compose。该结论针对“整站迁移”，不限制当前的“仅前端独立部署”。本次没有迁移后端运行时、数据库或对象存储。

## 官方参考

- [同仓库多项目与 Root Directory](https://vercel.com/docs/monorepos)
- [vercel.json 配置](https://vercel.com/docs/project-configuration/vercel-json)
- [Deploy Button 的克隆行为](https://vercel.com/docs/deploy-button/source)
- [Deploy Button 的 root-directory 参数](https://vercel.com/docs/deploy-button/build-settings)
- [Deploy Button 环境变量提示与默认值](https://vercel.com/docs/deploy-button/environment-variables)
