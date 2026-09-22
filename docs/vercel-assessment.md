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

Vercel 中的 `localhost`、`127.0.0.1` 或 `http://backend:8080` 不会指向你的服务器。应让 HTTPS 反向代理转发到后端，并保持 PostgreSQL 不对公网开放。管理员用户名和密码哈希、数据库连接串、`STORAGE_PATH` 仍只配置在后端；Vercel 不需要它们。浏览器不直接请求 C++ API，现有服务端转发模式无需为此放宽 CORS 或 Origin 校验。

首次部署前填写预期的前端域名。Vercel 项目名称不保证对应你预期的可用域名；部署分配域名后核对 `ADMIN_ORIGIN`，不一致时修改并重新部署，之后再使用后台。绑定或更换自定义域名也必须更新。未匹配的来源应被拒绝，不要用通配符绕过。

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

构建成功不等于 API 已连通。发布后应检查公开列表、真实档案详情、人物页及后台登录；首页 200 可能只是“档案暂时无法读取”的提示页，不能作为完整验收。后台写入、注销和来源校验仅在专用测试环境做自动化验收。

CI 的 `frontend` 作业会把前端复制到独立临时目录，在无根目录文件、无后端的条件下执行 `npm ci` 和 `npm run check`；`stack` 作业保留 Compose 整栈检查。提供配置不等于已完成远程 CI 或线上发布，实际执行记录见 [Implementation Report](implementation-report.md)。

## 历史：2026-09-15 的整站评估

当时的需求是评估整个应用在 Vercel 一键部署；由于现有 PostgreSQL 持久卷、迁移顺序和后端本地对象目录不能随一个前端按钮迁移，当轮继续使用 Compose。该结论针对“整站迁移”，不限制当前的“仅前端独立部署”。本次没有迁移后端运行时、数据库或对象存储。

## 官方参考

- [同仓库多项目与 Root Directory](https://vercel.com/docs/monorepos)
- [vercel.json 配置](https://vercel.com/docs/project-configuration/vercel-json)
- [Deploy Button 的克隆行为](https://vercel.com/docs/deploy-button/source)
- [Deploy Button 的 root-directory 参数](https://vercel.com/docs/deploy-button/build-settings)
- [Deploy Button 环境变量提示与默认值](https://vercel.com/docs/deploy-button/environment-variables)
