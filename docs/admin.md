# Admin 平台

统一入口为 `/admin`，支持登录、退出、会话验证，以及 MIDI 和人物的新增、编辑、回收站恢复和操作审计。新站通过 `/install` 初始化超级管理员，之后可邀请多位后台账号。访问者不创建账号，只能浏览公开内容。管理员提交的所有内容修改、删除、恢复、来源/寻回、证据和 MIDI 文件导入都会进入 `/admin/changes`，由超级管理员批准后执行；拒绝、过期版本和失败申请会保留审核状态。

## 当前页面

| 路径 | 用途 |
| --- | --- |
| `/install` | 一次性站点与管理员初始化；已安装仅显示锁定，不提供重装、设置编辑或密码重置 |
| `/admin/login` | 管理员登录，无公开注册 |
| `/admin` | 待完善记录、最近修改与快捷新增，不展示连接状态或管理功能目录 |
| `/admin/midis` | 档案分页表格、新增入口、编辑及公开详情链接，显示删除完成提示 |
| `/admin/midis/new` | 新增基本信息，可选同页上传一个 MIDI 文件 |
| `/admin/midis/[id]/edit` | 编辑基本信息、查看公开详情，底部独立删除确认区 |
| `/admin/midis/[id]/credits` | 添加、调整或移除作品署名 |
| `/admin/midis/[id]/history` | 逐条新增、编辑、删除历史来源与寻回记录 |
| `/admin/midis/[id]/files` | 管理员单文件导入及文件元数据 |
| `/admin/people` | 人物分页列表、创建和编辑入口，显示删除完成提示 |
| `/admin/people/new` | 创建人物及历史昵称 |
| `/admin/people/[id]/edit` | 编辑人物资料和昵称，底部独立删除确认区 |
| `/admin/trash` | 查看并恢复软删除的 MIDI 与人物，查看最近 50 条删除/恢复审计记录 |

人物管理、作品署名、来源与寻回已开放；作品相关维护从编辑页进入。数据不可用时显示未知状态，不显示假的统计数字。

## 结构与扩展

- `app/layout.tsx` 保留全局 HTML、样式和元数据；数据库站点名称用于页眉、页脚及标题，简介用于 meta description。
- `app/(site)/layout.tsx` 保留公开站点的页眉页脚，并在请求时检查安装状态；route group 不改变原有 URL。
- `app/admin/layout.tsx` 在请求时检查安装状态并设置后台索引元数据；`app/admin/(workspace)/layout.tsx` 验证会话并提供侧栏、移动端导航、顶栏和退出入口。
- `app/install/`、`components/install/` 与 `lib/install/` 承担一次性安装和前端配置文本生成；没有 Next.js 数据库访问或部署平台写入。
- `lib/admin/auth.ts` 仅在服务端读取 Cookie、验证会话并调用 API；`actions.ts` 执行来源检查及登录、退出、保存操作。
- `lib/admin/modules.ts` 集中定义模块名称、路径和开放状态，并生成导航。
- `components/admin/ui.tsx` 提供页面标题、内容面板和不可用提示。
- `components/admin/navigation.tsx` 仅负责当前路径高亮；页面与数据请求使用 Server Components。
- 后台复用 `lib/api` 中的服务端 API 客户端，业务数据仍来自 C++ Backend。

添加模块时，在 `app/admin/(workspace)/<module>/page.tsx` 实现页面并显式验证会话，复用 AdminPageHeader / AdminPanel，再更新 modules.ts。对应 C++ API 必须独立授权，业务规则放在 Service 中；Next.js 不直接连接数据库。只有实现可用的功能才开放入口。

## 访问边界

超级管理员凭据来自安装账号或完整有效的环境覆盖；其他后台账号由超级管理员邀请，没有公开注册：

- **数据库安装**：新站保持后端 `ADMIN_PASSWORD_HASH` 为空，经 `/install` 创建首位超级管理员；`site_installation` 保存兼容账号和站点设置，`admin_users` 保存用户名、角色及随机盐 PBKDF2-HMAC-SHA256（600,000 次）哈希，不保存明文密码。
- **环境兼容/应急覆盖**：完整有效的 `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` 始终优先；哈希用 `python scripts/admin_password.py` 生成，环境用户名沿用最多 100 UTF-8 字节的旧规则，不套用安装用户名的新规则。非法非空哈希使后端启动失败。没有完整环境覆盖时读取数据库管理员；默认 `ADMIN_USERNAME=admin` 与空哈希不会遮盖数据库账号，没有任一可用来源才禁用登录。

