# Admin 平台

统一入口为 `/admin`，支持单管理员登录、退出、会话验证，以及 MIDI 基本信息新增和编辑。保存立即反映到公开站点，没有草稿或发布审核状态。

## 当前页面

| 路径 | 用途 |
| --- | --- |
| `/admin/login` | 管理员登录，无公开注册 |
| `/admin` | 真实档案总数、查询连接状态、档案速览与模块入口 |
| `/admin/midis` | 档案分页表格、新增入口、编辑及公开详情链接 |
| `/admin/midis/new` | 新增档案基本信息 |
| `/admin/midis/[id]/edit` | 编辑基本信息；保存后显示公开详情链接 |
| `/admin/modules` | 管理功能目录，仅展示可使用的功能 |

人物管理、来源与寻回仅在模块配置中保留规划项，不在生产页面展示占位卡片或空的管理路由。数据不可用时显示未知状态，不显示假的统计数字。

## 结构与扩展

- `app/layout.tsx` 仅保留全局 HTML、样式和元数据。
- `app/(site)/layout.tsx` 保留公开站点的页眉页脚；route group 不改变原有 URL。
- `app/admin/layout.tsx` 设置后台索引元数据；`app/admin/(workspace)/layout.tsx` 验证会话并提供侧栏、移动端导航、顶栏和退出入口。
- `lib/admin/auth.ts` 仅在服务端读取 Cookie、验证会话并调用 API；`actions.ts` 执行来源检查及登录、退出、保存操作。
- `lib/admin/modules.ts` 集中定义模块名称、路径和开放状态，并生成导航。
- `components/admin/ui.tsx` 提供页面标题、内容面板和不可用提示。
- `components/admin/navigation.tsx` 仅负责当前路径高亮；页面与数据请求使用 Server Components。
- 后台复用 `lib/api` 中的服务端 API 客户端，业务数据仍来自 C++ Backend。

添加模块时，在 `app/admin/(workspace)/<module>/page.tsx` 实现页面并显式验证会话，复用 AdminPageHeader / AdminPanel，再更新 modules.ts。对应 C++ API 必须独立授权，业务规则放在 Service 中；Next.js 不直接连接数据库。只有实现可用的功能才开放入口。

## 访问边界

按 [RUN.md](../RUN.md) 运行 `python scripts/admin_password.py`，将生成的随机盐 PBKDF2-HMAC-SHA256（600,000 次）哈希配置为后端的 `ADMIN_PASSWORD_HASH`，同时设置 `ADMIN_USERNAME`。没有预置密码；空用户名或空哈希禁用登录，非法非空哈希使后端启动失败。

Next.js 服务端将令牌存入 HttpOnly、SameSite=Strict、Path=/admin Cookie，不传给客户端组件或 localStorage。生产 HTTPS 使用 `ADMIN_COOKIE_SECURE=true`；本机 HTTP 才设置 false。后台调用 C++ 时使用 Bearer 头，每次受保护请求均校验会话。公开查询无需登录。`noindex` 仅控制索引。

会话固定有效 8 小时，不自动续期；数据库仅保存令牌 SHA-256 摘要、凭据标识和有效期。退出撤销当前令牌，其他浏览器会话保留；退出失败显示错误并保留 Cookie 以便重试。修改用户名或重新生成密码哈希并重启后端，旧凭据会话失效。单后端进程每分钟最多接受 10 次登录尝试（包含成功登录），超限返回 429，计数不跨实例共享。

所有管理表单要求 Origin 精确等于 `ADMIN_ORIGIN`，另受 Next.js Server Actions 来源检查保护。配置含协议、主机和非默认端口，不带路径或末尾斜杠；反向代理需正确保留 Host。`localhost` 与 `127.0.0.1` 是不同来源。

## API 与写入规则

| 方法与路径 | 行为 |
| --- | --- |
| `POST /api/v1/admin/login` | JSON username/password；返回 token、username、expires_in |
| `GET /api/v1/admin/session` | 验证 Bearer 会话，返回 username |
| `POST /api/v1/admin/logout` | 撤销当前 Bearer 会话 |
| `POST /api/v1/admin/midis` | 新增；成功返回 201 和档案对象 |
| `GET /api/v1/admin/midis/:id` | 读取编辑数据和 revision |
| `PUT /api/v1/admin/midis/:id` | 根据 revision 更新，返回新档案对象 |

除登录外均需要 Bearer 令牌。正常处理的管理响应带 `Cache-Control: no-store`。写入字段如下：

| 字段 | 规则 |
| --- | --- |
| title | 必填，去除首尾 ASCII 空白后非空，最多 300 UTF-8 字节 |
| slug | 必填，最多 160 字节；小写英文字母、数字及词间单个连字符 |
| description | 可空，最多 20,000 UTF-8 字节 |
| estimated_year | 可空，整数 1–9999 |
| archive_status | 必填：uncertain、lost、partially_recovered、archived |
| copyright_status | 必填：unknown、public_domain、licensed、copyrighted |
| distribution_permission | 必填：unknown、permission_granted、metadata_only、restricted |
| license、rights_holder | 各可空，最多 500 UTF-8 字节 |
| revision | 更新必填，使用读取时的正整数版本；创建由数据库设置为 1 |

PUT 替换上述基本信息，省略可空字段会清空该字段；人物署名、来源、寻回和文件不受影响。未知字段及非法类型会被拒绝。实体 id 在 API 中为十进制字符串，revision 为整数。

重复 slug 返回 `409 SLUG_CONFLICT`；旧 revision 返回 `409 STALE_ENTRY`，避免覆盖其他页面已保存的修改。表单失败后保留输入，可在新页面登录或重新打开编辑页并手动合并。修改 slug 后旧公开 URL 返回 404，目前没有历史地址重定向；归档和权利状态不控制元数据可见性。

其他错误包括 `400 INVALID_INPUT`、`401 INVALID_CREDENTIALS/UNAUTHORIZED`、`404 MIDI_NOT_FOUND`、`429 LOGIN_RATE_LIMITED` 和 `503 ADMIN_DISABLED/DATABASE_UNAVAILABLE`。没有注册、多角色、审核、删除或文件上传下载功能。

## 验证

运行前端 build、lint、typecheck，以及配置专用测试库后的 CTest。数据库需应用 `002_admin_sessions_and_revision.sql`。运行中的 API 可用 `python scripts/admin_smoke.py --allow-writes` 检查，通过 `ADMIN_TEST_USERNAME`、`ADMIN_TEST_PASSWORD` 提供测试凭据；脚本保留新增档案，只在专用测试数据库运行。浏览器验收见 [RUN.md](../RUN.md)，实际执行结果及限制见 [验证记录](implementation-report.md)。
