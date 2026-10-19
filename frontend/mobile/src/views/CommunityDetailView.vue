<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { showConfirmDialog, showDialog, showImagePreview, showToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'
import CommunityAnnouncementBar from '@/components/CommunityAnnouncementBar.vue'
import CommunityReportDialog from '@/components/CommunityReportDialog.vue'
import MomentComments from '@/components/MomentComments.vue'
import PaymentConfirmDialog from '@/components/PaymentConfirmDialog.vue'
import ShareContactCard from '@/components/ShareContactCard.vue'
import MapAppChooser from '@/components/MapAppChooser.vue'
import {
  addCommunityComment,
  communityDetail,
  deleteCommunityComment,
  deleteCommunityPost,
  forwardCommunityPost,
  fetchCommunityComments,
  joinCommunity,
  leaveCommunity,
  setCommunityPostPinned,
  toggleCommunityCommentLike,
  toggleCommunityFavorite,
  toggleCommunityLike,
  type Community,
  type CommunityPost,
} from '@/api/community'
import { fetchSystemText } from '@/api/systemText'
import { fileDownloadUrl, resolveFileUrl } from '@/api/file'
import { isVideoUrl } from '@/api/moments'
import { fetchWallet } from '@/api/wallet'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { cacheChatFile } from '@/utils/fileCache'
import { createMomentMediaCacheGuard, getStableMomentMedia } from '@/utils/momentMedia'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const id = Number(route.params.id)
const item = ref<Community>()
const loading = ref(true)
const refreshing = ref(false)
const joining = ref(false)
const agreementVisible = ref(false)
const agreementLoading = ref(false)
const agreementAccepted = ref(false)
const payPasswordVisible = ref(false)
const agreementTitle = ref('圈子加入协议')
const agreementContent = ref('')
const commentOpenId = ref('')
const loadingComments = ref<Set<string>>(new Set())
const reportVisible = ref(false)
const reportPostId = ref('')
const shareVisible = ref(false)
const mapChooserVisible = ref(false)
const mapLocation = ref<{ latitude: number; longitude: number; name: string; address?: string } | null>(null)
const postMenuVisible = ref(false)
const postMenuTarget = ref<CommunityPost>()
const localMediaUrls = ref<Record<string, string>>({})
const mediaCacheGuard = createMomentMediaCacheGuard()
let imagePreviewInstance: ReturnType<typeof showImagePreview> | null = null

function mediaKey(post: Pick<CommunityPost, 'id'>, index: number): string {
  return `${post.id}:${index}`
}

function mediaSource(post: Pick<CommunityPost, 'id' | 'images' | 'mediaFileIds'>, index: number): string {
  const fileId = post.mediaFileIds?.[index]
  return fileId ? (localMediaUrls.value[mediaKey(post, index)] || '') : (post.images[index] || '')
}

function quotedMediaSource(quoted: NonNullable<CommunityPost['quotedPost']>, index: number): string {
  const fileId = quoted.mediaFileIds?.[index]
  return fileId ? (localMediaUrls.value[`quoted:${quoted.id}:${index}`] || '') : (quoted.images[index] || '')
}

async function warmPostMedia(post: CommunityPost): Promise<void> {
  const tasks = (post.images || []).map(async (source, index) => {
    const fileId = post.mediaFileIds?.[index]
    if (!fileId) return
    const kind = post.mediaTypes?.[index] === 'video' ? 'video' : 'image'
    const variant = kind === 'video' ? 'thumb' : 'preview'
    const key = mediaKey(post, index)
    if (localMediaUrls.value[key]) {
      mediaCacheGuard.onLoaded(fileId, variant)
      return
    }
    const stable = getStableMomentMedia(fileId, kind, variant)
    if (stable) {
      mediaCacheGuard.onLoaded(fileId, stable.variant)
      localMediaUrls.value = { ...localMediaUrls.value, [key]: stable.url }
      return
    }
    try {
      const cacheSource = kind === 'video' ? (source || fileDownloadUrl(fileId, 'thumb')) : fileDownloadUrl(fileId, 'preview')
      const cached = await cacheChatFile(kind, fileId, variant, cacheSource)
      if (cached) {
        mediaCacheGuard.onLoaded(fileId, variant)
        localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
      }
    } catch {
      if (kind === 'video') return
      try {
        const cached = await cacheChatFile('image', fileId, 'thumb', source || fileDownloadUrl(fileId, 'thumb'))
        if (cached) {
          mediaCacheGuard.onLoaded(fileId, 'thumb')
          localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
        }
      } catch { /* Keep a placeholder; explicit open retries through HTTP. */ }
    }
  })
  const quoted = post.quotedPost
  if (quoted?.mediaFileIds?.[0] && quoted.images?.[0]) {
    tasks.push((async () => {
      const quotedKind = quoted.mediaTypes?.[0] === 'video' ? 'video' : 'image'
      try {
        const quotedVariant = quotedKind === 'video' ? 'thumb' : 'preview'
        const quotedSource = quotedKind === 'video' ? quoted.images[0] || fileDownloadUrl(quoted.mediaFileIds![0], 'thumb') : fileDownloadUrl(quoted.mediaFileIds![0], 'preview')
        const quotedKey = `quoted:${quoted.id}:0`
        const stable = getStableMomentMedia(quoted.mediaFileIds![0], quotedKind, quotedVariant)
        if (stable) {
          mediaCacheGuard.onLoaded(quoted.mediaFileIds![0], stable.variant)
          localMediaUrls.value = { ...localMediaUrls.value, [quotedKey]: stable.url }
          return
        }
        const cached = await cacheChatFile(quotedKind, quoted.mediaFileIds![0], quotedVariant, quotedSource)
        if (cached) {
          mediaCacheGuard.onLoaded(quoted.mediaFileIds![0], quotedVariant)
          localMediaUrls.value = { ...localMediaUrls.value, [quotedKey]: cached }
        }
      } catch {
        try {
          const cached = await cacheChatFile(quotedKind, quoted.mediaFileIds![0], 'thumb', quoted.images[0] || fileDownloadUrl(quoted.mediaFileIds![0], 'thumb'))
          if (cached) {
            mediaCacheGuard.onLoaded(quoted.mediaFileIds![0], 'thumb')
            localMediaUrls.value = { ...localMediaUrls.value, [`quoted:${quoted.id}:0`]: cached }
          }
        } catch { /* placeholder */ }
      }
    })())
  }
  await Promise.all(tasks)
}

function clearLocalMediaUrls(): void {
  mediaCacheGuard.reset()
  localMediaUrls.value = {}
}

const posts = computed(() => item.value?.posts || [])
const canManage = computed(() => item.value?.my_role === 'OWNER' || item.value?.my_role === 'ADMIN')
const postMenuActions = computed(() => {
  const target = postMenuTarget.value
  if (!target) return []
  const actions: Array<{ name: string; color?: string }> = []
  if (canManage.value) actions.push({ name: target.pinned ? '取消置顶' : '置顶动态' })
  if (canAttemptDeletePost(target)) actions.push({ name: '删除动态', color: 'var(--pulse-danger)' })
  return actions
})
const commentApi = {
  add: async (postId: string, payload: { content?: string; replyToCommentId?: string; imageFileId?: string; imageUrl?: string }) =>
    addCommunityComment(postId, { content: payload.content, parentId: payload.replyToCommentId }),
  delete: deleteCommunityComment,
  like: toggleCommunityCommentLike,
}

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    item.value = await communityDetail(id)
    clearLocalMediaUrls()
    await Promise.all(posts.value.map((post) => warmPostMedia(post)))
  } finally {
    if (!silent) loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await load(true)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '刷新失败')
  } finally {
    refreshing.value = false
  }
}

