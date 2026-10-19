# Native API 使用约定

业务代码只能从 `@/native` 导入统一接口，禁止直接导入任何
`@capacitor/*` 包。Vite 在开发和构建时会检查并阻止越界导入。

```ts
import {
  nativeCamera,
  nativeClipboard,
  nativeFilesystem,
  nativeNotifications,
  nativePreferences,
} from '@/native'

const photo = await nativeCamera.openCamera()
await nativeClipboard.writeText('Pulse')
await nativePreferences.setJsonPreference('profile', { theme: 'dark' })
```

每项能力独立放在同名模块中：

- `camera.ts`：拍照、相册、多图选择和权限
- `filesystem.ts`：读写、目录、下载和文件信息
- `clipboard.ts`：剪贴板读写
- `preferences.ts`：字符串和 JSON 本地存储
- `keyboard.ts`：键盘控制和事件
- `app.ts`：App 生命周期、返回键和退出
- `statusBar.ts`：状态栏显示、颜色和主题
- `splashScreen.ts`：启动屏显示与隐藏
- `localNotifications.ts`：权限、调度、取消和通知事件
- `network.ts`：网络状态查询和变化监听
- `orientation.ts`：横竖屏能力
- `platform.ts`：平台判断和插件可用性
- `shell.ts`：App 启动时的原生壳层初始化
