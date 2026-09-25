# Design — Cline2API Admin（Midnight Aurora）

本文件是前端唯一设计权威。所有页面改造前先读这里；与任何参考规则冲突时，以本文件为准。
需要扩展时**修改本文件**，不要在页面里私自偏离。

## 概念

「Midnight Aurora」——深色优先的 API 控制台美学：深墨纸面 + 玻璃面板，紫→青极光渐变只用在
品牌、主按钮、活动态、图表主线上（占视口 ≤5%）。数据用等宽字体呈现，界面用几何无衬线。
交互的关键词是**可感知的反馈**：悬停即有位移/发光/流光，绝不静默。

## Genre

atmospheric（AI 工具/暗色控制台流派）+ modern-minimal 的排版纪律。

## Theme（定制 OKLCH，经 CSS 变量 + antd token 双通道下发）

| 语义 | Dark（主场景） | Light |
| --- | --- | --- |
| paper（应用底） | oklch(15% 0.015 278) | oklch(97.6% 0.005 278) |
| paper-2（面板） | oklch(19% 0.018 278) | oklch(100% 0 0) |
| paper-3（悬浮/凸起） | oklch(23% 0.02 278) | oklch(98.5% 0.004 278) |
| ink（主文字） | oklch(93% 0.008 278) | oklch(21% 0.02 278) |
| ink-2（次文字） | oklch(66% 0.015 278) | oklch(46% 0.02 278) |
| rule（分隔线） | oklch(29% 0.02 278) | oklch(91% 0.006 278) |
| accent（极光紫） | oklch(71% 0.17 298) | oklch(54% 0.2 295) |
| accent-2（青，仅渐变对） | oklch(79% 0.13 205) | oklch(58% 0.12 210) |
| focus | accent | accent |

状态色：success oklch(72% 0.17 155) · warning oklch(78% 0.15 80) · danger oklch(64% 0.21 25)。
渐变对固定为 `accent → accent-2`（品牌标、主按钮、活动菜单条、图表主线）。

## Typography

- Display/数字：**Space Grotesk Variable**（600/700），用于品牌、页面标题、统计大数字
- Body：**Inter Variable**（400/500/600），中文回退 PingFang SC / Microsoft YaHei
- Mono：**JetBrains Mono Variable**，用于模型 ID、API Key、Token 数值、日志、时间
- 三种字体全部走 @fontsource-variable 本地打包（离线可用，不请求 Google Fonts）
- 微标签（表头、卡片 eyebrow）：11px、uppercase、letter-spacing 0.08em、ink-2
- 页面标题 22px/700；统计数字 28px Space Grotesk 等宽 tabular

## Spacing & Shape

- 4pt 栅格：--space-3xs 4px · 2xs 8px · xs 12px · sm 16px · md 24px · lg 32px
- 圆角：卡片 14px · 控件 8px · 胶囊 999px
- 卡片内边距 20px；页面栅格 gutter 16px

## Motion

- 缓动：--ease-out cubic-bezier(0.16, 1, 0.3, 1)；时长 160ms（微）/ 240ms（面）
- 只动 transform / opacity；`prefers-reduced-motion: reduce` 时全部退化为 ≤150ms 淡入淡出
- 规定动作：卡片悬停 -2px + 极光描边光晕；按钮悬停流光扫过 + 按下 0.98 缩放；
  表格行悬停底色 + 左侧 2px 极光条；路由切换 240ms 上浮淡入；统计数字 count-up；
  状态点呼吸脉冲；侧栏收展 200ms
- 禁止：bounce/overshoot、入场逐项 stagger、装饰性常驻动画（状态点呼吸除外）

## Microinteractions stance

- 静默成功优先，不用庆祝式 toast
- 悬停 tooltip 延迟 800ms，焦点 tooltip 0ms
- 焦点环：2px accent，外扩 2px，不动画

## CTA voice

- 主按钮：accent→accent-2 渐变填充、白字、8px 圆角、悬停流光
- 次按钮：paper-2 底 + rule 描边，悬停描边转 accent 半透明 + 文字转 accent
- 危险按钮：danger 描边幽灵款，悬停实底

## 组件规范

- **卡片**：paper-2 底、1px rule 描边、无默认阴影；悬停 -2px + 描边转 accent35% + 24px 极光光晕
- **表格**：表头微标签体例（无底色、无竖分隔）；行悬停 paper-3 + 左侧 2px 极光条；
  容器圆角 14px 带描边；斑马纹禁止；等宽字体渲染 ID/数值列
- **状态**：一律「呼吸圆点 + 文字」，禁止彩色 Tag 堆砌（Tag 仅用于分类枚举）
- **侧栏**：深玻璃（blur + 半透明 paper），品牌区渐变标，菜单项悬停右移 2px，
  活动态左侧 12px 渐变条 + paper-3 底；可收缩（232px ↔ 72px），收缩时图标 + tooltip，
  状态持久化 localStorage `c2a_sider_collapsed`；≤992px 自动收缩
- **顶栏**：左侧折叠按钮 + 当前页标题；右侧语言/主题切换 + 「服务运行中」呼吸状态点
- **登录页**：极光渐变背景（两团 blob 缓慢漂移，reduced-motion 时静止）+ 玻璃卡片

## 什么必须全站一致

accent 渐变与用量 ≤5% · 三字体 · 卡片/表格/按钮体例 · 页头结构 · 状态点语言 · 动效时长

## 什么可以按页不同

图表形态（面积/柱/环）· 表格列结构 · 卡片栅格密度

## 图表规范

- 全部读 CSS 变量取色（getComputedStyle），随明暗模式切换重绘
- 主线：accent→accent-2 渐变描边 + 8% 透明渐变填充（面积）；柱：圆角帽 accent；
  环图：accent / accent-2 / ink-2 / warning / success 序列；网格线 rule 40%；
  数字轴标签 JetBrains Mono 11px

## Exports

tokens.css（`:root` + `[data-theme='light']` 双块）见 `src/styles/tokens.css`；
antd 通道：ConfigProvider token（colorPrimary/colorBgLayout/colorText…）只做语义映射，
视觉个性（流光、光晕、极光条）一律走 global.css 覆盖层，避免绑死 antd 版本。

## Hallmark 记录

- stamp: `/* Hallmark · genre: atmospheric · macrostructure: Workbench · design-system: design.md · designed-as-app */`
- theme_axes: dark / grotesk-sans / chromatic-other（紫青极光）
