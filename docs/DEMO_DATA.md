# 地图临时数据与测试

本地预览：`http://localhost:18081/`。测试接口：`http://localhost:18082/docs`。
地图页左上角的小型“虚构测试 · 五一广场”按钮可展开测试面板；
点击“模拟附近新活动”会重新发布周围八个方向的 16 条活动，触发多类别波浪。
总数保持 200，不不断追加垃圾数据。正式模式不会显示这个测试入口。

## 数据组成

可移植数据文件为 `backend/fixtures/demo-events.json`，生成器为 `backend/app/demo_data.py`。
所有活动、场地和主办方均为虚构；坐标是这些城市附近的测试位置。

| 范围 | 数量 | 分布 |
| --- | ---: | --- |
| 长沙 | 100 | 五一广场、梅溪湖、浏阳、宁乡四个密集组共 80；近郊八方向疏散点 20 |
| 长沙周边 | 50 | 株洲、湘潭、岳阳、益阳、娄底各 10，混合街区密集点与外围疏散点 |
| 湖南省外 | 50 | 武汉、南昌、桂林、贵阳、广州、北京、上海、成都、哈尔滨、乌鲁木齐各 5 |

“七天内”和“一周内”按同一个区间处理。六档共 34、34、33、33、33、33 条：
进行中、未来 0–3 天、3–7 天、7–15 天、15–30 天、30 天以上。
每个地域组内部每档数量差不超过 1。类别覆盖现有八类。
日期相对测试服务启动时间生成，因此重启服务后仍可测试正在发生的活动。
导出的 JSON 是生成那一刻的快照，可再次导出更新日期。

测试定位固定在长沙五一广场附近（28.19409, 112.97667），不请求设备真实位置。
预设八条分散在各地的测试收藏，用于验证全国视野只显示收藏。
测试收藏、已读状态使用单独的本地存储键，不影响正式模式的数据。

## 启动

在 `backend/`：

```powershell
uv sync --all-extras
uv run uvicorn app.demo:app --host 127.0.0.1 --port 18082
```

在 `mobile/`：

```powershell
npm install
npm run export:demo
npm run preview:map
```

Expo 调试可改用 `npm run start:demo`。Android 模拟器会通过 `10.0.2.2:18082` 访问测试接口。
物理手机需同一局域网，将服务监听地址改为 `0.0.0.0`，并在启动客户端前设置
`EXPO_PUBLIC_DEMO_API_URL=http://电脑局域网IP:18082/api/v1`。
网页底图来自 OpenStreetMap，需要网络；缩放中的图片加载与本地活动查询互相独立。

## 可复用接口

以下路径与正式服务一致，并直接使用同一组响应模型：

- `GET /api/v1/events`：城市、类别、日期筛选和分页列表。
- `GET /api/v1/events/map`：视口、类别、分页及开始结束时间。
- `GET /api/v1/events/nearby-updates`：15 公里、发布时间、固定上界及分页。
- `GET /api/v1/events/{id}`：活动详情。

测试专用路径只存在于 `app.demo`：

- `GET /api/v1/demo`：临时定位、数量、时间分组及预设收藏。
- `GET /api/v1/demo/dataset`：当前完整数据。
- `POST /api/v1/demo/publish`：模拟一批新活动。

## 切换 PostGIS

数据库迁移完成后，可以直接导入相同的虚构数据：

```powershell
# backend/；先校验，不写数据库
uv run python -m scripts.seed_demo
# 确定使用测试数据库后导入
uv run python -m scripts.seed_demo --write
# 或导入指定快照
uv run python -m scripts.seed_demo --file fixtures/demo-events.json --write
```

导入器映射同一 ID、经纬度、类别、时间与 `published_at`，生成 PostGIS geography 字段。
重复导入只更新同 ID 的虚构记录，不删除其他记录，也拒绝覆盖同 ID 的真实活动。
本次未对任何真实数据库执行导入。

之后运行正式的 `app.main:app`，把 `EXPO_PUBLIC_API_URL` 改成正式接口地址即可复用地图查询。
继续使用本地网页预览时，正式后端的 `BACKEND_CORS_ORIGINS` 需包含 `http://localhost:18081`。
在应用“设置”关闭调试功能即可恢复真实定位及正式存储键。构建时的 `EXPO_PUBLIC_DEMO_MODE` 仅决定未保存设置时的初始值。
自选时间与重播功能详见 [DEBUG_SETTINGS.md](DEBUG_SETTINGS.md)。
测试专用发布面板关闭；生产环境不部署 `app.demo`。

重新导出数据：`uv run python -m scripts.export_demo`。

## 验证

```powershell
# backend/
uv run pytest
uv run ruff check app tests scripts/seed_demo.py scripts/export_demo.py scripts/run_demo.py
# mobile/；测试接口和预览需运行
npm run typecheck
npm run test:map
npm run test:guidance
npm run smoke:demo
```

浏览器测试实际访问临时接口，检查默认比例尺、连续透明度过渡、各层级、全国收藏、
新活动多色提示、触屏隐藏按钮及真实双指触摸事件。截图保存在 `mobile/artifacts/demo-*.png`。
同时验证滚轮缩放、活动详情、已读渐隐与重启去重。旧的 `smoke:map`、`smoke:guidance`、
`smoke:web` 使用正式模式导出和独立浏览器接口 fixtures，验证登录、管理员审核、
纠错、活动管理、搜索与分页；它不依赖测试 API，也不会修改数据库。
地图测试使用上面的 `export:demo` 与独立测试 API。
Android/iOS 原生地图的实际帧率与厂商手势仍需真机检查。
