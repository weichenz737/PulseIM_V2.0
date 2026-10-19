import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {
  ArrowDown,
  Bell,
  ChatDotRound,
  ChatDotSquare,
  ChatLineRound,
  ChatLineSquare,
  Check,
  CircleClose,
  Connection,
  CollectionTag,
  DataAnalysis,
  Delete,
  Document,
  DocumentChecked,
  Edit,
  FolderOpened,
  List,
  Location,
  Money,
  Notebook,
  Odometer,
  Phone,
  Picture,
  QuestionFilled,
  Refresh,
  Remove,
  Setting,
  Star,
  Switch,
  Tickets,
  Upload,
  User,
  UserFilled,
  Warning,
} from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

const icons = {
  ArrowDown,
  Bell,
  ChatDotRound,
  ChatDotSquare,
  ChatLineRound,
  ChatLineSquare,
  Check,
  CircleClose,
  Connection,
  CollectionTag,
  DataAnalysis,
  Delete,
  Document,
  DocumentChecked,
  Edit,
  FolderOpened,
  List,
  Location,
  Money,
  Notebook,
  Odometer,
  Phone,
  Picture,
  QuestionFilled,
  Refresh,
  Remove,
  Setting,
  Star,
  Switch,
  Tickets,
  Upload,
  User,
  UserFilled,
  Warning,
}

for (const [key, component] of Object.entries(icons)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