旧环境部署第一次运行新版必须保留完整有效凭据，启动成功写入 `auth_source=environment` 的持久标记，`username` / `password_hash` 两列为 NULL，不复制环境哈希。移除环境凭据后仍为 installed，但登录禁用；必须恢复凭据或由维护者应急覆盖，不能删表重装。升级前先移除凭据时系统无法推断曾安装。环境覆盖数据库账号不修改数据库站点设置或账号。

后台身份分为 `super_admin`、`admin` 和访问者（不建账号）。两种后台角色都能维护档案；只有超级管理员能邀请、提权、降权或停用账号，且系统阻止停用最后一位有效超级管理员。邀请令牌随机生成、数据库只保存摘要、48 小时过期并且只能使用一次；超级管理员需安全地将令牌交给受邀者。环境管理员始终作为超级管理员。Next.js 服务端将会话令牌存入 HttpOnly、SameSite=Strict、Path=/admin Cookie，不传给客户端组件或 localStorage。生产 HTTPS 使用 `ADMIN_COOKIE_SECURE=true`；本机 HTTP 才设置 false。后台调用 C++ 时使用 Bearer 头，每次受保护请求均校验当前账号状态和角色。公开查询无需登录。`noindex` 仅控制索引。

无完整环境覆盖时，每次登录与鉴权重新读取数据库凭据；当前选用的用户名与哈希决定会话 identity。会话固定有效 8 小时，不自动续期；`admin_sessions` 仅保存令牌 SHA-256 摘要、凭据标识和有效期。切换凭据时不匹配的 session 被拒绝，但恢复旧凭据可能让未过期的旧 session 再次匹配，不能称为永久撤销。退出撤销当前令牌，其他浏览器会话保留；退出失败显示错误并保留 Cookie 以便重试。单后端进程每分钟最多接受 10 次登录尝试（包含成功登录），超限返回 429，计数不跨实例共享，且与安装限流分开。

忘记密码可按 [RUN.md](../RUN.md) 用 `scripts/admin_password.py` 生成新的环境应急覆盖；保持覆盖直到维护者妥善维护数据库凭据，没有自动永久重置。生产数据库备份现含数据库管理员哈希和会话摘要，应与环境哈希一起受保护；恢复时明确撤销历史 sessions 或使用新凭据，并防止重新启用旧会话。

所有管理及安装表单要求 Origin 精确等于 `ADMIN_ORIGIN`，另受 Next.js Server Actions 来源检查保护。配置含协议、主机和非默认端口，不带路径或末尾斜杠；反向代理需正确保留 Host。`localhost` 与 `127.0.0.1` 是不同来源。

## 一次性安装 API 与页面

部署者先准备数据库连接并执行全部迁移至 `015_content_reviews.sql`；安装表由 005 引入，但当前应用还要求后续迁移。安装页不创建数据库、不自动迁移或 seed。后端 `INSTALLATION_TOKEN` 为空时禁用新安装；非空必须匹配 `[A-Za-z0-9_-]{32,128}`，可用 `python -c "import secrets; print(secrets.token_urlsafe(32))"` 生成。令牌只配置在后端，不得放入 `NEXT_PUBLIC_`、URL 或前端环境变量，也不是管理员会话令牌。

公开站点 `/(site)` 与 `/admin` 父 layout 在请求时检查安装状态。缺少后端配置或明确 `installed=false` 才跳 `/install`；旧后端 404、非法响应或离线仅显示不可用，不开放安装。构建可不连接后端，运行必须有可用 API。已安装的 `/install` 仅显示锁定；数据库保存的站点名称用于页眉、页脚与标题，简介用于 meta description。

