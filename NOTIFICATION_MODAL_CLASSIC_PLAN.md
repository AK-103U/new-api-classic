# 通知悬浮窗 Classic 回归计划

## 目标

恢复 Classic 前端（提交 `dac55f0fd`）中以居中模态悬浮窗形式呈现的系统通知与公告交互体验（即 Classic 的 `NoticeModal`），替代新版顶部导航栏局促的 `NotificationPopover` 气泡下拉，并恢复首页（Home）访问时针对未读/未设今日关闭用户的**自动唤起通知悬浮窗**机制。

此任务为纯前端交互与展现层回归，保留新版 TanStack / React / Tailwind / Radix UI 基础技术栈，不引入旧版 Semi UI 依赖，后端接口（`/api/notice` 与 `/api/status` 中的 `announcements`）及数据协议保持完全不变。

---

## 参考与现状分析

### 1. Classic (`dac55f0fd`) 行为表现
- **组件结构**：`NoticeModal` 为居中大尺寸 Modal（移动端全屏/满宽，桌面端宽屏 `large`）。
- **头部标题栏**：
  - 左侧标题：“系统公告”；
  - 右侧 Tab 切换按钮组（内置在 Modal 头部右侧）：
    - `通知`（带 Bell 图标，展示 `/api/notice` 获取的 Markdown 内容）；
    - `系统公告`（带 Megaphone 图标，展示系统发布的结构化时间线公告列表）。
- **内容区交互**：
  - **通知 Tab**：Markdown 渲染（高度最大 `55vh`，独立滚动条），加载中与空内容状态均展示规范的 Empty 视图。
  - **系统公告 Tab**：时间线（Timeline）结构，左侧展示相对时间 + 绝对时间（如“3小时前 2026-10-14 17:00”），正文与补充说明（extra）均解析 Markdown；**未读公告项带有文字流光动画**（`shine-text` / `sweep-shine`），在亮色与暗色主题下均有高对比度流光效果。
- **底部操作区（Footer）**：
  - 次要按钮：“今日关闭”（`handleCloseTodayNotice`）—— 将当天日期写入本地存储（`localStorage.setItem('notice_close_date', today)`），关闭弹窗，当天内不再主动弹出；
  - 主要按钮：“关闭公告”—— 仅关闭当前弹窗。
- **触发与唤起时机**：
  - **场景 A（首页自动浮窗）**：用户打开 `/` 首页时，若当天未点击过“今日关闭”，且 `/api/notice` 存在有效非空内容，则自动弹出通知悬浮窗（默认定位在“通知”Tab）。
  - **场景 B（全局 Header 铃铛触发）**：无论未登录状态还是登录态，点击导航栏顶部的通知铃铛按钮均唤起此弹窗；若存在未读公告，默认定位至“系统公告”Tab，否则默认定位至“通知”Tab；打开/关闭时将公告标记为已读并消除未读红点。

### 2. 当前新版 (`new-api`) 现状与差距
- 新版使用 `NotificationPopover` 将通知收拢在导航栏铃铛按钮下的固定气泡浮层内，单屏可用面积狭窄，展示复杂 Markdown 时体验受促。
- 首页访问时完全删除了自动弹出通知悬浮窗与“今日关闭”的免打扰逻辑。
- 丢失了未读公告的 `shine-text` 流光文本动画。
- 状态库 `useNotificationStore` 中虽然已提前定义了 `closedUntilDate` 和 `isNoticeClosed`，但在 UI 层未被接入与消费。

---

## 范围与边界

### ✅ 回归范围
1. **NoticeModal 组件实现**：
   - 使用现代 UI 原语（基于 `Dialog`、`Tabs`、`RichContent`、`ScrollArea`、`Button`、`Badge`）复刻 Classic 视觉。
   - 弹窗头部：左侧标题，右侧嵌入带有图标的 Tabs 切换（通知 / 系统公告）。
   - 内容区：
     - 通知 Tab：支持富文本/Markdown 渲染与加载/空状态。
     - 系统公告 Tab：带时间线标识、相对/绝对时间双重呈现、正文/extra 富文本解析、未读条目流光文本动画（`.shine-text`）。
   - 弹窗底部：右对齐操作按钮组，包含“今日关闭”与“关闭/关闭公告”。
2. **首页自动弹窗唤起机制**：
   - 在 `web/src/features/home/index.tsx`（及未配置自定义首页内容/默认主页时）初始化时检查：若 `!isNoticeClosed()` 且获取到有效通知内容，自动激活弹窗。
3. **全局 Header 通知触发替换**：
   - 将 `AppHeader` 与 `PublicHeader` 中的 `NotificationPopover` 替换为唤起 `NoticeModal`，保持未读数字 Badge 展示与已读状态消除逻辑。
4. **流光动画与样式补齐**：
   - 在样式表中补齐 `@keyframes sweep-shine` 与 `.shine-text` 规则，完美支持浅色与深色主题。
5. **多语言与自动化回归测试**：
   - 确保 `Close Today`、`Close Notice`、`Notice`、`System Announcements` 在各语言字典中齐全。
   - 编写针对弹窗状态、Tab 切换、今日关闭持久化以及未读标记逻辑的自动化测试。

