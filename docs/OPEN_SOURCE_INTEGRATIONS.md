# RapidFuzz 与 React-admin 接入

## 当前范围

- RapidFuzz：海报识别后的词条候选排序、活动名称及场馆相似度计算。OCR 本身仍由 PaddleOCR 执行。
- React-admin：网页版「审核 → 昵称审核」的表格与表单，支持状态筛选、当前列表搜索、审核通过或拒绝、失败反馈。
- 手机原生端继续使用原有昵称审核页面。React-admin 通过 `.web.tsx` 隔离并延迟加载。
- Supercluster 尚未引入。真实数据规模与性能测量证明需要聚合时再评估，避免改变已有地图缩放显示规则。

## 匹配约束

`backend/app/fuzzy.py` 使用 RapidFuzz 的完整字符串 `ratio`，输入由现有流程规范化，输出为 0–1。
不使用会将短名字包含关系提升为满分的 partial/token-set 算法。
数据库先限制候选集合，再评分；保留短名字不自动纠正、候选分差、置信度、日期和具体场馆等原有条件。
相似度不是正确率，不代表已经验证人物身份；原始识别证据保留，低置信度候选仍需确认。
目前只完成规则回归，尚未对大量真实海报建立准确率基准。

## 审核与权限

React-admin 复用 CityPulse 的登录状态和 `/admin/nickname-changes` 接口，不建立第二套账号。
后端管理员权限校验继续生效；调试开启时仍按现有策略暂停审批。
当前接口每个状态最多返回 100 条，页面明确说明搜索仅覆盖已加载列表。后续应先增加后端分页，再迁移更多审批页面。
活动、词条和海报审批未在此次迁移到 React-admin。

## 同事同步与运行

前端在 `mobile` 目录执行 `npm ci`（Windows PowerShell 可用 `npm.cmd ci`）。
后端在仓库根目录执行 `docker compose up -d --build api`。
若 Docker Compose 插件不可用，使用已安装的独立 `docker-compose.exe` 执行同样参数。
非 Docker 环境在 `backend` 执行 `uv sync --locked`。
`mobile/package-lock.json` 与 `backend/uv.lock` 应一同提交；本地测试工具与模型缓存不提交。

## 验证

- `backend`：`uv run pytest tests/test_fuzzy.py tests/test_posters.py -q`。
- `mobile`：`npm run typecheck`。
- 启动网页后，在 `mobile` 执行 `node scripts/smoke-review-admin.mjs`。默认地址为 `http://localhost:8081`，可通过 `SMOKE_URL` 覆盖。
- 该浏览器测试模拟 API，不修改真实账户；验证搜索、冲突反馈、通过和拒绝。
- PostgreSQL 集成测试需要设置 `CITYPULSE_TEST_POSTGRES=1` 并准备测试数据库；未启用时会跳过，不能视作通过。

## 上游项目

- [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz)：MIT，当前锁定 3.14.6。
- [React-admin](https://github.com/marmelab/react-admin)：使用开源核心，当前安装 5.15.3；未使用 Enterprise 组件。

分发产品时保留依赖附带的许可证与版权声明。