前端配置表单只生成 `BACKEND_API_URL` / `ADMIN_ORIGIN` / `ADMIN_COOKIE_SECURE` 变量文本，用户自行保存 Vercel 项目变量并重新部署；不写 `.env`，不调用 Vercel API。生成 URL 文本不探测用户输入地址，诊断仅使用已部署环境目标，不提供 SSRF 探针。连接就绪后，安装表单填写站点名称、简介、用户名、密码及确认密码和令牌；确认密码只用于前端一致性校验，成功不自动登录。

| 方法与路径 | 授权与响应 |
| --- | --- |
| `GET /api/v1/installation` | 公开、`Cache-Control: no-store`；仅返回 `{installed: boolean, installation_enabled: boolean, site: {name, description}}`，不返回令牌、用户名、密码哈希等秘密 |
| `POST /api/v1/installation` | 使用 `X-Installation-Token` 头；JSON 仅接受 `site_name`、`site_description`、`username`、`password`；成功 201，响应同 GET 形状，带 no-store |

`installed` 表示持久安装状态；`installation_enabled` 仅在未安装且后端令牌已启用时为 true。成功响应为 `installed=true`、`installation_enabled=false`，并返回持久化的公开站点名称和简介。

| 安装字段 | 规则 |
| --- | --- |
| `site_name` | 字符串，trim 后 1–200 UTF-8 字节 |
| `site_description` | 字符串，trim 后 0–1000 UTF-8 字节 |
| `username` | ASCII `[A-Za-z0-9_.-]{3,64}`，不 trim |
| `password` | 12–1024 UTF-8 字节，不 trim |

拒绝 NUL、未知字段和非法类型；安装令牌不放在 JSON 中，确认密码不是 API 字段。

| 状态 | 错误码 / 处理 |
| --- | --- |
| 400 | `INVALID_INPUT` |
| 403 | `INSTALLATION_DISABLED` / `INVALID_INSTALLATION_TOKEN` |
| 409 | `ALREADY_INSTALLED` |
| 429 | `INSTALLATION_RATE_LIMITED`；每进程每分钟 10 次安装尝试，与登录额度分开，不跨实例共享 |
| 503 | 数据库失败；必须显示不可用，不能当作未安装 |

站点设置与管理员在同一事务写入 `site_installation(id=1)`，主键保证并发只有一个安装成功，等待 commit 确认后返回。超时后刷新 GET 或页面核对，不能假定回滚。成功后可移除令牌并重启后端，持久锁仍有效；无重装/reset 接口，也没有设置编辑或密码重置页，不得删除安装表/记录来恢复账号。

## API 与写入规则

| 方法与路径 | 行为 |
| --- | --- |
| `POST /api/v1/admin/login` | JSON username/password；返回 token、username、expires_in |
| `GET /api/v1/admin/session` | 验证 Bearer 会话，返回 username、role、user_id 和 MIDI 导入开关 |
| `GET /api/v1/admin/users` | 仅超级管理员可读账号清单，不含密码与令牌 |
| `POST /api/v1/admin/users` | 仅超级管理员可邀请账号，接受 username / role，返回一次性 48 小时邀请令牌 |
| `PUT /api/v1/admin/users/:id` | 仅超级管理员可调整角色或停用账号；不能停用最后一位有效超级管理员 |
| `POST /api/v1/admin/invitations/accept` | 公开的一次性邀请接受端点；需要 64 位十六进制令牌和至少 12 字符密码 |
| `POST /api/v1/admin/logout` | 撤销当前 Bearer 会话 |
| `POST /api/v1/admin/midis` | 新增；成功返回 201 和档案对象 |
| `GET /api/v1/admin/midis/:id` | 读取编辑数据和 revision |
| `PUT /api/v1/admin/midis/:id` | 根据 revision 更新，返回新档案对象 |
| `DELETE /api/v1/admin/midis/:id` | 按 revision 将档案移入回收站，返回 `{deleted_id}`；所属元数据和文件保留 |
| `GET /api/v1/admin/people` | 分页人物列表，支持 page / pageSize |
| `POST /api/v1/admin/people` | 新增人物和昵称，返回 201 |
| `GET /api/v1/admin/people/:id` | 读取人物、revision 及昵称 |
| `PUT /api/v1/admin/people/:id` | 按 revision 更新人物及完整昵称列表 |
| `DELETE /api/v1/admin/people/:id` | 按 revision 将人物移入回收站；仍被署名或寻回引用时拒绝 |
| `GET /api/v1/admin/trash` | 回收站分页列表及最近 50 条操作记录 |
| `POST /api/v1/admin/trash/:type/:id/restore` | 恢复软删除的 MIDI 或人物，并记录管理员和时间 |
| `GET /api/v1/admin/midis/:id/credits` | 读取作品 revision 和署名列表 |
| `PUT /api/v1/admin/midis/:id/credits` | 按作品 revision 替换完整署名列表 |
| `GET /api/v1/admin/midis/:id/history` | 同一事务读取作品摘要、revision、来源及寻回记录 |
| `POST /api/v1/admin/midis/:id/sources` | 创建一条来源，成功 201 |
| `PUT /api/v1/admin/midis/:id/sources/:sourceId` | 原位编辑来源，成功 200 |
| `DELETE /api/v1/admin/midis/:id/sources/:sourceId` | 删除本作品的一条来源，成功 200 JSON |
| `POST /api/v1/admin/midis/:id/recovery-events` | 创建一条寻回记录，成功 201 |
| `PUT /api/v1/admin/midis/:id/recovery-events/:eventId` | 原位编辑寻回记录，成功 200 |
| `DELETE /api/v1/admin/midis/:id/recovery-events/:eventId` | 删除本作品的一条寻回记录，成功 200 JSON |

