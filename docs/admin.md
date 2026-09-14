# Admin 平台

入口为 `/admin`。当前建立统一的管理界面框架，展示现有公开数据，没有新增写接口。

## 当前页面

| 路径 | 用途 |
| --- | --- |
| `/admin` | 真实档案总数、查询连接状态、档案速览与模块入口 |
| `/admin/midis` | 只读档案表格、分页、公开详情链接 |
| `/admin/modules` | 模块目录，区分已开放与规划中的模块 |

人物管理、来源与寻回仅在模块配置中列为规划项，没有伪造可用按钮或空的管理路由。数据不可用时显示未知状态，不显示假的统计数字。

## 结构与扩展

- `app/layout.tsx` 仅保留全局 HTML、样式和元数据。
- `app/(site)/layout.tsx` 保留公开站点的页眉页脚；route group 不改变原有 URL。
- `app/admin/layout.tsx` 是后台共享布局，包含桌面侧栏、移动端横向导航、顶栏和主内容区域。
- `lib/admin/modules.ts` 集中定义模块名称、路径和开放状态，并生成导航。
- `components/admin/ui.tsx` 提供页面标题、内容面板和不可用提示。
- `components/admin/navigation.tsx` 仅负责当前路径高亮；页面与数据请求使用 Server Components。
- 后台复用 `lib/api` 中的服务端 API 客户端，业务数据仍来自 C++ Backend。

添加模块时，在 `app/admin/<module>/page.tsx` 实现页面，复用 AdminPageHeader / AdminPanel，再更新 modules.ts 的路径与状态。只有实现可用的功能才开放入口。复杂模块可在自身目录下增加 layout、子页或组件，无需修改整个后台外壳。

## 访问边界

当前后台是**未接入认证的只读开发预览**，只能读取与公开站点相同的数据。`robots: noindex` 只控制搜索索引，不提供访问控制。没有管理员账号、登录、角色授权、编辑、删除或审核功能。

加入非公开数据和写操作之前，必须先实现后端认证与权限校验，再接入前端登录态；不能依赖隐藏导航或 Next.js 页面判断作为授权。届时对应的数据规则、写入事务和审核逻辑仍应放在 C++ Service 中。

## 验证

运行 `npm run build`、`npm run lint`、`npm run typecheck`。后端在线后访问 `/admin` 和 `/admin/midis` 查看真实数据；后端离线时应显示不可用提示。公开站点 URL 保持不变。生产模式下修改代码后需要重新 build 并重启前端才能看到新页面。
