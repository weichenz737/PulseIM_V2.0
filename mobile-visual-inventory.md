# 移动端视觉与交互代码盘点

检查日期：2026-11-03。范围：`frontend/mobile/src`，不含管理端、电脑端和第三方依赖。
这是静态代码盘点，不是逐页真机视觉验收；数量为源码定义/调用次数，不是运行时弹窗数量。组件可被多处复用，条件分支也可能互斥。

## 1. 数量概览

| 项目 | 源码数量 | 说明 |
| --- | ---: | --- |
| Vue template 定义 | 172 | 扫描 Vue/CSS 文件 |
| Vant Popup | 39 | 当前全部声明为 bottom |
| Vant ActionSheet | 21 | 列表式底部操作菜单 |
| 显式 Dialog 组件 | 1 | 登录页服务器设置 |
| showConfirmDialog 调用 | 75 | 确认、删除、退出等 |
| showDialog 调用 | 6 | 单按钮提示等 |
| Vant Overlay | 6 | 聊天中的自定义弹层 |
| 原生 HTML button 标签 | 731 | 含列表、键盘数字键、条件分支等 |
| van-button 标签 | 0 | 不代表 Vant 内部没有按钮 |
| showToast 调用 | 729 | 含成功、错误、校验提示 |
| showLoadingToast 调用 | 38 | 阻塞或等待提示 |
| 内联 svg 标签 | 61 | 包括图标与其他图形，不等于 61 种图标 |

## 2. 弹窗与覆盖层类型

| 类型 | 交互用途 | 代码入口 |
| --- | --- | --- |
| 居中确认框 | 删除、清空记录、退出/解散群圈、账号安全、移除账号、修改密码等 | 多页 showConfirmDialog |
| 居中提示框 | 权限不足、无法删除、说明等 | CommunityDetailView、CommunityManageView、CommunityPostDetailView |
| 居中编辑框 | 服务器地址，保存/取消与中文输入错误 | LoginView.vue:361 |
| 自定义发送确认 | 文件发送确认等 | ChatView.vue:8841 起 |
| 消息锚点浮层 | 长按消息的复制、转发、删除、多选、引用、撤回等 | ChatView.vue:9171 |
| 媒体/编辑覆盖层 | 图片、相机、图片编辑、退出编辑确认、视频和文件预览 | ChatView、MediaVideoOverlay、FilePreviewOverlay |
| 通话覆盖层 | 语音/视频、群通话及邀请 | VoiceCallOverlay、GroupCallOverlay |
| 二维码预览 | 查看与保存二维码 | QrPreviewModal |
| 强制更新弹层 | 更新说明及后续操作 | App.vue:487 |
| 语音录制反馈 | 按住录音、上滑取消、录音时长 | ChatView 的 voice-record-mask |
| Toast / Loading | 轻量结果、校验、错误、等待 | 各业务页面 |

注意：消息长按菜单使用透明遮罩，保持聊天背景原色，这是已经明确的产品要求；不要在全局遮罩统一时重新增加变暗效果。录音、媒体预览和通话也不宜强行变为普通确认框。

## 3. 底部弹窗清单

### 通用/共享组件

| 组件 | 内容 |
| --- | --- |
| CommunityChoicePicker | 通用选项选择 |
| CommunityReportDialog | 举报原因、补充说明、证据上传 |
| LegalTextDialog | 隐私政策、服务条款等长文本 |
| PaymentConfirmDialog | 支付确认、金额、六位密码、数字键盘 |
| PaymentPasswordDialog | 设置/修改/找回支付密码、验证码、数字键盘 |
| ShareContactCard | 联系人名片分享 |
| MediaActionOverlay | 媒体操作菜单、转发对象选择 |
| MapAppChooser | 地图应用选择 |
| GroupCallOverlay | 邀请成员 |
| MomentComments | 评论操作菜单 |

### 各页面

| 页面 | 底部交互 |
| --- | --- |
| AccountSecurityView | 账号注销面板 |
| ChatSettingsView | 聊天操作、自动删除时间、阅后即焚时间、更多时间 |
| ChatView | @成员、地图来源、删除方式、消息回执、转发对象、群通话成员 |
| ChatHistorySearchView | 历史消息操作、文件转发 |
| ContactDetailView | 好友设置、备注及相关开关 |
| EditProfileView | 性别、生日、地区选择 |
| MessagesView | 电脑登录会话 |
| CommunityCreateView | 话题选择、创建协议 |
| CommunitiesView | 圈子申请审核内容 |
| CommunityDetailView | 圈子操作菜单、加入协议 |
| CommunityManageView | 管理操作、排序、权限、移除成员 |
| CommunityPostDetailView | 动态操作菜单 |
| GroupInfoView | 群相关操作菜单 |
| GroupManageView | 定时类型、定时时间及操作菜单 |
| FavoriteDetailView | 收藏操作、底部面板 |
| MomentsComposeView | 发布操作、可见范围、@成员、位置等选择 |
| MomentsView / UserMomentsView / MyMomentDetailView / MyMomentsListView | 动态操作菜单 |
| PaymentComposeView | 红包类型、成员选择 |
| StorageAllFilesView / StorageConversationFilesView | 文件转发对象选择 |
| WalletView | 账单类型、年、月选择 |

聊天“+消息类型”和表情面板是输入框下方的内嵌面板，不是 van-popup。二者共享高度 `min(260px,38vh)`，与系统键盘互斥，表情支持横向翻页，右下角固定删除。应作为独立输入组件维护。

## 4. 按钮类型