档案与人物编辑页提供独立回收站确认区，显示名称与编号；先展开再明确勾选才可提交，取消不提交，操作不会保存上方未提交修改。提交中禁用重复操作，成功返回列表。回收站会保留记录、关系和 MIDI 对象，可在后台恢复。删除表单独立于编辑表单，刷新后的 revision 会重置旧确认。

`DELETE /api/v1/admin/midis/:id` 和 `DELETE /api/v1/admin/people/:id` 只接受 JSON `{revision}`，要求正整数版本，成功返回 200 `{deleted_id}`；缺失返回 404，旧版本返回 409 `STALE_ENTRY` / `STALE_PERSON`。人物仍被作品署名或寻回记录引用时返回 409 `PERSON_IN_USE`，必须先解除引用，不会静默抹去历史关联。MIDI 文件操作锁冲突返回 503 `SERVER_BUSY`，不等待反向锁顺序。

移入回收站后站内详情和下载立即下架，数据与外部对象保持原位；恢复后继续可用。被软删除 MIDI 的旧创建请求重放仍返回 410 `CREATION_DELETED`，不会重新建档。对象清理失败会保留 journal，并记录重试次数与通用错误码。

网络结果不确定时先核对列表，错误和确认选择保留；仅本次 DELETE 返回匹配资源的 `MIDI_NOT_FOUND` / `PERSON_NOT_FOUND` 才视为已删除，不能把任意 404 或鉴权失败当作成功。401 提供新页面登录；409 需刷新核对新版本后重新确认，不能盲目重试旧版本。

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

其他错误包括 `400 INVALID_INPUT`、`401 INVALID_CREDENTIALS/UNAUTHORIZED`、`404 MIDI_NOT_FOUND`、`429 LOGIN_RATE_LIMITED` 和 `503 ADMIN_DISABLED/DATABASE_UNAVAILABLE`。没有公开注册；管理员可提交所有内容变更、删除、恢复、MIDI 导入及来源、寻回和证据申请，由超级管理员批准后执行。访客通过公开详情下载获准文件，不提供试听。历史来源与寻回记录支持逐条删除。

## 人物与署名规则

人物请求包含 `display_name`（必填，去首尾 ASCII 空白后最多 300 UTF-8 字节）、`biography`（可空，最多 20,000 字节）和 `aliases` 数组（必填，可空，最多 50 个，每个去空白后非空且最多 300 字节）。昵称不能重复，保留大小写；不同人物可同名。更新额外提交正整数 `revision`。响应为 `{person, aliases}`；旧版本返回 `409 STALE_PERSON`。

署名请求为 `{revision, credits: [{person_id: "123", role: "composer"}]}`，最多 100 项；角色为 composer、arranger、sequencer、contributor。人物 ID 使用十进制字符串。同一人物可承担多个角色，但不能重复相同人物与角色。空列表表示移除全部署名。响应为 `{revision, credits}`，每项包含人物名称。未知人物返回 `400 UNKNOWN_PERSON`，所有变更与作品版本一起回滚。

