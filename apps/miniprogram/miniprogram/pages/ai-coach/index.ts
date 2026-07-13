// AI 私教聊天页（V0.1.139 + 完善：历史持久化 / 新对话 / 快捷问题 / 重新生成 / 停止）
//
// 流式：wx.request enableChunked + onChunkReceived 拿 ArrayBuffer
//   → 逐字节 fromCharCode 转 ASCII（后端 SSE 帧已 \uXXXX 转义中文，纯 ASCII 安全）
//   → 累积 buffer 按 "\n\n" 分帧 → data: {...} → JSON.parse 取 t/done/error
import { actionUrl } from '@qm-wx/shared/api-contracts';
import { api, getBaseUrl } from '../../services/api';

interface PlanDay { day: string; type: string; content: string; distanceKm?: number }
interface PlanStructure {
  title: string; level: string; weeks: number; goal: string;
  weeklyMileage: string; targetKm: number; days: PlanDay[];
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'plan';
  plan?: PlanStructure;
  pending?: boolean;
}

const QUICK_QUESTIONS = [
  '怎么提高配速？',
  '帮我制定半马训练计划',
  '跑后怎么恢复？',
  '跑鞋多久该换？',
];

const WELCOME =
  '你好，我是青沐 AI 私教 🏃。可以问我训练、恢复、营养、伤病、跑鞋或配速，也可以点下方快捷问题，或右上「计划」让我定制训练计划。';

