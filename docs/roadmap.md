# 开发路线与验收范围

## 已实现

- 基础站点、公开 MIDI 与人物详情、来源及寻回记录展示、数据库迁移和 Docker Compose 部署。
- 统一后台、单管理员认证、MIDI 基本信息新增与编辑、会话撤销和版本冲突保护。
- 人物资料与历史昵称新增、编辑；作品署名的添加、角色调整与移除。保存立即公开，人物不是登录账号。
- 历史来源与寻回记录逐条新增、编辑、删除，保留记录编号和寻回记录创建时间；保存立即同步公开详情。
- 来源网址、完整 UTC 时间和人物关联校验；未知日期及人物使用空值，不自动更改归档状态或署名。
- 前端在同一 Git 仓库内独立安装、构建和部署，可用 Vercel；后端及数据库单独运行。
- 一次性 `/install`：后端安装令牌授权、站点名称与简介、数据库单管理员及持久安装锁，兼容已有环境管理员；前端仅生成三项连接/来源/Cookie 变量文本，Vercel 用户自行保存项目变量并重部署，不自动写 env 或调用 Vercel API。已通过本地安装、旧环境升级兼容及故障处理回归；部署验证范围见下文。

## 下一步：私有 MIDI 导入已在本地实现，待真实桶验证

- 已有管理员单文件导入实现：SMF 0/1/2、单个 `.mid` / `.midi`、最大 1 MiB，须确认私有归档权利；默认 `MIDI_IMPORT_ENABLED=false`。不是公开上传、下载或试听，不提供对象 URL，不自动修改版权、分发许可或归档状态。
- `GET/POST /api/v1/admin/midis/{id}/files` 使用管理员 Bearer；相同档案相同 SHA-256 幂等，跨档案返回 `409 FILE_OWNERSHIP_CONFLICT`，新文件登记与父 revision 递增原子提交。HTTP 使用 `MidiImportService`，不是旧内部 `MidiFileService`。
- 已接入 local / S3 存储选择、先写 journal 再写对象及同 digest advisory lock。显式 `lostmidi_api --cleanup-imports` 仅处理超过 24 小时且无引用的 journal，每次最多 100 条，不列桶、不扫目录；必须匹配原数据库与存储 backend/bucket/prefix，不能拿生产执行做测试。
- **本地验证通过**：50 项后端测试，含隔离 PostgreSQL 的幂等、归属冲突、连续并发重试、SQL/提交失败回滚及安全清理；迁移重复执行、HTTP 导入/禁用检查、前端 lint/类型检查/生产构建、浏览器文件保留与版本冲突恢复、桌面/手机布局均通过。
- **待验证**：已有桶的真实名称、认证、私有策略、条件 PUT / Range GET 等 S3 兼容性。本地测试使用独立对象目录，并非真实桶联调。`S3_PRIVATE_CONFIRMED=true` 只是人工确认，不校验权限；PUT private ACL 不能覆盖公共桶策略。未验证前保持导入关闭，不复用已暴露旧密钥。

来源与寻回仍只维护已掌握的历史信息；没有自动抓取 URL、生成 Wayback capture 或证据文件上传。多用户贡献、审核、搜索与社区按实际需求推进。

## 本轮升级与验证

生产已运行于独立 Vercel 后端容器项目 + Neon Free，数据库上次迁移到 005；当前代码尚未发布，`006_midi_import_journal.sql` 尚未在生产执行。新版启动及 `/ready` 还会检查 006 journal 和私有归档确认字段，**即使关闭导入也须先迁移**。已有库先备份，使用现有幂等 `database/migrate.sh` 执行全部待应用迁移至 006，再更新应用；不要修改旧迁移或使用要求空库的 `.tools` 临时脚本。005 安装锁与已有数据保留；旧环境管理员首次升级时仍须保留完整凭据直到 legacy 标记持久化，见 [RUN.md](../RUN.md)。

本轮完成本地代码、配置与上述验证，不代表真实桶联调、云构建或部署验收通过。前端继续使用 Root Directory=`frontend`，后端使用根 `vercel.backend.json`，旧 VPS / Compose 方案仍可用。保持 2 个连接 / 2 个 worker、Preview 隔离和少量按需验收，避免反复云构建消耗额度。

安装不创建数据库、不自动迁移或 seed，不提供重装/reset、设置编辑或密码重置页。安装功能边界见 [Admin 文档](admin.md)，历史本地验收记录见 [Implementation Report](implementation-report.md)，不是本轮导入验收证明。自动化写入检查只在专用测试库执行；两种安装 smoke 必须分别使用全新、已迁移的独立专用测试库，会永久安装，不能顺序指向同库。