async function join() {
  if (!item.value || joining.value) return
  agreementAccepted.value = false
  agreementVisible.value = true
  agreementLoading.value = true
  try {
    const agreement = await fetchSystemText('community_join_agreement')
    agreementTitle.value = agreement.title || '圈子加入协议'
    agreementContent.value = agreement.content || '平台暂未配置圈子加入协议，请联系管理员。'
  } catch (error) {
    agreementVisible.value = false
    showToast(error instanceof Error ? error.message : '圈子协议加载失败')
  } finally {
    agreementLoading.value = false
  }
}

async function submitJoin() {
  if (!item.value || joining.value) return
  if (!agreementAccepted.value) {
    showToast('请先勾选同意圈子加入协议')
    return
  }
  agreementVisible.value = false
  try {
    const needsApprovalFirst = Boolean(item.value.join_review_required) && item.value.join_request_status !== 'APPROVED'
    if (item.value.type === 'PAID' && !needsApprovalFirst) {
      await showConfirmDialog({
        title: '付费加入圈子',
        message: `加入将支付 ${(item.value.price / 100).toFixed(2)} PLU`,
        confirmButtonText: '继续加入',
      })
      const wallet = await fetchWallet()
      if (!wallet.hasPaymentPassword) {
        showToast('请先设置支付密码')
        void router.push('/wallet')
        return
      }
      payPasswordVisible.value = true
      return
    }
    await completeJoin('')
  } catch (error) {
    if (error instanceof Error) showToast(error.message)
  }
}

async function completeJoin(password: string) {
  if (!item.value || joining.value) return
  joining.value = true
  try {
    const result = await joinCommunity(id, password, true)
    payPasswordVisible.value = false
    showToast(result.pendingApproval ? '加入申请已提交，等待圈主或管理员审核' : '已加入圈子')
    await load()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加入圈子失败')
  } finally {
    joining.value = false
  }
}

function openPasswordSettings() {
  payPasswordVisible.value = false
  showToast('请到钱包设置支付密码')
  void router.push('/wallet')
}

async function leave() {
  if (!item.value || item.value.my_role === 'OWNER') return
  try {
    await showConfirmDialog({ title: '退出圈子', message: item.value.leave_review_required ? '提交后需要圈主或管理员审核，确定继续吗？' : '退出后将不能继续查看圈子内容，确定继续吗？' })
    const reason = window.prompt('请输入退出原因') || ''
    if (!reason.trim()) return showToast('请填写退出原因')
    const result = await leaveCommunity(id, reason)
    showToast(result.pendingApproval ? '退出申请已提交，等待审核' : '已退出圈子')
    if (result.left) void router.replace('/communities')
    else await load()
  } catch { /* cancelled */ }
}

function goBack() {
  smartBack(router, '/communities')
}

function openCompose() {
  if (!item.value?.canViewContent) {
    showToast('加入圈子后才能发布动态')
    return
  }
  void router.push(`/communities/${id}/compose`)
}

function openManage() {
  void router.push(`/communities/${id}/manage`)
}

function openPost(post: CommunityPost) {
  void router.push(`/communities/${id}/posts/${post.id}`)
}

async function forwardPost(post: CommunityPost) {
  const opinion = window.prompt('转发到本圈，并附上你的看法（可留空）', '')
  if (opinion === null) return
  if (opinion.trim().length > 500) {
    showToast('看法不能超过500字')
    return
  }
  try {
    await forwardCommunityPost(post.id, opinion)
    showToast('已转发到本圈')
    await load(true)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '转发失败')
  }
}

function openAuthor(post: CommunityPost) {
  const target = String(post.userId || '')
  if (!target) return
  void router.push(target === String(userStore.userId || '') ? '/app/me' : `/contacts/${target}`)
}

function formatTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (date.getFullYear() === new Date().getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function statusLabel(status: string) {
  if (status === 'PENDING') return '审核中'
  if (status === 'BLOCKED') return '已屏蔽'
  return ''
}

function canDeletePost(post: CommunityPost) {
  return post.canDelete || String(post.userId) === String(userStore.userId || '')
}

function canAttemptDeletePost(post: CommunityPost) {
  return canDeletePost(post) || post.canAttemptDelete
}

function protectedDeleteMessage(post: CommunityPost) {
  if (item.value?.my_role !== 'ADMIN' || String(post.userId) === String(userStore.userId || '')) return ''
  if (post.authorRole === 'OWNER') return '管理员不能删除圈主的动态。'
  if (post.authorRole === 'ADMIN') return '管理员不能删除其他管理员的动态。'
  return ''
}

function replacePost(next: Partial<CommunityPost> & { id: string }) {
  const list = item.value?.posts
  if (!list) return
  const index = list.findIndex((post) => post.id === next.id)
  if (index >= 0) list[index] = { ...list[index], ...next }
}

function sortPosts() {
  if (!item.value?.posts) return
  item.value.posts = [...item.value.posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.pinned && b.pinned) {
      const pinTime = new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime()
      if (pinTime) return pinTime
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

async function togglePostPinned(post: CommunityPost) {
  if (!canManage.value) return
  const next = !post.pinned
  try {
    const result = await setCommunityPostPinned(post.id, next)
    replacePost({ id: post.id, pinned: result.pinned, pinnedAt: result.pinned ? new Date().toISOString() : undefined })
    sortPosts()
    showToast(result.pinned ? '动态已置顶' : '已取消置顶')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '置顶操作失败')
  }
}

async function onLike(post: CommunityPost) {
  try {
    const result = await toggleCommunityLike(post.id)
    replacePost({ id: post.id, likedByMe: result.liked, likeCount: result.likeCount })
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败')
  }
}

async function onFavorite(post: CommunityPost) {
  if (post.favoritedByMe) {
    try {
      await showConfirmDialog({
        title: '取消收藏',
        message: '确定取消收藏这条圈子动态吗？',
        confirmButtonText: '取消收藏',
        confirmButtonColor: 'var(--pulse-danger, #ee0a24)',
      })
    } catch {
      return
    }
  }
  try {
    const result = await toggleCommunityFavorite(post.id)
    replacePost({ id: post.id, favoritedByMe: result.favorited })
    showToast(result.favorited ? '已收藏，可在“我－我的收藏”中查看' : '已取消收藏')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败')
  }
}

function openReport(post: CommunityPost) {
  reportPostId.value = post.id
  reportVisible.value = true
}

async function confirmDeletePost(post: CommunityPost) {
  try {
    await showConfirmDialog({
      title: '删除动态',
      message: '删除后无法恢复，确定删除这条动态吗？',
      confirmButtonText: '删除',
      confirmButtonColor: 'var(--pulse-danger)',
    })
  } catch {
    return
  }
  try {
    await deleteCommunityPost(post.id)
    if (item.value?.posts) item.value.posts = item.value.posts.filter((entry) => entry.id !== post.id)
    if (item.value) item.value.post_count = Math.max(0, item.value.post_count - 1)
    showToast('动态已删除')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败')
  }
}

function openPostMenu(post: CommunityPost) {
  if (!canManage.value && !canAttemptDeletePost(post)) return
  postMenuTarget.value = post
  postMenuVisible.value = true
}

async function onPostMenuSelect(action: { name: string }) {
  const target = postMenuTarget.value
  postMenuVisible.value = false
  postMenuTarget.value = undefined
  if (!target) return
  if (action.name === '置顶动态' || action.name === '取消置顶') {
    await togglePostPinned(target)
    return
  }
  if (action.name !== '删除动态') return
  const deniedMessage = protectedDeleteMessage(target)
  if (deniedMessage || !canDeletePost(target)) {
    await showDialog({ title: '无法删除', message: deniedMessage || '你没有权限删除这条动态。' })
    return
  }
  await confirmDeletePost(target)
}

async function toggleCommentBox(post: CommunityPost) {
  if (commentOpenId.value === post.id) {
    commentOpenId.value = ''
    return
  }
  if (!post.comments.length && post.commentCount > 0 && !loadingComments.value.has(post.id)) {
    loadingComments.value = new Set([...loadingComments.value, post.id])
    try {
      replacePost({ id: post.id, comments: await fetchCommunityComments(post.id) })
    } catch (error) {
      showToast(error instanceof Error ? error.message : '评论加载失败')
    } finally {
      const next = new Set(loadingComments.value)
      next.delete(post.id)
      loadingComments.value = next
    }
  }
  commentOpenId.value = post.id
}

function onCommentOpenChange(postId: string, open: boolean) {
  if (open) commentOpenId.value = postId
  else if (commentOpenId.value === postId) commentOpenId.value = ''
}

async function openMediaPreview(post: CommunityPost, index: number) {
  const fileId = post.mediaFileIds?.[index]
  const isVideo = post.mediaTypes?.[index] === 'video'
  const url = isVideo && fileId
    ? fileDownloadUrl(fileId, 'preview')
    : post.originalImages?.[index] || post.images[index] || (fileId ? fileDownloadUrl(fileId) : '')
  if (!url) return
  if (post.mediaTypes?.[index] === 'video' || isVideoUrl(url)) {
    await openMediaVideoPreview(url, { fileId, variant: 'preview' })
    return
  }
  const imageIndexes = (post.originalImages?.length ? post.originalImages : post.images)
    .map((_, mediaIndex) => mediaIndex)
    .filter((mediaIndex) => post.mediaTypes?.[mediaIndex] !== 'video')
  const images = await Promise.all(imageIndexes.map(async (mediaIndex) => {
    const source = post.originalImages?.[mediaIndex] || post.images[mediaIndex] || ''
    const id = post.mediaFileIds?.[mediaIndex]
    if (!id) return source
    try { return await cacheChatFile('image', id, 'original', source || fileDownloadUrl(id)) } catch { return '' }
  }))
  if (!images.some(Boolean)) return
  imagePreviewInstance = showImagePreview({
    images,
    startPosition: Math.max(0, imageIndexes.indexOf(index)),
    closeable: true,
    closeIconPosition: 'top-right',
    onClose: () => { imagePreviewInstance = null },
  })
}

function openLocationMap(post: CommunityPost) {
  const latitude = Number(post.latitude)
  const longitude = Number(post.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showToast('该动态没有可用的位置坐标')
    return
  }
  mapLocation.value = {
    latitude,
    longitude,
    name: post.locationName || '动态位置',
    address: post.locationAddress,
  }
  mapChooserVisible.value = true
}

function onNativeBack(event: Event) {
  if (!imagePreviewInstance) return
  event.preventDefault()
  imagePreviewInstance.close?.()
  imagePreviewInstance = null
}

onMounted(() => {
  window.addEventListener('pulse:native-back', onNativeBack)
  void load().catch((error) => showToast(error instanceof Error ? error.message : '圈子加载失败'))
})

onBeforeUnmount(() => {
  window.removeEventListener('pulse:native-back', onNativeBack)
  mediaCacheGuard.dispose()
})
</script>

<template>
  <div class="community-detail-page">
    <header class="page-header">
      <button type="button" class="header-icon" aria-label="返回" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios_new</span>
      </button>
      <h1>{{ item && item.status !== 'APPROVED' ? '审核状态' : '圈子详情' }}</h1>
      <div v-if="!item || item.status === 'APPROVED'" class="header-actions">
        <button type="button" class="header-icon share-button" aria-label="分享圈子" @click="shareVisible = true">
          <span class="material-symbols-outlined">share</span>
        </button>
        <button v-if="canManage" type="button" class="header-icon" aria-label="管理中心" @click="openManage">
          <span class="material-symbols-outlined">settings</span>
          <sup v-if="item?.pending_post_count || item?.profile_review_unread_count" class="manage-badge">{{ Math.min(99, Number(item?.pending_post_count || 0) + Number(item?.profile_review_unread_count || 0)) }}</sup>
        </button>
      </div>
    </header>

    <van-pull-refresh v-model="refreshing" class="detail-pull" success-text="刷新成功" @refresh="onPullRefresh">
      <div v-if="loading" class="page-state">
        <van-loading vertical>正在加载圈子…</van-loading>
      </div>

      <template v-else-if="item">
      <section v-if="item.status !== 'APPROVED'" class="review-state-card">
        <span class="review-state-icon material-symbols-outlined">
          {{ item.status === 'PENDING' ? 'hourglass_top' : item.status === 'REJECTED' ? 'error' : item.status === 'DISSOLVED' ? 'delete_forever' : 'lock' }}
        </span>
        <h2>{{ item.status === 'PENDING' ? '圈子正在审核中' : item.status === 'REJECTED' ? '圈子审核未通过' : item.status === 'DISSOLVED' ? '圈子已解散' : '圈子已被关闭' }}</h2>
        <p v-if="item.status === 'PENDING'">后台正在审核“{{ item.name }}”，通过后才能进入圈子详情。</p>
        <p v-else-if="item.status === 'REJECTED'">{{ item.reject_reason || '圈子资料暂未通过审核，请修改后重新提交。' }}</p>
        <p v-else-if="item.status === 'DISSOLVED'">该圈子已由圈主解散，所有成员均已退出。</p><p v-else>该圈子当前未开启，暂时无法查看详情和动态。</p>
      </section>

      <section v-else class="community-hero">
        <div class="hero-glow" />
        <div class="hero-main">
          <div class="community-avatar">
            <img v-if="item.avatar" :src="resolveFileUrl(item.avatar)" alt="" />
            <span v-else>{{ item.name.slice(0, 1) }}</span>
          </div>
          <div class="hero-copy">
            <div class="hero-title-row">
              <h2>{{ item.name }}</h2>
              <span class="community-type">{{ item.type === 'PAID' ? '付费圈子' : '兴趣圈子' }}</span>
            </div>
            <p>{{ item.description || '圈主还没有填写圈子介绍' }}</p>
            <div class="owner-line">
              <span class="material-symbols-outlined">verified_user</span>
              圈主 {{ item.owner_name || '未知' }}
            </div>
          </div>
        </div>

        <div class="hero-stats" aria-label="圈子数据">
          <div><strong>{{ item.member_count }}</strong><span>成员</span></div>
          <i />
          <div><strong>{{ item.post_count }}</strong><span>动态</span></div>
          <i />
          <div><strong>{{ item.topic || '其他' }}</strong><span>主题</span></div>
        </div>

        <div class="hero-actions">
          <button v-if="!item.joined" type="button" class="primary-action" :disabled="joining || item.join_request_status === 'PENDING'" @click="join">
            <van-loading v-if="joining" size="19px" />
            <span v-else class="material-symbols-outlined">group_add</span>
            {{ item.join_request_status === 'PENDING' ? '等待审核' : item.join_request_status === 'APPROVED' ? (item.type === 'PAID' ? `${(item.price / 100).toFixed(2)} PLU 完成加入` : '审核已通过，加入圈子') : item.join_review_required ? '申请加入圈子' : item.type === 'PAID' ? `${(item.price / 100).toFixed(2)} PLU 加入` : '加入圈子' }}
          </button>
          <button v-else type="button" class="primary-action" @click="openCompose">
            <span class="material-symbols-outlined">edit_square</span>
            发布动态
          </button>
          <button v-if="canManage" type="button" class="secondary-action" @click="openManage">
            <span class="material-symbols-outlined">tune</span>
            管理中心
            <sup v-if="item.pending_post_count || item.profile_review_unread_count" class="inline-manage-badge">{{ Math.min(99, Number(item.pending_post_count || 0) + Number(item.profile_review_unread_count || 0)) }}</sup>
          </button>
          <button v-if="item.joined && item.my_role !== 'OWNER'" type="button" class="secondary-action leave-action" :disabled="item.leave_request_status === 'PENDING'" @click="leave">
            <span class="material-symbols-outlined">logout</span>
            {{ item.leave_request_status === 'PENDING' ? '等待退出审核' : '退出圈子' }}
          </button>
        </div>
      </section>

      <CommunityAnnouncementBar v-if="item.status === 'APPROVED'" :text="item.announcement" />

      <section v-if="item.status === 'APPROVED'" class="rules-section">
        <details class="rules-card">
          <summary>
            <span class="rules-icon material-symbols-outlined">gavel</span>
            <span><strong>圈子规则</strong><small>共同维护友善、真实的交流空间</small></span>
            <span class="rules-arrow material-symbols-outlined">expand_more</span>
          </summary>
          <p>{{ item.rules || '圈主暂未设置其他规则，请遵守社区规范并友善交流。' }}</p>
        </details>
        <div v-if="!item.canViewContent" class="locked-card">
          <span class="material-symbols-outlined">lock</span>
          <div><strong>加入后查看全部内容</strong><p>圈子动态、评论和成员互动仅对成员开放</p></div>
        </div>
      </section>

      <main v-if="item.canViewContent" class="feed-section">
        <div class="feed-heading">
          <div><h3>圈子动态</h3><span>共 {{ item.post_count }} 条</span></div>
          <button type="button" aria-label="发布动态" @click="openCompose">
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>

        <div class="feed-list">
          <article
            v-for="post in posts"
            :key="post.id"
            class="post-card"
            role="link"
            tabindex="0"
            @click="openPost(post)"
            @keydown.enter.self="openPost(post)"
          >
            <header class="post-author">
              <button type="button" class="author-button" aria-label="查看发布者资料" @click.stop="openAuthor(post)">
                <span class="post-avatar-wrap">
                  <img v-if="post.avatarUrl" :src="post.avatarUrl" alt="" class="post-avatar" />
                  <span v-else class="post-avatar initials">{{ post.nickname.slice(0, 1) }}</span>
                  <i v-if="String(post.userId) === String(userStore.userId || '')" class="mine-avatar-badge">我</i>
                </span>
                <span class="post-author-info">
                  <b>{{ post.nickname }}</b>
                  <small>{{ formatTime(post.createdAt) }}</small>
                </span>
              </button>
              <span v-if="post.pinned" class="pinned-chip"><span class="material-symbols-outlined">keep</span>置顶</span>
              <span v-if="statusLabel(post.status)" class="status-chip">{{ statusLabel(post.status) }}</span>
              <button
                v-if="canManage || canAttemptDeletePost(post)"
                type="button"
                class="more-button"
                aria-label="动态操作"
                @click.stop="openPostMenu(post)"
              >
                <span class="material-symbols-outlined">more_horiz</span>
              </button>
            </header>

            <p v-if="post.content" class="post-content">{{ post.content }}</p>

            <button v-if="post.quotedPost" type="button" class="quoted-post-card" @click.stop="router.push(`/communities/${id}/posts/${post.quotedPost.id}`)">
              <span class="quoted-label"><span class="material-symbols-outlined">format_quote</span>引用 {{ post.quotedPost.nickname }} 的动态</span>
              <span v-if="post.quotedPost.content" class="quoted-content">{{ post.quotedPost.content }}</span>
              <img v-if="quotedMediaSource(post.quotedPost, 0)" :src="quotedMediaSource(post.quotedPost, 0)" alt="" class="quoted-image" />
            </button>

            <div v-if="post.images.length" class="media-grid" :class="`grid-${Math.min(post.images.length, 4)}`">
              <button
                v-for="(_, index) in post.images.slice(0, 9)"
                :key="`${post.id}-${index}`"
                type="button"
                class="media-thumb"
                @click.stop="openMediaPreview(post, index)"
              >
                <img v-if="post.mediaTypes[index] === 'video' && mediaSource(post, index)" :src="mediaSource(post, index)" alt="视频封面" />
                <img v-else-if="mediaSource(post, index)" :src="mediaSource(post, index)" alt="" />
                <span v-if="post.mediaTypes[index] === 'video' || isVideoUrl(mediaSource(post, index))" class="video-badge material-symbols-outlined">play_circle</span>
                <span v-if="index === 8 && post.images.length > 9" class="media-more">+{{ post.images.length - 9 }}</span>
              </button>
            </div>

            <button v-if="post.locationName" type="button" class="location-row" @click.stop="openLocationMap(post)">
              <span class="material-symbols-outlined">location_on</span>
              <span class="location-copy"><strong>{{ post.locationName }}</strong><small v-if="post.locationAddress">{{ post.locationAddress }}</small></span>
              <span class="material-symbols-outlined location-open">open_in_new</span>
            </button>

            <div class="post-actions" @click.stop>
              <button type="button" class="action-button" :class="{ active: post.likedByMe }" @click="onLike(post)">
                <span class="material-symbols-outlined">favorite</span><span>{{ post.likeCount || '赞' }}</span>
              </button>
              <button type="button" class="action-button" @click="toggleCommentBox(post)">
                <span class="material-symbols-outlined">chat_bubble</span><span>{{ post.commentCount || '评论' }}</span>
              </button>
              <button type="button" class="action-button" :class="{ active: post.favoritedByMe }" @click="onFavorite(post)">
                <span class="material-symbols-outlined">bookmark</span><span>{{ post.favoritedByMe ? '已收藏' : '收藏' }}</span>
              </button>
              <button type="button" class="action-button" @click="forwardPost(post)">
                <span class="material-symbols-outlined">repeat</span><span>转发</span>
              </button>
              <button type="button" class="action-button report-button" @click="openReport(post)">
                <span class="material-symbols-outlined">flag</span><span>举报</span>
              </button>
            </div>

            <div class="post-comments" @click.stop>
              <MomentComments
                :item="post"
                :my-user-id="String(userStore.userId || '')"
                :open="commentOpenId === post.id"
                :supports-images="false"
                :comment-api="commentApi"
                @update:item="replacePost"
                @update:open="(open) => onCommentOpenChange(post.id, open)"
              />
            </div>
          </article>
        </div>

        <div v-if="!posts.length" class="empty-state">
          <div class="empty-visual">
            <span class="material-symbols-outlined">forum</span>
            <i /><i /><i />
          </div>
          <h3>这里正在等待第一条动态</h3>
          <p>分享你的想法、图片或所在位置，和圈友开启讨论。</p>
          <button type="button" @click="openCompose">
            <span class="material-symbols-outlined">edit_square</span>发布第一条动态
          </button>
        </div>
      </main>
      </template>

      <div v-else class="page-state">
        <span class="material-symbols-outlined state-icon">error</span>
        <p>圈子不存在或已停止开放</p>
        <button type="button" @click="goBack">返回圈子广场</button>
      </div>
    </van-pull-refresh>

    <CommunityReportDialog
      v-model:show="reportVisible"
      target-type="POST"
      :target-id="reportPostId"
    />
    <ShareContactCard
      v-if="item"
      v-model:show="shareVisible"
      :card="{
        cardType: 'community',
        communityId: String(item.id),
        nickname: item.name,
        avatarUrl: item.avatar,
        description: item.description,
        topic: item.topic,
        memberCount: item.member_count,
        postCount: item.post_count,
        communityType: item.type,
        price: item.price,
      }"
    />
    <MapAppChooser v-model:show="mapChooserVisible" :location="mapLocation" />
    <van-action-sheet
      v-model:show="postMenuVisible"
      title="动态操作"
      :actions="postMenuActions"
      cancel-text="取消"
      close-on-click-action
      @select="onPostMenuSelect"
      @cancel="postMenuTarget = undefined"
    />
    <van-popup v-model:show="agreementVisible" position="bottom" round closeable teleport="body" :close-on-click-overlay="!joining" class="join-agreement-popup">
      <section class="join-agreement-sheet">
        <header><span class="material-symbols-outlined">gavel</span><div><h2>{{ agreementTitle }}</h2><p>加入圈子前请阅读并确认</p></div></header>
        <div v-if="agreementLoading" class="agreement-loading"><van-loading vertical>协议加载中…</van-loading></div>
        <div v-else class="agreement-body">{{ agreementContent }}</div>
        <label class="agreement-check"><input v-model="agreementAccepted" type="checkbox" :disabled="agreementLoading || joining" /><span>我已阅读并同意《{{ agreementTitle }}》</span></label>
        <button type="button" class="agreement-submit" :disabled="agreementLoading || joining" @click="submitJoin">{{ joining ? '加入中…' : '同意并继续' }}</button>
      </section>
    </van-popup>
    <PaymentConfirmDialog
      v-model="payPasswordVisible"
      :amount="item?.price || 0"
      description="加入圈子"
      :submitting="joining"
      @confirm="completeJoin"
      @forgot="openPasswordSettings"
    />
  </div>
</template>

<style scoped>
.community-detail-page {
  min-height: 100%;
  min-height: 100dvh;
  padding-bottom: calc(36px + env(safe-area-inset-bottom));
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}
.detail-pull { min-height: calc(100dvh - 56px - var(--pulse-header-pad-top)); }

.page-header {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: 56px;
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 80px;
  align-items: center;
  padding: var(--pulse-header-pad-top) 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--pulse-divider) 72%, transparent);
  background: color-mix(in srgb, var(--pulse-page-bg) 88%, transparent);
  backdrop-filter: blur(18px) saturate(1.25);
}
.page-header > .header-icon { grid-column: 1; }
.page-header h1 { grid-column: 2; margin: 0; text-align: center; font-size: 17px; font-weight: 650; letter-spacing: .01em; }
.header-actions { grid-column: 3; display: flex; width: 80px; align-items: center; justify-content: flex-end; }
.header-icon,
.header-spacer { width: 40px; height: 40px; flex: 0 0 40px; }
.header-icon { display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: var(--pulse-surface-high); color: var(--pulse-text); }
.header-actions .header-icon { background: transparent; }
.header-icon .material-symbols-outlined { font-size: 20px; }
.share-button { color: var(--pulse-primary); }
.join-agreement-sheet{padding:24px 18px calc(18px + env(safe-area-inset-bottom,0px));background:var(--pulse-surface-container);color:var(--pulse-text)}.join-agreement-sheet header{display:flex;align-items:center;gap:12px}.join-agreement-sheet header>span{display:grid;width:42px;height:42px;place-items:center;border-radius:13px;background:color-mix(in srgb,var(--pulse-primary) 13%,var(--pulse-surface-high));color:var(--pulse-primary)}.join-agreement-sheet h2{margin:0;font-size:18px}.join-agreement-sheet header p{margin:4px 0 0;color:var(--pulse-text-secondary);font-size:12px}.agreement-body{max-height:38vh;margin-top:18px;padding:14px;border:1px solid var(--pulse-divider);border-radius:14px;overflow-y:auto;white-space:pre-wrap;color:var(--pulse-text-secondary);font-size:13px;line-height:1.75}.agreement-loading{display:grid;min-height:180px;place-items:center;color:var(--pulse-text-secondary)}.agreement-check{display:flex;align-items:flex-start;gap:8px;margin:16px 2px;color:var(--pulse-text);font-size:13px;line-height:1.5}.agreement-check input{width:17px;height:17px;flex:0 0 17px;margin:1px 0 0;accent-color:var(--pulse-primary)}.agreement-submit{width:100%;height:46px;border:0;border-radius:14px;background:var(--pulse-primary-gradient,var(--pulse-primary));color:var(--pulse-on-primary);font-size:14px;font-weight:650}.agreement-submit:disabled{opacity:.55}

