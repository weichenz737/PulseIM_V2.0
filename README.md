# PulseIM（脉冲）

商业级即时通讯平台首期工程：用户端 H5 + 管理后台 + Spring Boot 业务 API + 独立 Netty IM。

## 架构

- **pulse-api**：Spring Boot 3 业务 REST（鉴权 / 会话 / 文件）
- **pulse-im-server**：独立 Netty WebSocket + Protobuf 实时通道（禁止用 Controller 做聊天）
- **PostgreSQL / Redis / MinIO / Elasticsearch**
- **frontend/mobile**：Vue3 + Vant 用户端
- **frontend/admin**：Vue3 + Element Plus 管理端骨架

## 本地开发

### 1. 基础设施

> 若 Docker Hub 不可达，`docker-compose.yml` 已默认使用 DaoCloud 镜像加速。
> MinIO / Elasticsearch 为可选：`docker compose --profile full up -d minio elasticsearch`

```bash
cd deploy
docker compose up -d postgres redis
```

### 2. 后端（需 JDK 21 + Maven 3.9+）

```bash
cd backend
mvn -DskipTests package

# 业务 API
java -jar pulse-api/target/pulse-api-1.0.0-SNAPSHOT.jar

# IM（另开终端）
java -jar pulse-im-server/target/pulse-im-server-1.0.0-SNAPSHOT.jar
```

- API: http://localhost:8080
- IM WebSocket: ws://localhost:9001/ws

### 3. 前端

```bash
# 用户端 http://localhost:5173
cd frontend/mobile
npm install
npm run dev

# 管理端 http://localhost:5174 （或 Vite 分配端口）
cd frontend/admin
npm install
npm run dev
```

用户端已实现：登录、注册三步、消息列表（对齐 `ui设计图`）。

## Docker 一键部署

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
