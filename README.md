# 城迹 CityPulse

一个“可信、结构化、可定位”的单城活动发现 MVP。项目采用契约先行：FastAPI
输出 OpenAPI，React Native 客户端只使用由该契约生成的类型。

New to the backend? Read the line-by-line architecture guide:
[doc/BACKEND_STRUCTURE.md](doc/BACKEND_STRUCTURE.md).

本仓库参考了
[Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template)
的 FastAPI、SQLModel、PostgreSQL、Alembic、Docker Compose 和自动客户端思路；
前端替换为 Expo React Native，并加入 PostGIS 视口查询。

## 已实现

- 信息流：分页、类别、刚上新、临期筛选与排序
- 地图：按当前视口调用 PostGIS bbox 查询，GiST 空间索引
- 地图分级：远景仅收藏 → 省域彩色圆点 → 城市彩色类别 → 街区活动名称；圆点按时间分六档
- 定位与新活动：启动以自己为中心，默认 500 米比例尺；附近 15 公里新活动通过八方向渐变波浪提示
- 连续缩放：触屏双指缩放自动切换圆点、类别与名称，带交叉淡入淡出；网页接入真实底图
- 临时测试：[200 条虚构活动与长沙定位](docs/DEMO_DATA.md)，接口与正式 PostGIS 服务保持一致
- 详情：时间地点、状态、来源证据、最近核验时间、可信度、状态历史
- 收藏：本机持久化，不收集账号或位置
- 分享与纠错：系统分享；纠错进入后端审核队列
- 数据模型：`Event`、`Source`、`EventSourceLink`、`StatusHistory`、`Correction`
- 统一错误结构、CORS、健康检查、Alembic 初始迁移和幂等种子数据
- 离线演示模式：API 不可用时仍可查看明确标识的虚构数据
- 合规默认值：无第三方海报、无后台定位、广告与可信度字段分离

## 目录

```text
project/
├─ backend/        FastAPI + SQLModel + Alembic
├─ mobile/         Expo + React Native + TypeScript
├─ compose.yml     PostgreSQL/PostGIS + API
└─ .env.example
```

原有的 `awesome-project/` 是创建本项目之前已存在的未跟踪目录，本次没有修改。

## 5 分钟启动

需要 Docker Desktop、Node.js 20+ 和手机上的 Expo Go。

1. 在仓库根目录复制环境配置并启动 API：

   ```powershell
   Copy-Item .env.example .env
   docker compose up --build
   ```

2. 确认接口可用：

   - API 文档：http://localhost:8000/docs
   - 健康检查：http://localhost:8000/health

3. 新开终端启动移动端：

   ```powershell
   Set-Location mobile
   npm install
   npm start
   ```

Android 模拟器默认访问 `10.0.2.2:8000`。真机需要让手机和电脑位于同一局域网，
并把 `mobile/.env` 中的地址换成电脑局域网 IP：

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api/v1
```

## 契约工作流

修改后端响应模型后，在 `backend/` 执行：

```powershell
python -m scripts.export_openapi
```

再在 `mobile/` 执行：

```powershell
npm run generate:api
npm run typecheck
```

`mobile/openapi.json` 是已提交的 API 契约，`mobile/src/api/schema.d.ts` 是生成结果，
客户端业务类型在 `mobile/src/api/types.ts` 中直接引用生成类型。

## API 概览

地图显示规则、参数与验收方法见 [docs/MAP_DISPLAY.md](docs/MAP_DISPLAY.md)。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 数据库就绪检查 |
| GET | `/api/v1/events` | 分页信息流和服务端筛选 |
| GET | `/api/v1/events/map` | PostGIS bbox 视口查询 |
| GET | `/api/v1/events/nearby-updates` | 15 公里内新发布活动、分页与检查时间 |
| GET | `/api/v1/events/{id}` | 详情、来源与状态历史 |
| GET | `/api/v1/meta/categories` | 客户端类别字典 |
| POST | `/api/v1/corrections` | 提交纠错审核 |

## 验证

后端：

```powershell
Set-Location backend
uv sync --all-extras
uv run ruff check app tests
uv run pytest
uv run alembic upgrade head --sql
```

移动端：

```powershell
Set-Location mobile
npm run typecheck
npx expo export --platform web
```

## 上线前仍需完成

当前交付覆盖路线图中的“打地基 + 解锁前端”主路径，不把演示数据包装成生产版本。
上线前至少还需要：

- 通过 14 天三城样本确定唯一首发城市，并替换演示内容
- 建 CMS、审核角色和来源授权台账
- 接入真实采集器、去重、定时复核、限频和 robots 策略
- 增加认证、服务端收藏、防刷、监控和备份恢复演练
- 选用有资质的中国地图服务并完成相应合规配置
- 完成备案、隐私政策、用户协议、投诉删除流程及外部律师复核