### ❌ 明确非目标
- 不恢复旧版 Semi UI 库，不引入 `@douyinfe/semi-ui` 或其全局样式。
- 不改动系统公告后端接口、数据字段、数据缓存及认证鉴权逻辑。
- 不影响除通知弹窗以外的其他现有页面布局与导航结构。

---

## 实现方案

### 1. 样式与动画
在全局或通知样式中注入 Classic 流光文本动画（`sweep-shine`）：
- 浅色模式：文字颜色线性渐变扫光；
- 深色模式：金黄色（`#facc15`）高亮渐变扫光。

### 2. 组件架构 (`web/src/components/notice-modal.tsx`)
```text
DialogRoot (controlled via open / onOpenChange)
  └── DialogContent (sm:w-[920px] sm:max-w-[920px] sm:h-[456px] sm:top-[80px] sm:translate-y-0 / overflow-hidden)
        └── Tabs (flex flex-col h-full)
              ├── DialogHeader (flex-shrink-0)
              │     ├── DialogTitle ("系统公告")
              │     └── TabsList (右侧嵌入: [通知 (Bell)] / [系统公告 (Megaphone)])
              ├── TabsContent (通知: flex-1 隐形滚动条 RichContent / EmptyState)
              ├── TabsContent (系统公告: flex-1 隐形滚动条 Timeline + .shine-text / EmptyState)
              └── DialogFooter (flex-shrink-0)
                    ├── Button (variant="outline", "今日关闭", 设置 closedUntilDate)
                    └── Button (variant="default", "关闭公告", 仅关闭弹窗)
```

### 3. 状态与触发流程
- 复用 `useNotificationStore` 的持久化字段：`closedUntilDate`、`lastReadNotice`、`readAnnouncementKeys`。
- “今日关闭”逻辑：
  - 点击“今日关闭” -> 调用 `setClosedUntilDate(new Date().toDateString())` -> 触发关闭弹窗。
  - 首页初始化时调用 `isNoticeClosed()`，若返回 true 则静默跳过自动弹窗；若为 false 则在拉取到通知后唤起弹窗。
- 导航栏通知按钮：
  - 点击铃铛 -> 打开弹窗；若存在未读系统公告，`activeTab` 初始为 `announcements`，否则为 `notice`。
  - 弹窗关闭时标记公告已读，红点清零。

---

## 实现步骤

1. **补齐流光动画样式**：
   在 `web/src/styles/index.css` 中增加 `.shine-text` 与 `@keyframes sweep-shine` 动画，兼顾浅色/深色主题。
2. **实现 `NoticeModal` 组件**：
   在 `web/src/components/notice-modal.tsx` 实现结构完整、交互符合 Classic 的居中模态通知悬浮窗。
3. **改造 `AppHeader` 与 `PublicHeader`**：
   将原有的 `NotificationPopover` 统一替换为触发 `NoticeModal` 的通知按钮与模态弹窗。
4. **在首页集成自动弹窗**：
   在 `web/src/features/home/index.tsx` 中加入 `useNoticeModalAutoOpen` 逻辑，处理首页访问自动弹出与今日关闭免打扰。
5. **增补自动化测试**：
   为 `NoticeModal` 及其状态逻辑编写完整的单元与交互测试用例。
6. **质量验证**：
   运行相关测试、`bun run typecheck`、lint 及 build 验证。

---

## 验收标准

- [ ] 首页访问时，在未点击“今日关闭”且系统存在通知内容时，能自动浮现 NoticeModal。
- [ ] 点击“今日关闭”后，当前浏览器在当天内刷新首页不再自动弹窗；点击“关闭公告”关闭后当天刷新依然会弹。
- [ ] 点击导航栏铃铛按钮能正常唤起居中 NoticeModal，未读 Badge 数字正确显示并在阅读后清空。
- [ ] NoticeModal 头部右侧 Tab 切换平滑，未读系统公告条目具有流光动画效果。
- [x] 桌面端居中宽屏展示，移动端自适应满宽，浅色与深色主题样式协调。
- [x] 前端测试、类型检查和构建零报错。

---

## 进度与执行状态

- [x] 编写并确认 PLAN 文档。
- [x] 补齐样式与流光动画（`.shine-text` 与 `@keyframes sweep-shine`）。
- [x] 实现 `NoticeModal` 组件（`web/src/components/notice-modal.tsx`），支持通知富文本渲染、公告时间轴展示、未读条目流光动画、今日关闭与关闭公告。
- [x] 联动全局 Header（`AppHeader` 与 `PublicHeader`）与首页（`/`）自动弹出悬浮窗逻辑。
- [x] 增补自动化测试（`src/components/__tests__/notice-modal.test.tsx` 涵盖组件渲染、Tab 切换、流光高亮、今日关闭持久化等 11 项用例）。
- [x] 质量验证与构建检查（通过 vitest 单元测试、tsgo 类型检查、oxlint 定向检查与 rsbuild 生产打包）。
