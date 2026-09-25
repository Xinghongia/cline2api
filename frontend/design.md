# Design — Cline2API Admin（Graphite Indigo v2）

本文件是前端唯一设计权威。所有页面改造前先读这里；与任何参考规则冲突时，以本文件为准。
需要扩展时**修改本文件**，不要在页面里私自偏离。

> v2 变更（2026-09-25 二轮整改）：v1 的「Midnight Aurora」紫青极光被用户否决——太花里胡哨。
> 改为「Graphite Indigo」：中性石墨底 + 单一靛蓝强调色，无渐变、无光晕、无背景装饰；
> 布局按页重排（工具栏/筛选/汇总分层），管理页补搜索筛选能力。

## 概念

「Graphite Indigo」——安静的数据控制台。颜色只出现在两类地方：**可交互元素**（选中态、
主按钮、链接、焦点）和**状态语义**（活跃/冷却/失效、成功/失败）。其余一切都是灰阶。
数据一律等宽字体。动效只保留有信息量的反馈，不做装饰性动画。

## Genre

modern-minimal（Linear/Stripe 派的克制 + 数据密度）。

## Theme（定制 OKLCH，CSS 变量 + antd hex 映射双通道）

| 语义 | Dark（主场景） | Light |
| --- | --- | --- |
| paper（应用底） | oklch(16.5% 0.004 260) | oklch(97.3% 0.003 260) |
| paper-2（面板/侧栏） | oklch(19.5% 0.005 260) | oklch(100% 0 0) |
| paper-3（悬浮/hover） | oklch(23% 0.006 260) | oklch(97.8% 0.003 260) |
| ink | oklch(93% 0.003 260) | oklch(23% 0.008 260) |
| ink-2 | oklch(66% 0.006 260) | oklch(46% 0.01 260) |
| rule | oklch(28% 0.006 260) | oklch(90% 0.004 260) |
| accent（靛蓝，唯一强调色） | oklch(70% 0.12 268) | oklch(52% 0.16 268) |
| success / warning / danger | 低饱和绿/琥珀/红，只用于状态点与小 pill | 同 |

禁止：渐变（品牌标一律实底 accent）、发光阴影、背景光晕/点阵装饰、多彩 Tag 堆砌。

## Typography

- Display/数字：Space Grotesk Variable（品牌标、页面标题、统计大数字）
- Body：Inter Variable（中文回退 PingFang SC / Microsoft YaHei）
- Mono：JetBrains Mono Variable（模型 ID、Key、Token、时间、状态值）
- 全部 @fontsource-variable 本地打包；数字列右对齐 + tabular-nums

## 布局体例（每页遵循）

- **页头层**：PageHeader（标题 + 副标题 + 高频动作 ≤4 个；低频动作收进「⋯」Dropdown）
- **工具栏层**：左侧筛选（搜索框 / 下拉过滤），右侧次级操作或汇总 chips，与表格间距 14px
- **数据层**：表格或卡片栅格； gutter 16px；内容最大宽 1440 居中
- **汇总 chips**：`共 N · 状态点+计数`，放工具栏右侧，用 .c2a-chip
- 空态/元信息（上次同步等）用 12px ink-2 文本，不占卡片

## 组件规范

- **卡片**：paper-2 实底 + 1px rule 描边 + 低阴影；不做悬停位移/光晕
- **表格**：表头 12px ink-2 无底色；行悬停 paper-3 + 左侧 2px accent 条；
  数值列右对齐等宽；分页贴底
- **状态**：彩点 + 等宽文本的 pill（.c2a-chip），禁止彩色 Tag 表状态
- **按钮**：主按钮实底 accent（悬停 88% 透明度），次按钮描边悬停变 accent，按下 1px 下移
- **侧栏**：paper-2 实底，可收缩 232↔72（localStorage `c2a_sider_collapsed`，≤992px 自动收起），
  选中态 accent-soft 底 + 左侧 3px accent 条
- **登录页**：细网格线背景 + 实底卡片，无 blob 无渐变

## Motion

- 只保留：路由淡入上移 240ms、行/控件 hover 160ms、统计数字 count-up、按下 1px 位移
- 缓动 cubic-bezier(0.16,1,0.3,1)；`prefers-reduced-motion` 全部退化 ≤150ms

## 图表规范

- 单色系：accent 主色 + 灰阶辅助，禁止彩虹序列；面积/柱透明度 ≤55%
- 取色经 `utils/color.ts` 把 CSS 变量换算成 rgb（zrender 不认 oklch）
- 轴标签 JetBrains Mono 11px；网格线 rule 50%

## 全站一致项

accent 单色纪律 · 三字体 · 页头/工具栏/数据三层体例 · 状态 pill 语言 · 动效档位

## Hallmark 记录

- stamp: `/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */`
- theme: Graphite Indigo (custom v2) · theme_axes: dark / grotesk-sans / cool(单一靛蓝)