人物编辑在一个事务内保存简介和昵称；署名编辑在一个事务内更新作品版本和完整署名列表。基本信息、署名、来源及寻回共用作品版本，因此另一个页面保存后，旧表单会返回 `409 STALE_ENTRY`。管理员的基本信息和署名申请在 `/admin/changes` 审批；旧 revision 申请会标记为过期，需重新提交。超级管理员保存立即在公开人物和作品详情生效。人物选项每次加载 100 条，可继续加载或创建人物后刷新；以编号区分同名人物。

## 历史来源与寻回规则

统一页 `/admin/midis/[id]/history` 每次只编辑一条记录。删除需二次确认，取消删除保留输入；保存后重新读取作品版本。失败保留字段，支持在新页面登录、核对并手动合并。超时不能证明事务未提交，重试新增前须先核对记录，避免重复创建。

管理 GET 返回 `{entry: {id, title, slug, revision}, historical_sources, recovery_events}`。来源的 POST/PUT 使用扁平请求 `{revision, website_name, original_url, first_seen_at, last_seen_at, wayback_url, notes, source_type, credibility, checked_at}`；寻回使用 `{revision, recovered_at, recovered_by, story, evidence}`。创建也必须携带当前作品 revision；PUT 的可空字段省略或 null 均清空。DELETE 仅接受 `{revision}`。来源可信度为 1–5 的人工整理评估，不是自动真实性评分；`checked_at` 记录完整 UTC 核验时间。

| 字段 | 规则 |
| --- | --- |
| website_name | 必填，去首尾 ASCII 空白后非空，最多 300 UTF-8 字节 |
| story | 必填，去首尾 ASCII 空白后非空，最多 20,000 UTF-8 字节 |
| notes / evidence | 可空，各最多 20,000 UTF-8 字节；evidence 是文字，不是来源编号或附件 |
| original_url / wayback_url | 可空，各最多 4,096 字节；严格 ASCII HTTP/HTTPS URI，必须有主机，禁止账户信息、空白、控制符、反斜杠；国际化域名使用 Punycode，非 ASCII 路径使用百分号编码；不会抓取网址 |
| first_seen_at / last_seen_at / recovered_at | 可空，仅完整 UTC `YYYY-MM-DDTHH:mm:ss[.1–6 位小数]Z`，有效日历，年份 1–9999；读写标准化为六位小数；来源首次时间不晚于最后时间 |
| recovered_by | 可空；已有的人物编号，JSON 十进制字符串，不是数字 |

来源类型为 `original_site`、`forum`、`mailing_list`、`archive`、`search_index`、`personal_collection` 或 `other`。来源与寻回记录都可上传最多 1 MiB 的 PDF、JPEG、PNG 或纯文本附件；数据库保存文件与 SHA-256。附件需管理员会话才能上传和下载，下载会重新核验摘要，并作为防嗅探附件响应。删除所属来源或寻回记录会级联删除附件。公开 API 不返回附件元数据、内容或摘要。

所有文字拒绝 NUL。未知日期不替换成当前时间，只有年份等不完整信息时将日期留空、在备注或证据中说明。浏览器时间控件按 UTC 使用，无本地时区转换；原有微秒值单独保留，控件显示毫秒，改动毫秒或清空重填会重置更细精度。寻回人支持分页、刷新，已有选中人物不因不在当前页而丢失。

写入响应分别为 `{revision, source}` / `{revision, event}`；删除返回 200 JSON `{revision, deleted_id}`。不接受 id、midi_id、created_at、recovered_by_name 等只读字段。编辑保留子记录编号和寻回创建时间，不更改其他子记录、署名、文件或归档状态；未知日期的寻回记录排列在已知日期之后，以编号稳定排序。

读取在同一事务锁定父作品版本并查询两组记录。写入先按 revision 更新父作品取得锁，再校验子记录归属、锁定关联人物并修改记录，提交成功才响应。旧版本返回 `409 STALE_ENTRY`；子记录不存在或属于另一作品返回 `404 SOURCE_NOT_FOUND` / `RECOVERY_EVENT_NOT_FOUND`；人物不存在返回 `400 UNKNOWN_PERSON`。失败时连同父作品 revision 一起回滚。

