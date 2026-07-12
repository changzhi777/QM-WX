// pages/feed/index.ts — 运动动态（V0.1.30 + V0.1.32 onTapUser + V0.1.36 topic/video/share）
import { api } from '../../services/api';

interface FeedItem {
  id: string;
  content: string;
  images: string[];
  distanceKm: number | null;
  topic: string | null; // V0.1.36 话题
  videoUrl: string | null; // V0.1.36 外部视频链接
  shoe: { id: string; brand: string; model: string; nickname: string | null; currentKm: number } | null; // V0.1.136
  likeCount: number;
  commentCount: number;
  createdAt: string;
  user: { id: string; nickname: string | null; avatarUrl: string | null };
  liked: boolean;
}

interface FeedListRes {
  list: FeedItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

Page({
  data: {
    feeds: [] as FeedItem[],
    loading: false,
    publishing: false,
    publishVisible: false,
    publishContent: '',
    publishTopic: '', // V0.1.36 话题
    publishVideo: '', // V0.1.36 视频链接
    publishImages: [] as string[], // V0.1.136 图片
    publishShoeId: '', // V0.1.136 关联跑鞋
    publishShoes: [] as Array<{ id: string; brand: string; model: string; nickname: string | null; currentKm: number }>, // V0.1.136
    commentVisible: false,
    commentFeedId: '',
    commentContent: '',
    page: 1,
    hasMore: false,
  },

  onShow() {
    this.setData({ feeds: [], page: 1 });
    this.loadFeeds();
  },

  /** V0.1.36 转发微信群（button open-type="share" 触发）*/
  onShareAppMessage() {
    return {
      title: '来青沐运动，一起奔跑！🏃',
      path: '/pages/feed/index',
    };
  },

  /** 拉取动态流（feed.list） */
  async loadFeeds() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await api.call<FeedListRes>('feed', 'list', {
        page: this.data.page,
        pageSize: 20,
      });
      this.setData({
        feeds: this.data.page === 1 ? res.list : [...this.data.feeds, ...res.list],
        hasMore: res.hasMore,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadFeeds();
    }
  },

  /** 发布动态（V0.1.36 +topic +videoUrl + V0.1.136 +images +shoeId） */
  async onPublish() {
    this.setData({
      publishVisible: true,
      publishContent: '',
      publishTopic: '',
      publishVideo: '',
      publishImages: [],
      publishShoeId: '',
      publishShoes: [],
    });
    // V0.1.136 加载用户 active 跑鞋
    try {
      const r = await api.call<{ shoes: Array<{ id: string; brand: string; model: string; nickname: string | null; currentKm: number }> }>(
        'feed',
        'shoesForPicker',
        {},
      );
      this.setData({ publishShoes: r.shoes });
    } catch {
      // 加载失败不影响发布
    }
  },

  /** V0.1.136 选择图片（wx.chooseMedia 限 9 张） */
  async onPickImages() {
    const current = this.data.publishImages || [];
    const remaining = 9 - current.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多 9 张', icon: 'none' });
      return;
    }
    try {
      const r = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      });
      const newUrls = r.tempFiles.map((f) => f.tempFilePath);
      this.setData({ publishImages: [...current, ...newUrls].slice(0, 9) });
    } catch (e) {
      console.error('[feed.publish] chooseMedia failed', e);
    }
  },

  /** V0.1.136 删除已选图片 */
  onRemoveImage(e: WechatMiniprogram.TouchEvent) {
    const idx = e.currentTarget.dataset.idx as number;
    const newImages = [...this.data.publishImages];
    newImages.splice(idx, 1);
    this.setData({ publishImages: newImages });
  },

  /** V0.1.136 选择跑鞋 */
  onPickShoe(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset.id as string) || '';
    this.setData({ publishShoeId: id });
  },
  onInputPublish(e: WechatMiniprogram.Input) {
    this.setData({ publishContent: e.detail.value });
  },
  onInputPublishTopic(e: WechatMiniprogram.Input) {
    this.setData({ publishTopic: e.detail.value });
  },
  onInputPublishVideo(e: WechatMiniprogram.Input) {
    this.setData({ publishVideo: e.detail.value });
  },
  async onSubmitPublish() {
    const content = this.data.publishContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    this.setData({ publishing: true });
    try {
      const topic = this.data.publishTopic.trim() || undefined;
      const videoUrl = this.data.publishVideo.trim() || undefined;
      const shoeId = this.data.publishShoeId || undefined;
      const images = this.data.publishImages || [];
      // V0.1.136 上传图片到 OSS（MVP：直接传临时路径，V0.1.13X 待替换 uploadFile）
      await api.call('feed', 'publish', { content, images, topic, videoUrl, shoeId });
      this.setData({
        publishing: false,
        publishVisible: false,
        publishContent: '',
        publishTopic: '',
        publishVideo: '',
        page: 1,
        feeds: [],
      });
      wx.showToast({ title: '已发布', icon: 'success' });
      this.loadFeeds();
    } catch {
      this.setData({ publishing: false });
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
  },
  closePublish() {
    this.setData({ publishVisible: false });
  },

  /** V0.1.36 点话题标签 → 跳话题页 */
  onTapTopic(e: WechatMiniprogram.TouchEvent) {
    const topic = e.currentTarget.dataset.topic as string;
    if (topic) wx.navigateTo({ url: `/pages/topic/index?topic=${encodeURIComponent(topic)}` });
  },

  /** 点赞/取消（乐观更新） */
  async onToggleLike(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const feed = this.data.feeds.find((f) => f.id === id);
    if (!feed) return;
    const action = feed.liked ? 'unlike' : 'like';
    const original = this.data.feeds;
    // 乐观更新
    this.setData({
      feeds: this.data.feeds.map((f) =>
        f.id === id ? { ...f, liked: !f.liked, likeCount: f.likeCount + (f.liked ? -1 : 1) } : f,
      ),
    });
    try {
      await api.call('feed', action, { feedId: id });
    } catch {
      this.setData({ feeds: original }); // 回滚
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /** 评论 */
  onOpenComment(e: WechatMiniprogram.TouchEvent) {
    this.setData({
      commentVisible: true,
      commentFeedId: e.currentTarget.dataset.id as string,
      commentContent: '',
    });
  },
  onInputComment(e: WechatMiniprogram.Input) {
    this.setData({ commentContent: e.detail.value });
  },
  async onSubmitComment() {
    const content = this.data.commentContent.trim();
    if (!content) return;
    try {
      await api.call('feed', 'comment', { feedId: this.data.commentFeedId, content });
      this.setData({
        feeds: this.data.feeds.map((f) =>
          f.id === this.data.commentFeedId ? { ...f, commentCount: f.commentCount + 1 } : f,
        ),
        commentVisible: false,
        commentContent: '',
      });
      wx.showToast({ title: '已评论', icon: 'success' });
    } catch {
      wx.showToast({ title: '评论失败', icon: 'none' });
    }
  },
  closeComment() {
    this.setData({ commentVisible: false });
  },

  /** 点头像/昵称 → 用户主页（V0.1.32 关注闭环入口） */
  onTapUser(e: WechatMiniprogram.TouchEvent) {
    const uid = e.currentTarget.dataset.uid as string;
    if (uid) wx.navigateTo({ url: `/pages/user/index?userId=${uid}` });
  },
});
