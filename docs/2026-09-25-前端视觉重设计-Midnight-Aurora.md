# 2026-09-25 前端视觉重设计：Midnight Aurora

## 背景

M0-M5 重构完成后，管理后台虽然功能齐全，但视觉上是「antd 默认模板」：默认蓝、系统字体、
白卡片、无动效、侧栏不可收缩，用户评价「像 10 年前的管理面板」。本次用 hallmark 设计技能
（custom 路线）做全站视觉重设计，要求：有特色、有悬停动画、侧栏可收缩。

## 设计系统（frontend/design.md，locked）

**Midnight Aurora** — 深色优先的 API 控制台美学：

- **色彩**：OKLCH 定制色板。深墨纸面（oklch 15% 0.015 278）+ 紫青极光渐变对
  （accent `oklch(71% 0.17 298)` → accent-2 `oklch(79% 0.13 205)`）。渐变只用于品牌标、
  主按钮、活动菜单条、图表主线（视口占比 ≤5%）。浅色模式同构映射。
- **字体**（@fontsource-variable 本地打包，离线可用，不请求外网）：
  - Space Grotesk Variable — 品牌标、页面标题、统计大数字
  - Inter Variable — 正文（中文回退 PingFang/雅黑）
  - JetBrains Mono Variable — 模型 ID、Key、Token 数值、时间戳
- **动效**：缓动 `cubic-bezier(0.16,1,0.3,1)`，160/240ms 两档；只动 transform/opacity；
  `prefers-reduced-motion` 全部退化。规定动作：卡片悬停 -2px + 极光描边光晕、
  主按钮流光扫过 + 按压缩放、表格行悬停左侧 2px 极光条、路由切换上浮淡入、
  统计数字 count-up、状态点呼吸脉冲。

## 改动范围

| 文件 | 内容 |
| --- | --- |
| `frontend/design.md` | 新增：锁定设计系统（唯一权威） |
| `frontend/src/styles/tokens.css` | 新增：OKLCH 设计令牌，`:root` + `[data-theme='light']` 双块 |
| `frontend/src/styles/global.css` | 重写：antd 皮肤层（卡片/按钮/表格/侧栏/滚动条/动效/登录极光） |
| `frontend/src/main.tsx` | antd ConfigProvider 全量 token（每个模式一份等值 hex 映射）+ 字体引入 |
| `frontend/src/App.tsx` | 可收缩玻璃侧栏（232↔72，localStorage 持久化 + ≤992px 自动收起）、顶栏（折叠钮/当前页/服务状态呼吸点）、路由过渡 |
| `frontend/src/components/StatCard.tsx` `hooks/useCountUp.ts` | 新增：图标徽章 + 滚动数字 + chips 的统计卡 |
| `frontend/src/pages/Dashboard.tsx` | StatCard 重构 + 图表重绘（渐变面积/圆角柱/环图，读 CSS 变量取色） |
| `frontend/src/pages/Login.tsx` | 极光 blob 背景 + 玻璃卡登录页 |
| 其余 8 页 | `#999` → `var(--ink-2)`，其余经 token/皮肤层自动继承 |

## 踩坑与修复

1. **ECharts(zrender) 解析不了 oklch**：网格线渲染成黑色。`getComputedStyle` 对 CSS 变量
   原样返回 oklch 字符串，canvas `fillStyle` 在当前内核也不归一化。修复：自写
   `utils/color.ts` 的 oklch→sRGB 换算（OKLab→LMS→线性 RGB→伽马），zrender 只喂 rgb/rgba。
2. **antd 色彩算法不认 var()/oklch**：token 需要具体色值做派生计算，故 main.tsx 维护
   每模式一份 hex 映射（与 tokens.css 语义对应）；视觉个性全部走 global.css 覆盖层，
   不绑 antd 版本。
3. **浅色模式菜单文字过淡**：antd 6 Menu 默认 itemColor 偏灰，显式指定
   `components.Menu.itemColor/itemHoverColor/itemSelectedColor` 双模式值。
4. **后台标签页动画冻结**：`.c2a-page` 入场动画在隐藏标签页里停在中间帧，截图发暗。
   页面本身无问题（前台正常），截图流程用 `getAnimations().finish()`（跳过无限循环动画）
   强制完成。

## 验证

- `npm run build` + `go build` 全绿，服务重启后逐页实测。
- 浏览器截图 13 张（深色仪表盘/收起侧栏/浅色/登录/8 个功能页/行悬停特写），
  逐张检查：玻璃侧栏、极光渐变、等宽数据、微标签表头、行悬停极光条、渐变按钮均生效；
  深浅两套、中英文均正常。
- 主题切换连按 4 次压测无白屏（期间发现过一次偶发白屏，刷新后不可复现，压测通过）。
- 登录流程走通（临时设密码 → 登录 → 截图 → 清除密码恢复原状，接口返回 200）。