| 语义类型 | 现有场景 | 建议统一方向（待实施） |
| --- | --- | --- |
| 主操作 | 登录、保存、发布、确认转发、确认支付 | 统一主色、字号、圆角、加载与禁用状态 |
| 次操作 | 取消、关闭、稍后提醒 | 统一弱背景或描边，不与主操作同等强调 |
| 危险操作 | 删除、注销、解散、清空 | 统一危险色，必要时二次确认 |
| 文字按钮 | 忘记密码、协议、顶部保存/取消 | 统一文字颜色、字号及点击区域 |
| 图标按钮 | 返回、更多、加号、表情、关闭、删除 | 同功能同图标，视觉尺寸与实际点击范围分开定义 |
| 选择按钮 | Tab、胶囊选项、单选、多选、转发对象 | 统一选中、未选中、禁用反馈 |
| 列表行按钮 | 设置项、好友操作、菜单行 | 统一行高、左右留白、箭头与分隔线 |
| 图标加文字宫格 | 消息类型、长按消息操作 | 统一图标与文字间距；保留两种业务容器 |
| 专用控制 | 录音、通话、支付数字键盘 | 保留专用行为，统一基础颜色和触摸反馈 |

当前没有统一的业务 Button 组件。全局已有 `--pulse-control-height:44px`、`--pulse-control-radius:12px`、`--pulse-icon-control-size:40px`，但大量页面独立声明样式。例如登录按钮为 52px 高、20px 字号、16px 圆角，与通用控制量不同。不能仅替换所有 button 样式，否则列表行、数字键盘和录音按钮都会受影响。

## 5. 字体、图标、字号与字重

### 字体来源

- 正文字体栈：`Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif`，全局默认 15px。
- 未发现打包的正文 Inter 字体文件；实际字体取决于手机可用字体和系统回退，中文也由系统回退字体呈现。
- 代码/文件内容存在等宽字体栈：`ui-monospace, SFMono-Regular, Consolas, monospace`。
- 图标并存：本地 Material Symbols Outlined 字体、Vant Icon、内联 SVG/自定义图标组件、Unicode 字符。
- 表情删除图标独立使用 `Pulse Backspace` 本地图标字体；这不是正文字体。

### 常见字号（CSS 声明次数，非显示元素数）

| 字号 | 次数 |
| --- | ---: |
| 13px | 189 |
| 12px | 187 |
| 15px | 157 |
| 14px | 129 |
| 11px | 123 |
| 18px | 95 |
| 16px | 85 |
| 20px | 67 |
| 17px | 57 |
| 22px | 55 |

另有 9、10、19、21、23 等及金额/展示大字号。需要按语义收敛，而不是把金额、正文和图标字号混为一类。

常见字重：600（233 次）、700（135 次）、500（51 次）、650（46 次）；另有 550、560、680、720、750 等。非标准档位在不同字体上的实际效果可能不同。

当前聊天字号由 `--chat-font-size` 控制，默认 15px，`--pulse-content-font-size` 限制在 13–20px。部分内容使用变量，很多页面仍固定 px；设置中的字号变化不应被误认为已经覆盖所有界面。

建议候选字阶：辅助 12px、次正文 13px、正文/表单/按钮 15px、标题 18px、重点标题 22px；金额另设。字重候选 400/500/600/700。最终以真机可读性确认。

## 6. 当前统一风格的主要障碍

1. **已有主题变量，但页面硬编码较多。** global.css 有明暗主题、颜色、控件高度、圆角、安全区；页面仍有独立色值和多个近似圆角。
2. **弹层被多层样式控制。** global.css:1362 起设置 Vant 深色变量和 `!important`，1431 起再做浅色覆盖；局部组件又声明背景。修改局部样式可能被全局规则盖住。
3. **弹层头尾结构不一致。** 有默认右上角叉号、左侧取消、顶部确认、底部双按钮等；转发面板既有顶部“确定”，也有底部“确认转发”。
4. **底部面板高度缺少统一档位。** 聊天 @ 为 62%，回执 58%，转发 68%，共享媒体转发 70%，法律文本 min(78vh,680px)。各高度有业务差异，但缺少通用最大高度与滚动规则。
5. **安全区实现分散。** 有 `safe-area-inset-bottom` 属性、直接 env()、`--pulse-safe-bottom`、手写 padding；没有属性不代表一定没适配，需逐项核实，避免重复补偿。
6. **层级分散。** 例如文件确认 3600、群通话选择 4300、长按消息 10050、媒体操作 21000；应集中管理层级，避免叠加弹窗遮挡。
7. **图标多套并存。** 同类功能需建立映射表，不应继续引入新图标库。Material 字体为子集，新增名字必须确认实际字形存在。
8. **交互状态缺少共享规范。** 按下、禁用、加载、校验错误、长文本、键盘打开和关闭处理散落各页；统一视觉时应同步整理。

## 7. 建议实施顺序

1. 定稿基础变量：明暗颜色、字号/行高/字重、圆角、间距、图标、动画时长、层级、安全区。
2. 建立公共组件：Button、IconButton、Dialog、BottomSheet、ActionSheet、FormField、反馈提示；专用支付和聊天组件复用其基础样式。
3. 先统一登录、设置、好友资料等通用页面，再迁移聊天、钱包、圈子等复杂业务。
4. 每批核实浅色/深色、长文本、大字号、键盘、底部手势区；验证关闭、取消、提交中防重复点击与安卓返回键。

本次仅盘点和提出候选规范，没有修改应用功能或视觉代码，也没有更换手机安装包。