.review-state-card { margin: 24px 16px; padding: 34px 24px; border: 1px solid var(--pulse-divider); border-radius: 22px; background: var(--pulse-surface-container); text-align: center; }
.review-state-icon { display: grid; width: 62px; height: 62px; margin: 0 auto 16px; place-items: center; border-radius: 19px; background: color-mix(in srgb, var(--pulse-primary) 13%, var(--pulse-surface-high)); color: var(--pulse-primary); font-size: 32px; }
.review-state-card h2 { margin: 0; font-size: 20px; }
.review-state-card p { margin: 11px 0 0; color: var(--pulse-text-secondary); font-size: 13px; line-height: 1.75; }

.community-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  margin: 14px 14px 0;
  padding: 22px 18px 18px;
  border: 1px solid color-mix(in srgb, var(--pulse-primary) 18%, var(--pulse-divider));
  border-radius: 26px;
  background:
    radial-gradient(circle at 85% 2%, color-mix(in srgb, var(--pulse-primary) 24%, transparent), transparent 42%),
    linear-gradient(145deg, var(--pulse-surface-container), color-mix(in srgb, var(--pulse-surface-high) 76%, var(--pulse-primary) 7%));
  box-shadow: 0 18px 44px color-mix(in srgb, var(--pulse-text) 9%, transparent);
}
.hero-glow { position: absolute; z-index: -1; top: -86px; right: -54px; width: 210px; height: 210px; border-radius: 50%; background: color-mix(in srgb, var(--pulse-primary) 16%, transparent); filter: blur(12px); }
.hero-main { display: flex; align-items: center; gap: 15px; }
.community-avatar { width: 76px; height: 76px; flex: 0 0 76px; display: grid; place-items: center; overflow: hidden; border: 3px solid color-mix(in srgb, var(--pulse-primary) 28%, var(--pulse-surface-container)); border-radius: 23px; background: var(--pulse-surface-high); color: var(--pulse-primary); font-size: 29px; font-weight: 750; box-shadow: 0 10px 26px color-mix(in srgb, var(--pulse-text) 14%, transparent); }
.community-avatar img { width: 100%; height: 100%; object-fit: cover; }
.hero-copy { min-width: 0; flex: 1; }
.hero-title-row { display: flex; align-items: center; gap: 8px; }
.hero-title-row h2 { min-width: 0; margin: 0; overflow: hidden; font-size: 22px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.community-type { flex: 0 0 auto; padding: 3px 7px; border-radius: 8px; background: color-mix(in srgb, var(--pulse-primary) 14%, transparent); color: var(--pulse-primary); font-size: 10px; font-weight: 600; }
.hero-copy > p { display: -webkit-box; margin: 7px 0 0; overflow: hidden; color: var(--pulse-text-secondary); font-size: 13px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.owner-line { display: flex; align-items: center; gap: 4px; margin-top: 7px; color: var(--pulse-text-secondary); font-size: 11px; }
.owner-line .material-symbols-outlined { color: var(--pulse-primary); font-size: 15px; }

.hero-stats { display: grid; grid-template-columns: 1fr 1px 1fr 1px 1.35fr; align-items: center; margin-top: 21px; padding: 13px 10px; border-radius: 16px; background: color-mix(in srgb, var(--pulse-surface-high) 76%, transparent); }
.hero-stats div { min-width: 0; text-align: center; }
.hero-stats strong,
.hero-stats span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hero-stats strong { font-size: 16px; line-height: 1.2; }
.hero-stats span { margin-top: 4px; color: var(--pulse-text-secondary); font-size: 10px; }
.hero-stats i { width: 1px; height: 24px; background: var(--pulse-divider); }
.hero-actions { display: flex; gap: 9px; margin-top: 14px; }
.primary-action,
.secondary-action { position: relative; min-width: 0; height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 18px; border: 0; border-radius: 15px; font-size: 14px; font-weight: 650; white-space: nowrap; }
.primary-action { flex: 1.35; background: var(--pulse-primary-gradient, var(--pulse-primary)); color: var(--pulse-on-primary); }
.secondary-action { flex: 1; background: var(--pulse-surface-high); color: var(--pulse-text); }
.primary-action .material-symbols-outlined,
.secondary-action .material-symbols-outlined { font-size: 19px; }

.rules-section { padding: 12px 14px 0; }
.rules-card,
.locked-card { border: 1px solid var(--pulse-divider); border-radius: 18px; background: var(--pulse-surface-container); }
.rules-card summary { display: flex; align-items: center; gap: 11px; padding: 14px; list-style: none; cursor: pointer; }
.rules-card summary::-webkit-details-marker { display: none; }
.rules-icon { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--pulse-primary) 13%, var(--pulse-surface-high)); color: var(--pulse-primary); font-size: 20px; }
.rules-card summary > span:nth-child(2) { min-width: 0; flex: 1; }
.rules-card strong,
.rules-card small { display: block; }
.rules-card strong { font-size: 14px; }
.rules-card small { margin-top: 3px; color: var(--pulse-text-secondary); font-size: 11px; }
.rules-arrow { color: var(--pulse-text-secondary); transition: transform .2s ease; }
.rules-card[open] .rules-arrow { transform: rotate(180deg); }
.rules-card > p { margin: 0 14px 14px; padding: 13px 14px; border-radius: 13px; background: var(--pulse-surface-high); color: var(--pulse-text-secondary); font-size: 13px; line-height: 1.65; white-space: pre-wrap; }
.locked-card { display: flex; align-items: center; gap: 12px; margin-top: 10px; padding: 16px; }
.locked-card > .material-symbols-outlined { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: var(--pulse-surface-high); color: var(--pulse-primary); }
.locked-card strong { font-size: 14px; }
.locked-card p { margin: 4px 0 0; color: var(--pulse-text-secondary); font-size: 12px; }

