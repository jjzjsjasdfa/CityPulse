# 高德地图接入与浅色样式

当前过渡安排：设置 → 使用高德地图默认关闭。关闭时活动地图与管理员地点预览使用旧地图；开启并应用后才使用下述高德实现。旧配置缺少 amap 字段时同样默认关闭。

开启高德时，网页、iOS、Android 的活动地图及管理员地点预览共用 `AMapScreen` / `AMapSurface`。
高德模式的唯一底图为高德 JS API 2.0。网页使用 iframe，手机使用 Expo 支持的 WebView；该模式不加载 OSM、Apple 或 Google 底图。活动详情中的外部地图链接使用高德。

## 当前接入状态

代码已准备，但需要本项目自己的高德 Key 和安全代理才能加载实际地图。无配置时显示待配置状态，不加载其他提供方，不标记活动已读。
浏览器替身测试可以验证覆盖物和消息交互，不能代替真实高德鉴权、瓦片加载和手机手势测试。

## 配置

1. 在高德控制台为项目创建 **Web 端（JS API）** Key 和配套安全密钥。后端已有的 `AMAP_API_KEY` 是地点搜索 Web 服务 Key，不能混用。
2. 根据[高德安全代理文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)部署 `/_AMapService` 代理。安全密钥仅保存在服务器。代理需要放行网页及手机容器的来源，并按控制台要求配置域名白名单。对跨域请求设置相应 CORS；代理必须是手机可访问的 HTTPS 地址。
3. 将 `mobile/.env.example` 复制为本地 `mobile/.env`，填入 `EXPO_PUBLIC_AMAP_JS_KEY` 和 `EXPO_PUBLIC_AMAP_SERVICE_HOST`。不要把安全密钥放进 `EXPO_PUBLIC_*`。
4. 若有已发布样式，在 `EXPO_PUBLIC_AMAP_STYLE_ID` 填入样式 ID；否则使用高德 `whitesmoke` 浅色主题。
5. 重启 Expo；静态预览需重新执行 `npm run export:demo` 后刷新。测试活动 API 仍使用 `backend/scripts/run_demo.py`。

没有 Key 时不能确认真实高德地图的最终显示效果。本地已有的 200 条活动仍可以在发现与我的页面检查。

## 视觉规则

通过高德图层/样式控制简化底图，不对整张地图套灰度滤镜，也不覆盖活动颜色或隐藏地图版权。

- 默认浅色主题：`amap://styles/whitesmoke`。
- `features: ['bg', 'road']`：保留背景、道路，关闭一般兴趣点和建筑物图层。
- 关闭室内地图和建筑块；保持北向上、二维地图。
- 活动图标、名称和导引保持类别颜色。

在高德样式编辑器发布最终定制样式时，以此作为配置目标（以下为设计规范，不是可直接上传的高德样式文件）：

| 元素 | 配色/显示 |
| --- | --- |
| 陆地背景 | `#F8F9FA` |
| 主干道 | 白色，细浅灰边线 `#E2E6E8` |
| 支路 | 白色，弱化边线 |
| 水域 | 浅灰蓝 `#E8F0F3` |
| 绿地 | 近白灰绿 `#F0F3F0` |
| 行政名称、主要道路名称 | 灰色 `#8A969B`，随缩放逐步出现 |
| 商铺、广告、生活服务、普通 POI | 隐藏 |
| 建筑块、室内、实时交通、3D | 隐藏 |

## 坐标与性能

API、数据库、GPS 和会话仍使用 WGS84。仅地图适配边界进行 WGS84 ↔ GCJ-02 转换；查询视口转换回 WGS84。公式与已有后端规范化实现一致，为近似转换，上线前应核验真实场馆位置。

圆点、文字、定位与光圈在同一个高德覆盖物层，拖动无需 React 每帧重新定位。光圈用 CSS transform/opacity，持续时间按原期限计算，重新进入视口不会重置计时。覆盖物按 ID 更新；相机跨容器消息最多约 10 次/秒，结束时立即同步。

手机当前使用 WebView 中的高德 JS 地图，**不是高德原生 SDK**。不承诺 120Hz；原有性能面板记录主应用 JS，不能代表 WebView 内地图或原生合成帧率。接好 Key 后需在 iPhone/Android 真机测拖动、双指缩放、发热与高密度活动。若达不到目标，应替换 `AMapSurface` 为高德原生 SDK 适配层；Expo Go 无法直接热更新额外原生 SDK，需开发构建。

## 验证命令

```
npm run typecheck
node --test scripts/test-amap.mjs
node scripts/smoke-amap.mjs
```

旧 Leaflet 的 `smoke:map`、`smoke:demo`、`smoke:hits` 等脚本直接读取旧容器选择器，不能作为高德接入后的验证结果。真实高德验收仍待项目配置完成。
