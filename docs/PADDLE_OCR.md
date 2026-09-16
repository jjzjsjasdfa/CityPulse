# 本地飞桨识别与团队协作

## 启动

在仓库根目录执行 `docker compose up --build -d`。然后在 `mobile` 执行 `npm ci` 和 `npx expo start --web`。
如果本机已有 PostgreSQL 占用 5432，在根目录 `.env` 写入 `POSTGRES_PORT=5433`。不需要停止其他数据库。

后端自动连接 Docker 内网的 `ocr:8001`，此端口不对外发布。OCR 是独立 CPU 服务，4 个计算线程、单任务推理，模型在进程中复用。默认使用 PP-OCRv5 server 检测与识别模型；不尝试辨认全部装饰性文字。首次识别需要下载权重，后续使用 `ocr-models` 数据卷缓存，`docker compose down` 不删除缓存。不要在希望保留数据库和模型时使用 `down -v`。

## 文件约定

- 提交：`ocr/` 的服务代码、依赖版本、Dockerfile，Compose 配置及后端接入代码。
- 不提交：模型权重、虚拟环境、下载的完整第三方源码、测试海报、数据库文件、`.env`。
- 此电脑下载的官方 3.7.0 源码已归档到 `C:\EventsOnMaps\tools\PaddleOCR-3.7.0`，用于查阅。运行时使用固定版本的官方发行包，其他开发者不依赖这个绝对路径。
- 第三方 PaddleOCR 项目使用 Apache-2.0 许可证，具体依赖和模型遵循各自附带授权。

`ocr/requirements.txt` 固定主要依赖版本，`requirements.lock.txt` 约束本次验证的完整依赖版本，Docker 构建同时使用二者。首次下载依赖和权重需要联网；上传图片只在本机 Docker 服务之间传递，不上传给模型下载站。

CPU 推理启用 oneDNN/MKLDNN。此电脑的 RAN HIPHOP 海报测试中，关闭加速约 185 秒，开启后首轮约 15 秒；这是单张样本的本机测量，不是所有海报的速度保证。5 个艺人姓名和日期时间正确，小字场馆仍有错字，审核时必须核对。

## 排障

`docker compose logs --tail=100 ocr` 查看下载/推理问题；`docker compose logs --tail=100 api` 查看接口问题。
本机 uvicorn 可通过 `POSTER_OCR_URL` 连接自行部署的同一 OCR 服务；未配置时仍使用已安装的 Tesseract。
服务失败会明确返回错误，不会静默用旧引擎冒充飞桨结果。

升级识别方案后，同一用户重新上传原来的待审核海报会更新旧记录。已审核记录保持原样。
OCR 与字段提取仍是两步：图中文字被识别正确，不代表能可靠判断每个人名、主办方或场馆。不明字段留空，非明确标签的连续人名按候选阵容提取，仍需用户和管理员核对。
