# 架构总览

> 最后更新：2026-09-25（重构启动时）

## 项目定位

Cline2API 是一个"中转站"式反向代理：下游统一暴露 OpenAI / Anthropic / Responses 三种协议的本地 API，上游把请求转发给 Cline 账号池、opencode Zen 免费通道、以及自定义第三方 Provider，并提供内嵌管理后台。

## 现状（重构前）

- 单 `package main` 平铺在仓库根目录（30+ Go 文件，约 1.6 万行），Go 1.25，几乎零第三方依赖（utls / wails / x/net）
- 管理后台是 `admin_html.go` 里一个 2739 行的 Go 字符串（手写内联 HTML/CSS/JS），中文为源语言，客户端侧英文映射
- 状态全部是包级全局变量 + JSON 文件持久化（`.cline-accounts.json` 等），无数据库
- 请求日志 JSON 文件，上限 5000 条 / 30 天，无时间聚合；zen / provider 的用量被丢弃
- 桌面端为 Wails v2 单文件（`desktop` build tag），WebView 加载 `http://127.0.0.1:3457/admin/`

## 目标结构（重构后）

```
cline2api/
├── cmd/
│   ├── cline-proxy/            # CLI 入口
│   └── cline-proxy-desktop/    # 桌面入口（原 desktop build tag 文件）
├── internal/
│   ├── types/                  # 共享类型（Account/Model/RequestLog...）
│   ├── pool/                   # 账号池、数据文件定位、持久化
│   ├── cline/                  # Cline 上游（auth/models_sync/egress proxy/capture）
│   ├── zen/                    # opencode zen 上游
│   ├── providers/              # 自定义提供商（通用中转）
│   ├── relay/                  # HTTP 服务、协议转换、SSE
│   ├── admin/                  # 管理 REST API + 前端 embed + i18n
│   └── usage/                  # 请求日志 + SQLite 统计
├── frontend/                   # React 19 + TS + Ant Design 6（Vite 构建，go:embed 嵌入）
├── desktop/                    # 桌面构建脚本
├── docs/                       # 本目录
└── scripts/                    # 构建脚本
```

## 关键决策记录（ADR）

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| 1 | 前端技术栈 | React 19 + TS + **Ant Design 6** + ECharts + TanStack Query + react-router + i18next | 用户确认 antd；v6（2025-11 稳定发布）原生支持 React 19，v5→v6 零 codemod，中后台表格/表单开箱即用，双语文档生态最好 |
| 2 | 前端交付方式 | `go:embed all:frontend/dist` 嵌入二进制，`/admin/` SPA 服务 | 保持"单文件、双击即用"卖点；桌面端 Wails 走 HTTP 加载 `/admin/`，零改动 |
| 3 | 过渡策略 | dist 未就绪时兜底返回旧 adminHTML 字符串 | 任何时刻仓库都能 build、后台都能用；M1 对齐验收后删除旧 UI |
| 4 | 用量/日志存储 | SQLite（`modernc.org/sqlite` 纯 Go，CGO_ENABLED=0），配置仍用 JSON | 成熟统计需要 GROUP BY 时间桶与长保留期；纯 Go 驱动不影响 Docker/桌面交叉构建 |
| 5 | 后端 API 风格 | 保持现有 GET/POST + `{success,data,error}` envelope | 减少无谓 churn，前端 client 统一封装 |
| 6 | 重构范围 | 协议转换/故障转移/账号池核心**不重写**，只扩展挂点 | 已有 ~2900 行测试兜底，重写等于重借 bug 债 |
| 7 | 开发模式 | Vite dev server 代理 `/admin/api`、`/v1`、`/health` 到 3457 | 同源免 CORS，cookie 会话原样可用 |

## 数据文件（`resolveDataPath` 查找序：exe 目录 → cwd → `~/.cline2api/`）

| 文件 | 内容 | 计划 |
|------|------|------|
| `.cline-accounts.json` | 账号池、API Key、模型、监听地址、密码哈希 | M3：Keys 从纯字符串升级为对象（自动迁移） |
| `.cline-request-logs.json` | 请求日志（5000 条/30 天上限） | M3：迁 SQLite，旧文件封存不迁移 |
| `.cline-providers.json` | 自定义 Provider | M4：加 protocol / modelMapping |
| `.cline-config.json` | 轮询策略、headers、free 链 | 不变 |
| `.cline-zen.json` | opencode zen 配置 | 不变 |
| `.cline-proxy.json` | Cline 出口代理池 | 不变 |
| `usage.db` | （M3 新增）SQLite：请求日志 + 小时桶聚合 | WAL，原始日志 90 天、小时桶 1 年 |

## 已探明的坑（后续里程碑要处理）

1. **用量归因丢失**：zen 与自定义 provider 流式响应解析出的 token 用量被直接丢弃（`proxy.go:1550`、`providers.go:324`），仅 Cline 账号路径记账 → M3 修复
2. **测试顺序污染**：`TestHTTPTransportUsesHTTPSProxyFromEnvironment` 全量跑 FAIL、单跑 PASS，根因是 `clineOutboundProxy` 挂在全局 `httpTransport` 上读惰性加载的包级配置 → M5 治理
3. **provider 不在主路由**：自定义 provider 只在 cline 路由分支内被尝试（`proxy.go:845`），命中 zen 的模型永远到不了 provider，`/v1/models` 也不暴露 provider 模型 → M4 修复
4. **API Key 无元数据**：`pool.Keys` 是 `[]string`，无法统计单 Key 用量 → M3 升级
