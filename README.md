# PulseIM（脉冲）

商业级即时通讯平台首期工程：用户端 H5 + 管理后台 + Spring Boot 业务 API + 独立 Netty IM。

## 架构

- **pulse-api**：Spring Boot 3 业务 REST（鉴权 / 会话 / 文件）
- **pulse-im-server**：独立 Netty WebSocket + Protobuf 实时通道（禁止用 Controller 做聊天）
- **PostgreSQL / Redis / MinIO / Elasticsearch**
- **frontend/mobile**：Vue3 + Vant 用户端
- **frontend/admin**：Vue3 + Element Plus 管理端骨架

## Windows 本地开发

先启动 Docker Desktop，再双击仓库根目录的 `start-pulseim.bat`。脚本使用项目现有的 `.local/postgres-data`，启动 Redis、MinIO、API、IM 和三个 Vite 前端；如有端口被其他项目占用，会明确报错，不会自动切换到另一套数据库或端口。首次使用需要已安装 PostgreSQL 16、JDK 21、Node.js，并准备好后端 JAR 和前端 `node_modules`。

| 用途 | 本地地址 |
| --- | --- |
| 移动端网页 | http://127.0.0.1:5173/ |
| 管理后台 | http://127.0.0.1:5174/admin/ |
| 电脑端网页预览 | http://127.0.0.1:5175/ |
| API 健康检查 | http://127.0.0.1:8080/actuator/health |
| IM WebSocket | ws://127.0.0.1:9001/ws |
| PostgreSQL / Redis / MinIO | 15432 / 16379 / 19090 |

移动端本机开发入口使用 HTTP，避免自签名证书阻止浏览器打开页面；`127.0.0.1` 在浏览器中仍属于安全上下文。电脑端 Electron 开发壳层默认连接 5175。不要同时运行下方的完整 Docker 部署和这套本地开发服务，它们会争用 API、IM 和前端端口。

```powershell
# 查看状态；日志位于 .local/dev-logs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/local-dev.ps1 -Action Status

# 停止前端/API/IM（数据库、Redis、MinIO 保留）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/local-dev.ps1 -Action Stop
```

`start-pulseim.bat` 只启动本地服务，不注册计划任务，也不会设置开机自启。Docker Desktop 本身需保持运行。项目的 PostgreSQL 数据目录固定为 `.local/postgres-data`，避免误用系统里其他同名数据库。

若后端代码变更，使用 JDK 21 和 Maven 3.9+ 在 `backend` 运行 `mvn -DskipTests package` 后，再重新启动 API/IM。Elasticsearch 为可选服务，不属于本地核心启动链路。

用户端已实现：登录、注册三步、消息列表（对齐 `ui设计图`）。

## Docker 开发编排

这套编排使用开发默认凭据。Linux 正式部署前请阅读 `deploy/PRODUCTION.md`，准备证书、密钥、MinIO 和公网地址配置。

```bash
cd deploy
docker compose up -d --build
```

访问：

- 用户端：http://localhost/
- 管理端：http://localhost/admin/
- API：http://localhost/api/
- IM：ws://localhost/ws

## 模块说明

```
backend/
  pulse-common/     通用 Result、JWT、Redis Key
  pulse-proto/      im.proto + 预生成 Java
  pulse-api/        业务 API
  pulse-im-server/  Netty IM
frontend/
  mobile/           用户手机端网页
  admin/            PC 后台骨架
deploy/             docker-compose / nginx / SQL
docker/             API / IM Dockerfile
```

## 关键接口（首期）

- `POST /api/v1/auth/sms/send`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/login/sms`
- `GET  /api/v1/conversations`
- `POST /api/v1/files/avatar/presign`
- `POST /api/admin/auth/login`
- `GET  /api/admin/dashboard/ping`

IM 指令：`AUTH` / `HEARTBEAT` / `SEND_MSG` / `PUSH_MSG` / `KICK`（Protobuf，开发期也支持 JSON 文本帧 AUTH）。