Page({
  data: {
    messages: [] as Msg[],
    inputText: '',
    conversationId: '',
    sending: false,
    scrollTop: 0,
    quickQuestions: QUICK_QUESTIONS,
    hasHistory: false,
    showConversations: false,
    conversationList: [] as Array<{ conversationId: string; lastMessage: string; lastTime: string; messageCount: number }>,
  },
  // 流式 task 引用（用于停止生成 abort）
  streamingTask: null as WechatMiniprogram.RequestTask | null,

  onLoad() {
    this.loadHistory();
  },

  /** V0.1.139 完善：加载历史会话（无则显欢迎语 + 快捷问题）。传 cid → 加载指定会话 */
  async loadHistory(cid?: string) {
    try {
      const res = await api.call<{ conversationId: string; messages: Msg[] }>(
        'aiCoach',
        'history',
        cid ? { conversationId: cid } : {},
      );
      if (res.conversationId && res.messages.length) {
        this.setData({
          conversationId: res.conversationId,
          messages: res.messages.map((m) => ({ ...m, type: 'text' as const })),
          hasHistory: true,
        });
        this.scrollBottom();
        return;
      }
    } catch {
      // history 失败不阻塞（显欢迎语）
    }
    this.setData({
      messages: [{ role: 'assistant', content: WELCOME, type: 'text' }],
      hasHistory: false,
    });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ inputText: e.detail.value });
  },

  /** 完善：新对话（清当前会话，重显欢迎语）*/
  onNewChat() {
    if (this.data.sending) return;
    this.setData({
      conversationId: '',
      messages: [{ role: 'assistant', content: WELCOME, type: 'text' }],
      hasHistory: false,
      inputText: '',
    });
  },

  /** 完善：快捷问题 → 直接发送 */
  onTapQuick(e: WechatMiniprogram.Touch) {
    const q = (e.currentTarget.dataset as { q: string }).q;
    if (this.data.sending || !q) return;
    this.setData({ inputText: q });
    this.onSend();
  },

  async onSend() {
    const text = (this.data.inputText || '').trim();
    if (!text || this.data.sending) return;
    const userMsg: Msg = { role: 'user', content: text, type: 'text' };
    const asstMsg: Msg = { role: 'assistant', content: '', type: 'text', pending: true };
    this.setData({
      messages: [...this.data.messages, userMsg, asstMsg],
      inputText: '',
      sending: true,
    });
    this.scrollBottom();
    await this.streamChat(text);
  },

  /** 流式对话（enableChunked + onChunkReceived 解析 SSE）*/
  streamChat(message: string): Promise<void> {
    return new Promise((resolve) => {
      const token = wx.getStorageSync('accessToken');
      const task = wx.request({
        url: `${getBaseUrl()}${actionUrl('aiCoach', 'chatStream')}`,
        method: 'POST',
        enableChunked: true,
        header: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        data: { action: 'chatStream', payload: { message, conversationId: this.data.conversationId } },
        success: () => {
          this.setData({ sending: false });
          this.streamingTask = null;
          resolve();
        },
        fail: () => {
          this.onError('网络错误，请重试');
          this.setData({ sending: false });
          this.streamingTask = null;
          resolve();
        },
      });
      this.streamingTask = task;

      let buf = '';
      task.onChunkReceived((res: { data: ArrayBuffer }) => {
        buf += this.abToAscii(res.data);
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          this.handleFrame(frame);
        }
      });
    });
  },

  /** 完善：停止生成（abort 当前流式 task）*/
  onStop() {
    if (this.streamingTask) {
      try {
        this.streamingTask.abort();
      } catch {
        // ignore
      }
      this.streamingTask = null;
    }
    this.markMsgDone();
    this.setData({ sending: false });
  },

  /** 完善：重新生成最后一条 assistant（非流式 regenerate）*/
  async onRegenerate() {
    if (this.data.sending || !this.data.conversationId) return;
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.type === 'plan') return;
    last.content = '';
    last.pending = true;
    this.setData({ messages, sending: true });
    try {
      const res = await api.call<{ reply: string; conversationId: string }>('aiCoach', 'regenerate', {
        conversationId: this.data.conversationId,
      });
      last.content = res.reply;
      last.pending = false;
      messages[messages.length - 1] = last;
      this.setData({ messages });
      this.scrollBottom();
    } catch (e) {
      last.content = '重新生成失败，请重试';
      last.pending = false;
      messages[messages.length - 1] = last;
      this.setData({ messages });
    } finally {
      this.setData({ sending: false });
    }
  },

  /** 解析一帧 SSE：data: {...} */
  handleFrame(frame: string) {
    const line = frame.trim();
    if (!line.startsWith('data:')) return;
    const json = line.slice(5).trim();
    if (!json || json === '[DONE]') return;
    try {
      const obj = JSON.parse(json) as { t?: string; done?: boolean; conversationId?: string; error?: string };
      if (obj.t) this.appendToken(obj.t);
      else if (obj.done) {
        this.setData({
          conversationId: obj.conversationId || this.data.conversationId,
          hasHistory: true,
        });
      } else if (obj.error) this.onError(obj.error);
    } catch {
      // 跳过非 JSON
    }
  },

  appendToken(t: string) {
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') {
      last.content += t;
      last.pending = false;
      messages[messages.length - 1] = last;
      this.setData({ messages });
      this.scrollBottom();
    }
  },

  markMsgDone() {
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (last) {
      last.pending = false;
      messages[messages.length - 1] = last;
      this.setData({ messages });
    }
  },

  onError(msg: string) {
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && last.pending) {
      last.content = msg;
      last.pending = false;
      messages[messages.length - 1] = last;
      this.setData({ messages });
    }
  },

  /** ArrayBuffer → ASCII 字符串（分块避免 apply 栈溢出；后端帧纯 ASCII 安全）*/
  abToAscii(buf: ArrayBuffer): string {
    const arr = new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < arr.length; i += 0x8000) {
      str += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000) as unknown as number[]);
    }
    return str;
  },

  scrollBottom() {
    this.setData({ scrollTop: Math.random() + 999999 });
  },

  async onTapGeneratePlan() {
    if (this.data.sending) return;
    wx.showLoading({ title: '生成计划中…' });
    try {
      const { plan } = await api.call<{ plan: PlanStructure }>('aiCoach', 'generatePlan', {
        message: '请结合我的跑量、目标和跑鞋状态，生成一份个性化训练计划',
      });
      const messages: Msg[] = [
        ...this.data.messages,
        { role: 'assistant', content: '这是为你定制的训练计划，点击「采纳」即可加入：', type: 'plan', plan },
      ];
      this.setData({ messages, hasHistory: true });
      this.scrollBottom();
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onAdoptPlan(e: WechatMiniprogram.CustomEvent<{ plan: PlanStructure }>) {
    wx.showLoading({ title: '采纳中…' });
    try {
      await api.call('aiCoach', 'adoptPlan', { plan: e.detail.plan });
      wx.showToast({ title: '已加入训练计划', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onRegeneratePlan() {
    this.onTapGeneratePlan();
  },

  onTweakPlan() {
    this.setData({ inputText: '请调整这份计划：' });
  },

  // ===== 会话管理（V0.1.139 完善：多会话列表/切换/删除）=====

  /** 打开会话列表弹层 */
  async onShowConversations() {
    if (this.data.sending) return;
    try {
      const res = await api.call<{ conversations: Array<{ conversationId: string; lastMessage: string; lastTime: string; messageCount: number }> }>('aiCoach', 'conversations', {});
      this.setData({
        showConversations: true,
        conversationList: res.conversations.map((c) => ({
          ...c,
          lastTime: c.lastTime ? c.lastTime.slice(0, 16).replace('T', ' ') : '',
        })),
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onCloseConversations() {
    this.setData({ showConversations: false });
  },

  /** 切换到选中会话 */
  async onSelectConversation(e: WechatMiniprogram.Touch) {
    const cid = (e.currentTarget.dataset as { cid: string }).cid;
    this.setData({ showConversations: false });
    await this.loadHistory(cid);
  },

  /** 删除会话（catchtap 阻止冒泡到 item 的 onSelectConversation）*/
  onDeleteConversation(e: WechatMiniprogram.Touch) {
    const cid = (e.currentTarget.dataset as { cid: string }).cid;
    wx.showModal({
      title: '删除会话',
      content: '确定删除此会话？删除后不可恢复。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.call('aiCoach', 'deleteConversation', { conversationId: cid });
          // 刷新列表
          const r = await api.call<{ conversations: Array<{ conversationId: string; lastMessage: string; lastTime: string; messageCount: number }> }>('aiCoach', 'conversations', {});
          this.setData({
            conversationList: r.conversations.map((c) => ({
              ...c,
              lastTime: c.lastTime ? c.lastTime.slice(0, 16).replace('T', ' ') : '',
            })),
          });
          // 删的是当前会话 → 重置欢迎语
          if (cid === this.data.conversationId) {
            this.setData({
              conversationId: '',
              messages: [{ role: 'assistant', content: WELCOME, type: 'text' }],
              hasHistory: false,
            });
          }
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },
});
