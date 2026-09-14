# 0004 — Separate Next.js and backend

## Status
Accepted

## Context
界面需要良好的服务端渲染能力，业务规则需要集中在可独立测试的 C++ 后端。

## Decision
Next.js App Router 负责页面和渲染，通过服务端 API 层访问 Drogon REST API。Next.js 不连接 PostgreSQL，后端 URL 不暴露为 NEXT_PUBLIC 环境变量。

## Alternatives
Next.js 直接读取数据库会产生两处业务入口；单页应用会把当前不必要的数据加载状态和浏览器交互推给客户端。

## Consequences
大部分页面使用 Server Components，构建无需运行数据库。服务端 API 调用需要超时和错误状态。两端通过文档化 JSON 合约同步演进。
