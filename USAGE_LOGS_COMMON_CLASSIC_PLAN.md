# 普通使用日志内容表 Classic 样式回归计划

## 目标

仅对 `/usage-logs/common` 普通使用日志的**内容表（Table）与分页区域**做 Classic 视觉层级与功能列回归，参照 `dac55f0fd` 的 `UsageLogsTable` 与 `UsageLogsColumnDefs`：
- 恢复默认客户端 IP 列展示规则（消费/错误日志显示 IP，管理员充值日志显示 IP，支持点击复制与说明 Tooltip）。
- 恢复紧凑表格密度与行高（提升单屏信息承载量）。
- 恢复内容表格内置分页排布。

**特别声明**：根据要求，**内容页的条件筛选样式不回归**，完全保留现有新版的 `LogsFilterToolbar` 现代交互（紧凑日期选择器、折叠抽屉式高级筛选、顶部统计栏与操作栏）。

---

## 范围与边界

###  回归范围（内容表样式）
1. **客户端 IP 列补回**：
   - 消费日志（`type: 2`）与错误日志（`type: 5`）默认显示 Client IP 胶囊标签；
   - 充值日志（`type: 1`）仅在管理员视角显示 Client IP；
   - 支持点击快速复制（带 Toast/复制状态反馈）；
   - 表头包含 Tooltip 提示说明：“仅当用户开启 IP 记录时，才会在使用和错误日志中记录 IP”；
   - 未记录 IP 或其他不支持类型保持空白。
2. **表格紧凑密度与行高**：
   - 单元格留白收紧（`py-1.5`）；
   - 表头高度控制为紧凑 `h-9`；
   - 表格行高收紧至 `h-11`；
   - 边框与圆角适配 `rounded-xl border-border/70`。
3. **分页与卡片容器**：
   - 普通日志分页由全局 Footer 移至表格内容卡片底部内嵌（`paginationInContent`）；
   - 普通日志使用独立卡片容器承载内容区。
4. **多语言与回归测试**：
   - 补充各语言（en/zh/zh-TW/ja/ru/fr/vi）关于 IP 列提示文案；
   - 补充针对 IP 列权限与展示规则的自动化回归测试（`ip-column.test.tsx`）。

### ❌ 明确非目标（坚决不改动条件筛选区）
- **保留现有条件筛选栏**：不改成旧版 4 列大表单；高级筛选（用户名、渠道ID、Request ID 等）继续收拢在折叠抽屉中。
- **保留现有统计与操作排布**：顶部统计条、敏感信息小眼睛开关、导出按钮、查询/重置按钮完全维持新版现状。
- **不改动绘图日志（drawing）、任务日志（task）和审计日志（audit）**。
- **不改动后端接口与数据协议**：继续使用现有 `/api/log` 与 `/api/log/self`。

---

## 实现步骤

1. **表格组件库扩展（`data-table-page.tsx`）**：
   - 为 `DataTablePage` 增加可选的 `paginationInContent`、`paginationClassName` 和 `tableBodyClassName` 属性，支持内容区内嵌分页与表格体密度覆盖，且不影响系统其他页面。
2. **普通日志列定义扩展（`common-logs-columns.tsx`）**：
   - 在列配置中加入 `ip` 列定义，按权限和日志类型（消费/错误/管理员充值）决定是否显示 `StatusBadge` 胶囊，带点击复制与 Tooltip。
3. **内容表格与分页适配（`usage-logs-table.tsx`）**：
   - 为普通日志启用 `py-1.5` 单元格间距、`[&_th]:h-9` 表头与 `[&>tr]:h-11` 行高；
   - 启用 `paginationInContent` 与卡片边框容器。
4. **多语言词条同步（`locales/*.json`）**：
   - 补充 `IP is recorded for usage and error logs only when the user enables IP logging` 各语言词条。
5. **增补自动化测试（`ip-column.test.tsx`）**：
   - 验证消费/错误/管理员充值显示 IP、普通用户充值/管理日志隐藏 IP、空 IP 留白等行为。
6. **质量验证**：
   - 运行针对 IP 列的定向测试、usage-logs 模块测试、`bun run typecheck`、lint 与格式化校验。

---

## 进度与执行状态

- [x] 表格组件库扩展：`DataTablePage` 支持 `paginationInContent`、`paginationClassName` 与 `tableBodyClassName`。
- [x] 普通日志列定义扩展：`common-logs-columns.tsx` 补齐 IP 列展示规则（消费/错误/管理员充值可见，带复制与 Tooltip）。
- [x] 内容表格样式紧凑化：单元格间距收紧（`py-1.5`）、表头紧凑（`h-9`）、行高紧凑（`h-11`）、圆角边框美化与分页内嵌卡片底侧。
- [x] 条件筛选区保持现状：`CommonLogsFilterBar` 与 `LogsFilterToolbar` 零改动，完全保留新版现代交互。
- [x] 恢复单行条目点击展开详情（`expandRowByClick`）：支持展开 Classic 属性网格，包含渠道信息、Request ID、上游 Request ID、客户端 IP、倍率与完整**计费过程**公式明细。
- [x] 中文界面表头本地化为“耗时”，模型胶囊背景彻底设为透明。
- [x] 增补回归测试：`ip-column.test.tsx` 针对 5 种日志类型与管理员/用户角色全面断言通过。
- [x] 同步 7 国语言词条。
- [x] 全套测试通过：针对性测试 13 项通过，usage-logs 全套 446 项测试全部通过，`typecheck`、`oxlint` 与 `oxfmt` 零错误通过。
