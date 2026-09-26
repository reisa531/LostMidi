# 当前工作区发布验收清单

本清单适用于包含 `021_midi_slug_history.sql` 的版本。先核对线上实际版本；历史部署记录不能代替检查。

1. 核对工作区差异与更新日志，确认 `frontend/package.json` 版本和 `frontend/src/lib/changelog.json` 的最新版本一致；运行 `node --test scripts/release-check.test.mjs`。
2. 在隔离数据库完成备份恢复演练，再备份生产 PostgreSQL 和文件对象存储。不要把生产数据用于自动化写入测试。
3. 检查生产 `schema_migrations`；使用 `database/migrate.sh` 应用所有待执行迁移至 `021_midi_slug_history.sql`，确认 017–021 均已登记。不要修改已应用迁移文件。
4. 更新后端，确认 `/ready` 成功且自定义来源类型可以创建、读取、修改。再更新前端。
5. 运行 `npm --prefix frontend run check`、后端构建和 CTest；数据库集成用例只在已迁移的隔离测试库运行，跳过时必须单独记录。
6. 在桌面与手机宽度验收搜索独立分页、图谱跨页选中、审核差异预览、人物旧字段保留、全屏 Markdown 焦点循环与预览，以及历史来源 Markdown 展示。
7. 验收文章草稿不公开、发布后与 MIDI/人物的双向链接，以及站内搜索不返回文章。
8. 确认公开详情、下载许可、管理员邀请与审核流程正常，再记录本次部署的版本、迁移范围和验证结果。
