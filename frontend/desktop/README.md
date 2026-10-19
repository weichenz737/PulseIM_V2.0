# Pulse 桌面端概念预览

这里是根据 `frontend/mobile` 现有视觉 token 制作的桌面网页 / Windows 客户端，使用真实接口加载账户、会话和业务数据。

## 预览

首次运行先安装依赖：

```powershell
npm install
```

启动网页端：

```powershell
npm run dev
```

也可以直接双击目录里的 `start-desktop.bat`，它会自动启动开发服务器并打开浏览器。

启动 Electron 桌面壳层：先保持 Vite 开发服务器运行，再新开一个终端执行（Electron 依赖安装后可用）：

```powershell
npm run electron:dev
```

构建网页端：

```powershell
npm run build
```

当前 Electron 安装包脚本已经预留，正式发布前还需要补充 Windows/macOS 图标、代码签名和自动更新地址。

页面包含：

- 消息工作台：会话列表、聊天区、联系人上下文面板
- 联系人：搜索、快捷入口、联系人卡片
- 发现：朋友动态、兴趣圈子、热门社区
- 个人中心：资料、偏好、设备安全
- 收藏：为桌面端预留的内容聚合页

右上角月亮按钮可以切换暗色主题，左侧导航可以切换页面。
