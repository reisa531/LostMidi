# 生产准备：逐文件需求清单

本次提交包含之前尚未提交的后台收尾修改，以及生产准备调整。需求编号：

- R0：承接前次要求，完成管理员认证、MIDI 基本信息维护及验证。
- R1：将网站文案与部署默认值调整为生产用途，区分测试数据。
- R2：评估 Vercel 整站一键部署，不满足当前架构时放弃。
- R3：完成 Git Commit，并为每个修改文件注明对应需求。

| 文件 | 需求 | 实现内容 |
| --- | --- | --- |
| `.env.example` | R1 | 默认关闭示例数据，测试环境显式开启 |
| `.env.production.example` | R1 | 无预置密码的生产模板，关闭 seed，默认安全 Cookie |
| `.github/workflows/ci.yml` | R0、R1 | 管理员 smoke、临时凭据屏蔽，CI 显式启用测试 seed |
| `README.md` | R0、R1、R2 | 同步认证、写入测试、默认空库与部署评估入口 |
| `RUN.md` | R0、R1、R2 | 管理员配置、迁移、生产模板、只读数据检查及部署边界 |
| `backend/src/auth/AuthService.cpp` | R0 | 登录限流计数达到阈值后不再递增 |
| `backend/src/common/ApiController.cpp` | R0 | 就绪检查包含会话表与档案 revision |
| `backend/src/main.cpp` | R0 | 启动时确认管理员功能所需数据库结构 |
| `backend/src/midi/PostgresMidiRepository.cpp` | R0 | 兼容驱动通用异常，将确认的 slug 冲突转换为 409 |
| `backend/tests/repository_integration_test.cpp` | R0 | 真实数据库验证认证生命周期及档案保存冲突 |
| `database/tests/constraints.sql` | R0 | 验证会话摘要格式、revision 初始值及递增 |
| `database/check_production.sql` | R1 | 只读识别已知演示或测试记录，不删除数据 |
| `docs/admin.md` | R0、R1 | 后台认证与写入合约，生产界面只展示可用功能 |
| `docs/database.md` | R0、R1 | 说明会话、revision、默认无 seed 和上线前检查 |
| `docs/implementation-report.md` | R0、R1、R2、R3 | 记录实际验证结果、限制及需求清单入口 |
| `docs/vercel-assessment.md` | R2 | 引用官方能力与存储限制，说明放弃整栈一键适配的依据 |
| `docs/releases/2026-09-15-production.md` | R3 | 逐文件需求对应与提交范围 |
| `frontend/src/app/(site)/about/page.tsx` | R1 | 用档案阅读说明替换虚构开发示例声明 |
| `frontend/src/app/(site)/layout.tsx` | R1 | 生产页脚替换示例档案标语 |
| `frontend/src/app/(site)/midis/[slug]/page.tsx` | R1 | 公开详情显示中文版权与分发状态 |
| `frontend/src/app/(site)/midis/page.tsx` | R1 | 修正未知年代与推测年份的展示文字 |
| `frontend/src/app/admin/(workspace)/layout.tsx` | R0、R1 | 接入可反馈错误的退出表单，移除基础框架标签 |
| `frontend/src/app/admin/(workspace)/modules/page.tsx` | R0、R1 | 清除只读旧标签与规划占位卡，仅展示已实现功能 |
| `frontend/src/app/admin/(workspace)/page.tsx` | R1 | 用资料维护说明替换平台建设文案 |
| `frontend/src/components/admin/login-form.tsx` | R0 | 登录失败保留用户名 |
| `frontend/src/components/admin/logout-form.tsx` | R0 | 退出等待与错误反馈 |
| `frontend/src/components/admin/midi-form.tsx` | R0 | 明示保存后资料立即公开 |
| `frontend/src/components/admin/ui.tsx` | R1 | 将内部后端提示改为可操作的服务异常提示 |
| `frontend/src/components/archive.tsx` | R1 | 中文版权与分发状态映射，未知值保留未确认语义 |
| `frontend/src/lib/admin/actions.ts` | R0 | 注销失败保留会话并返回可读错误 |
| `frontend/src/lib/admin/modules.ts` | R0、R1 | 同步已实现的资料维护功能及导航名称 |
| `scripts/admin_smoke.py` | R0 | 增加并发版本冲突、失败不改数据和 no-store 检查 |

验证：前端 lint、类型检查、生产构建通过；前次后台 17/17 测试通过，之后后端代码未改变。Compose 开发与生产模板检查通过；生产数据检查验证了拒绝示例和接受无示例数据两条路径。HTTP/浏览器整栈未在本轮运行，未部署至 Vercel，未删除任何已有档案。详细限制见 implementation-report.md。

测试夹具保留在 database/seeds 和 tests 中，不将虚构故事改名伪装为真实资料。已有数据库关闭 seed 不会自动清理历史数据，应按 RUN.md 检查并人工复核。