## 验证

数据库必须应用全部迁移至 `015_content_reviews.sql`，不能只更新前端。启动和 `/ready` 检查创建回执外键、回收站标记、审计表、清理重试列、历史证据、用户邀请、公开 UUID 和审核队列表；不修改已应用迁移。

安装 API 检查：`python scripts/installation_smoke.py --api <测试后端> --allow-install`，要求环境变量 `INSTALLATION_TEST_TOKEN` 与该后端令牌一致。浏览器检查：`python scripts/installation_browser_smoke.py --frontend <测试前端> --allow-install`，另需 `ADMIN_TEST_USERNAME` / `ADMIN_TEST_PASSWORD` 用于创建及登录新管理员，可加 `--channel msedge`、`--screenshots <目录>`，需 Playwright 及相应浏览器。两个脚本都会永久安装，必须各自使用独立、全新、已迁移的专用测试库，后端保持环境密码哈希为空；不能顺序指向同库，不得用于生产或已安装站点。

CTest 新增 installation 测试使用隔离 schema，测试数据库用户需有 CREATE SCHEMA 权限。`LOSTMIDI_TEST_DATABASE_URL` 仍指向已迁移且含 demo seed 的专用测试库，与上述永久安装 smoke 的两个新库分开准备。本地验收结果及尚未执行的部署检查见 [Implementation Report](implementation-report.md)。

在专用测试库运行 `python scripts/people_smoke.py --api http://127.0.0.1:8080 --allow-writes` 及 `python scripts/recovery_smoke.py --api http://127.0.0.1:8080 --allow-writes`。凭据使用 `ADMIN_TEST_USERNAME` / `ADMIN_TEST_PASSWORD`。脚本覆盖人物昵称、署名、来源寻回 CRUD、日期精度、空日期与人物、归属校验、并发版本与回滚，留下 people-check / recovery-check 前缀的测试资料。两者及浏览器验收应先于会触发登录限流的 admin_smoke 执行。

可选浏览器验收：在独立 Python 环境安装 `playwright` 并运行 `python -m playwright install chromium`，再使用相同测试凭据执行 `python scripts/admin_browser_smoke.py --frontend http://localhost:3000 --allow-writes`。也可传 `--channel msedge` 使用已安装的 Edge；`--screenshots <目录>` 保存验收截图。浏览器地址必须与测试前端的 ADMIN_ORIGIN 一致。脚本会创建人物和作品，只能指向专用测试环境。

当前工作区阶段 4–6 尚未发布。阶段 4 需要迁移至 012；后续账号与公开 ID 迁移版本以实际实现为准。届时运行前端 build、lint、typecheck，以及配置专用测试库后的 CTest。写入 smoke 和回收站恢复操作只允许在隔离测试数据库执行，不能在生产试删。浏览器验收见 [RUN.md](../RUN.md)，历史结果及本次未执行事项见 [验证记录](implementation-report.md)。


## 新建档案同页上传（2026-09-24）

`/admin/midis/new` 支持可选 MIDI 文件与资料一次保存。仅允许一个非空 `.mid` / `.midi`，最大 1 MiB，须确认公开分发权利。未选文件时可正常建档。`GET /api/v1/admin/session` 返回 `midi_import_enabled`；关闭导入时新建页隐藏文件输入，但后端仍独立验证开关。

`POST /api/v1/admin/midis` 在原资料字段外接受小写 UUID v4 的 `request_id`，及可选 `file: {filename, content_base64, rights_confirmed}`。附文件必须提供请求键，base64 必须为规范编码。成功或同内容重试均返回作品和 HTTP 201；更换内容复用已提交请求键返回 409。旧的无请求键纯资料请求仍兼容。

校验失败保留输入，可以修改后重提；服务端结果不明或响应丢失时锁定原提交并提供“重试本次提交”，避免重建档案。事务失败不保留半成品作品，潜在孤立对象由 journal 清理。上传不自动更改归档状态或分发许可。编辑页和独立文件管理页继续可用。