.feed-section { padding-top: 22px; }
.feed-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 18px 9px; }
.feed-heading > div { display: flex; align-items: baseline; gap: 8px; }
.feed-heading h3 { margin: 0; font-size: 18px; }
.feed-heading span { color: var(--pulse-text-secondary); font-size: 11px; }
.feed-heading button { width: 34px; height: 34px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: var(--pulse-surface-high); color: var(--pulse-primary); }
.feed-heading button .material-symbols-outlined { font-size: 20px; }
.feed-list { display: flex; flex-direction: column; gap: 11px; padding: 0 14px; }
.post-card { padding: 16px; border: 1px solid color-mix(in srgb, var(--pulse-divider) 88%, transparent); border-radius: 20px; outline: none; background: var(--pulse-surface-container); box-shadow: 0 8px 24px color-mix(in srgb, var(--pulse-text) 5%, transparent); cursor: pointer; }
.post-card:focus-visible { border-color: var(--pulse-primary); }
.post-author { display: flex; align-items: center; gap: 10px; }
.author-button { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; padding: 0; overflow: hidden; border: 0; background: transparent; color: inherit; text-align: left; }
.post-avatar { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; border-radius: 50%; background: var(--pulse-surface-high); object-fit: cover; }
.post-avatar.initials { color: var(--pulse-primary); font-weight: 700; }
.post-avatar-wrap{position:relative;width:42px;height:42px;flex:0 0 42px}.mine-avatar-badge{position:absolute;right:-2px;bottom:-2px;display:grid;min-width:17px;height:17px;box-sizing:border-box;place-items:center;padding:0 3px;border:2px solid var(--pulse-surface-container);border-radius:999px;background:var(--pulse-primary);color:var(--pulse-on-primary);font-size:9px;font-style:normal;font-weight:700}.header-icon{position:relative}.manage-badge{position:absolute;top:2px;right:1px;display:grid;min-width:15px;height:15px;place-items:center;padding:0 3px;border-radius:999px;background:var(--pulse-danger,#df4242);color:#fff;font-size:9px;font-style:normal;line-height:1}.inline-manage-badge{position:absolute;top:-7px;right:-5px;display:grid;min-width:16px;height:16px;box-sizing:border-box;place-items:center;padding:0 3px;border-radius:999px;background:var(--pulse-danger,#df4242);color:#fff;font-size:9px;font-style:normal;line-height:1}
.post-author-info { min-width: 0; flex: 1; }
.post-author-info b,
.post-author-info small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.post-author-info b { font-size: 14px; }
.post-author-info small { margin-top: 3px; color: var(--pulse-text-secondary); font-size: 11px; }
.status-chip { padding: 4px 7px; border-radius: 8px; background: color-mix(in srgb, var(--pulse-primary) 13%, transparent); color: var(--pulse-primary); font-size: 10px; }
.pinned-chip { display: inline-flex; align-items: center; gap: 2px; padding: 4px 7px; border-radius: 8px; background: color-mix(in srgb, #f59e0b 14%, var(--pulse-surface-high)); color: #d97706; font-size: 10px; white-space: nowrap; }
.pinned-chip .material-symbols-outlined { font-size: 13px; }
.more-button { width: 34px; height: 34px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--pulse-text-secondary); }
.post-content { margin: 13px 0 0; font-size: var(--pulse-content-font-size, 15px); line-height: 1.68; white-space: pre-wrap; word-break: break-word; }
.media-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 12px; overflow: hidden; border-radius: 14px; }
.media-grid.grid-1 { grid-template-columns: minmax(0, 1fr); max-width: 430px; }
.media-grid.grid-2,
.media-grid.grid-4 { grid-template-columns: repeat(2, 1fr); }
.media-thumb { position: relative; aspect-ratio: 1; min-width: 0; overflow: hidden; padding: 0; border: 0; background: var(--pulse-surface-high); }
.grid-1 .media-thumb { aspect-ratio: 16 / 10; }
.media-thumb img,
.media-thumb video { width: 100%; height: 100%; display: block; object-fit: cover; }
.video-badge,
.media-more { position: absolute; inset: 0; display: grid; place-items: center; color: var(--pulse-on-primary); text-shadow: 0 2px 8px color-mix(in srgb, var(--pulse-text) 60%, transparent); }
.video-badge { font-size: 38px; }
.media-more { background: color-mix(in srgb, var(--pulse-text) 58%, transparent); font-size: 22px; font-weight: 700; }
.location-row { display: flex; align-items: center; gap: 7px; width: fit-content; max-width: 100%; margin-top: 11px; padding: 7px 10px; border: 0; border-radius: 11px; background: color-mix(in srgb, var(--pulse-primary) 9%, var(--pulse-surface-high)); color: var(--pulse-primary); text-align: left; }
.location-row > .material-symbols-outlined { flex: 0 0 auto; font-size: 17px; }
.location-row > .location-copy { min-width: 0; }
.location-row strong,
.location-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.location-row strong { font-size: 12px; }
.location-row small { max-width: 250px; margin-top: 2px; color: var(--pulse-text-secondary); font-size: 10px; }
.location-row > .location-open { margin-left: 2px; color: var(--pulse-text-secondary); font-size: 15px; }
.post-actions { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 14px; padding-top: 11px; border-top: 1px solid var(--pulse-divider); }
.quoted-post-card { display: flex; position: relative; width: 100%; flex-direction: column; gap: 6px; margin-top: 12px; padding: 11px 12px; border: 1px solid var(--pulse-divider); border-radius: 13px; background: var(--pulse-surface-high); color: var(--pulse-text); text-align: left; }
.quoted-label { display: flex; align-items: center; gap: 4px; color: var(--pulse-primary); font-size: 11px; font-weight: 650; }
.quoted-label .material-symbols-outlined { font-size: 16px; }
.quoted-content { display: -webkit-box; overflow: hidden; color: var(--pulse-text-secondary); font-size: 12px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.quoted-image { width: 46px; height: 46px; margin-top: 2px; border-radius: 8px; object-fit: cover; }
.action-button { min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 5px 2px; border: 0; background: transparent; color: var(--pulse-text-secondary); font-size: 11px; }
.action-button .material-symbols-outlined { font-size: 18px; }
.action-button.active { color: var(--pulse-primary); }
.report-button { border-left: 1px solid var(--pulse-divider); }
.post-comments { cursor: default; }

.empty-state { margin: 0 14px; padding: 48px 24px; border: 1px dashed var(--pulse-divider); border-radius: 22px; background: var(--pulse-surface-container); text-align: center; }
.empty-visual { position: relative; width: 92px; height: 72px; display: grid; place-items: center; margin: 0 auto; border-radius: 24px; background: color-mix(in srgb, var(--pulse-primary) 10%, var(--pulse-surface-high)); color: var(--pulse-primary); }
.empty-visual > span { font-size: 39px; }
.empty-visual i { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: var(--pulse-primary); opacity: .35; }
.empty-visual i:nth-child(2) { top: 13px; left: 14px; }
.empty-visual i:nth-child(3) { top: 10px; right: 17px; }
.empty-visual i:nth-child(4) { right: 12px; bottom: 12px; }
.empty-state h3 { margin: 18px 0 0; font-size: 17px; }
.empty-state p { max-width: 300px; margin: 7px auto 18px; color: var(--pulse-text-secondary); font-size: 13px; line-height: 1.55; }
.empty-state button,
.page-state button { display: inline-flex; align-items: center; gap: 6px; min-height: 42px; padding: 0 17px; border: 0; border-radius: 21px; background: var(--pulse-primary-gradient, var(--pulse-primary)); color: var(--pulse-on-primary); font-weight: 600; }
.empty-state button .material-symbols-outlined { font-size: 18px; }
.page-state { min-height: 58dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 36px 20px; color: var(--pulse-text-secondary); text-align: center; }
.state-icon { color: var(--pulse-primary); font-size: 40px; }
.page-state p { margin: 10px 0 18px; }
button { font: inherit; cursor: pointer; }
button:disabled { opacity: .56; cursor: default; }

@media (max-width: 360px) {
  .community-hero { margin-inline: 10px; padding-inline: 14px; }
  .community-avatar { width: 66px; height: 66px; flex-basis: 66px; border-radius: 20px; }
  .hero-title-row { align-items: flex-start; flex-direction: column; gap: 4px; }
  .hero-title-row h2 { max-width: 100%; font-size: 20px; }
  .rules-section,
  .feed-list { padding-inline: 10px; }
  .feed-heading { padding-inline: 14px; }
  .action-button { gap: 3px; }
}
</style>
