// AI 私教聊天页（V0.1.140 — 人设可切换 + 建议卡片 + 分享 + 语音占位 + 会话管理）
//
// 流式：wx.request enableChunked + onChunkReceived → abToAscii → 按 \n\n 分帧 → JSON.parse
// 人设（A）：本地缓存 + setPersona 同步 DB；4 人设 scientist/coach/buddy/strict
// 建议卡片（B）：assistant reply 末尾 `📋建议：xxx` 标记，正则提取 → 卡片按钮
// 分享（D）：onShareAppMessage；语音（F）：🎤 占位（待同声传译插件开通）
import { actionUrl } from '@qm-wx/shared/api-contracts';
import { api, getBaseUrl } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

interface PlanDay { day: string; type: string; content: string; distanceKm?: number }
interface PlanStructure {
  title: string; level: string; weeks: number; goal: string;
  weeklyMileage: string; targetKm: number; days: PlanDay[];
}
interface Suggestion { type: 'addGoal' | 'adoptPlan' | 'generic'; label: string }
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'plan';
  plan?: PlanStructure;
  pending?: boolean;
  suggestions?: Suggestion[];
}

const PERSONAS = [
  { key: 'buddy', label: '陪跑', emoji: '🤝' },
  { key: 'scientist', label: '科学', emoji: '🔬' },
  { key: 'coach', label: '教练', emoji: '🏅' },
  { key: 'strict', label: '铁血', emoji: '💪' },
] as const;

const QUICK_QUESTIONS = ['怎么提高配速？', '帮我制定半马训练计划', '跑后怎么恢复？', '跑鞋多久该换？'];

const WELCOME =
  '你好，我是青沐 AI 私教 🏃。点上方人设切换风格，问我训练/恢复/营养/伤病，或点「计划」定制训练计划。';

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
    persona: 'buddy' as string,
    personaList: PERSONAS,
  },
  streamingTask: null as WechatMiniprogram.RequestTask | null,
  // V0.1.141 A throttle：buffer 累积 token + 50ms timer flush（setData 频率降 ~20x）
  _tokenBuffer: '' as string,
  _tokenTimer: null as number | null,

  async onLoad() {
    const cached = wx.getStorageSync('aiCoachPersona') as string | '';
    this.setData({ persona: cached || 'buddy' });
    await ensureLogin(); // V0.1.142 tab 首次进先登录（否则 loadHistory/warmup 401）
    this.loadHistory();
    this.warmup(); // V0.1.141 B 预热 system prompt Cache（首问快）
  },

  /** V0.1.141 B 预热：进页调 warmup，后端预 Cache system prompt */
  warmup() {
    api.call('aiCoach', 'warmup', {}).catch(() => undefined);
  },

  async loadHistory(cid?: string) {
    try {
      const res = await api.call<{ conversationId: string; messages: Msg[] }>(
        'aiCoach',
        'history',
        cid ? { conversationId: cid } : {},
      );
      if (res.conversationId && res.messages.length) {
        const messages = res.messages.map((m) => ({
          ...m,
          type: 'text' as const,
          suggestions: m.role === 'assistant' ? this.extractSuggestions(m.content) : [],
        }));
        this.setData({ conversationId: res.conversationId, messages, hasHistory: true });
        this.scrollBottom();
        return;
      }
    } catch {
      // history 失败不阻塞
    }
    this.setData({
      messages: [{ role: 'assistant', content: WELCOME, type: 'text' }],
      hasHistory: false,
    });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ inputText: e.detail.value });
  },

  /** A 人设切换：本地缓存 + DB 同步 */
  async onSelectPersona(e: WechatMiniprogram.Touch) {
    const persona = (e.currentTarget.dataset as { key: string }).key;
    if (persona === this.data.persona || this.data.sending) return;
    this.setData({ persona });
    wx.setStorageSync('aiCoachPersona', persona);
    try {
      await api.call('aiCoach', 'setPersona', { persona });
      const label = PERSONAS.find((p) => p.key === persona)?.label;
      wx.showToast({ title: `已切换「${label}」风格`, icon: 'none' });
    } catch {
      // 静默（本地已切，DB 失败不阻塞）
    }
  },

  onNewChat() {
    if (this.data.sending) return;
    this.setData({
      conversationId: '',
      messages: [{ role: 'assistant', content: WELCOME, type: 'text' }],
      hasHistory: false,
      inputText: '',
    });
  },

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
    const asstMsg: Msg = { role: 'assistant', content: '', type: 'text', pending: true, suggestions: [] };
    this.setData({
      messages: [...this.data.messages, userMsg, asstMsg],
      inputText: '',
      sending: true,
    });
    this.scrollBottom();
    await this.streamChat(text);
  },

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

  async onRegenerate() {
    if (this.data.sending || !this.data.conversationId) return;
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.type === 'plan') return;
    last.content = '';
    last.pending = true;
    last.suggestions = [];
    this.setData({ messages, sending: true });
    try {
      const res = await api.call<{ reply: string; conversationId: string }>('aiCoach', 'regenerate', {
        conversationId: this.data.conversationId,
      });
      last.content = res.reply;
      last.pending = false;
      last.suggestions = this.extractSuggestions(res.reply);
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

  /** B 建议提取：reply 末尾 `📋建议：xxx` 标记 → 正则提取 + 简单分类 */
  extractSuggestions(content: string): Suggestion[] {
    if (!content) return [];
    const suggestions: Suggestion[] = [];
    const regex = /📋建议：([^\n]+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const label = m[1].trim();
      let type: Suggestion['type'] = 'generic';
      if (/目标|跑量|公里|km/i.test(label)) type = 'addGoal';
      else if (/计划|训练|间歇|长距|节奏/i.test(label)) type = 'adoptPlan';
      suggestions.push({ type, label });
    }
    return suggestions;
  },

  /** B 建议卡片点击：addGoal → goal 页；adoptPlan → 生成计划 */
  onTapSuggestion(e: WechatMiniprogram.Touch) {
    const sug = (e.currentTarget.dataset as { sug: Suggestion }).sug;
    if (sug.type === 'addGoal') {
      wx.navigateTo({ url: '/pages/goal/index' });
    } else if (sug.type === 'adoptPlan') {
      this.setData({ inputText: sug.label });
      this.onTapGeneratePlan();
    } else {
      this.setData({ inputText: sug.label });
    }
  },

  handleFrame(frame: string) {
    const line = frame.trim();
    if (!line.startsWith('data:')) return;
    const json = line.slice(5).trim();
    if (!json || json === '[DONE]') return;
    try {
      const obj = JSON.parse(json) as { t?: string; done?: boolean; conversationId?: string; error?: string };
      if (obj.t) this.appendToken(obj.t);
      else if (obj.done) {
        this.setData({ conversationId: obj.conversationId || this.data.conversationId, hasHistory: true });
        this.markMsgDone(); // 流完提取建议
      } else if (obj.error) this.onError(obj.error);
    } catch {
      // 跳过非 JSON
    }
  },

  /** V0.1.141 A throttle：token 进 buffer，50ms timer flush 一次 setData（替代每 token setData）*/
  appendToken(t: string) {
    this._tokenBuffer += t;
    if (this._tokenTimer) return;
    this._tokenTimer = setTimeout(() => {
      this._tokenTimer = null;
      this._flushTokenBuffer();
    }, 50) as unknown as number;
  },

  _flushTokenBuffer() {
    if (!this._tokenBuffer) return;
    const buf = this._tokenBuffer;
    this._tokenBuffer = '';
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') {
      last.content += buf;
      last.pending = false;
      messages[messages.length - 1] = last;
      this.setData({ messages });
      this.scrollBottom();
    }
  },

  markMsgDone() {
    this._flushTokenBuffer(); // V0.1.141 流完 flush 剩余 buffer
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') {
      last.pending = false;
      last.suggestions = this.extractSuggestions(last.content); // B：流完提取建议
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
        message: this.data.inputText || '请结合我的跑量、目标和跑鞋状态，生成一份个性化训练计划',
      });
      const messages: Msg[] = [
        ...this.data.messages,
        { role: 'assistant', content: '这是为你定制的训练计划，点击「采纳」即可加入：', type: 'plan', plan },
      ];
      this.setData({ messages, hasHistory: true, inputText: '' });
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

  /** F 语音输入占位（待同声传译插件开通）*/
  onTapVoice() {
    wx.showModal({
      title: '语音输入',
      content: '语音输入需开通微信「同声传译」插件（小程序后台 → 插件 → 搜索 wx069ba97219f66d99）。开通后即可用 🎤 说话输入。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  /** D 分享 */
  onShareAppMessage() {
    const last = this.data.messages[this.data.messages.length - 1];
    const text = last?.role === 'assistant' && last.content ? last.content.replace(/📋建议：[^\n]+/g, '').trim() : '';
    return {
      title: text ? `AI 私教：${text.slice(0, 40)}…` : '青沐 AI 私教 — 你的私人跑步教练 🏃',
      path: '/pages/ai-coach/index',
    };
  },

  // ===== 会话管理（V0.1.139）=====
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

  async onSelectConversation(e: WechatMiniprogram.Touch) {
    const cid = (e.currentTarget.dataset as { cid: string }).cid;
    this.setData({ showConversations: false });
    await this.loadHistory(cid);
  },

  onDeleteConversation(e: WechatMiniprogram.Touch) {
    const cid = (e.currentTarget.dataset as { cid: string }).cid;
    wx.showModal({
      title: '删除会话',
      content: '确定删除此会话？删除后不可恢复。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.call('aiCoach', 'deleteConversation', { conversationId: cid });
          const r = await api.call<{ conversations: Array<{ conversationId: string; lastMessage: string; lastTime: string; messageCount: number }> }>('aiCoach', 'conversations', {});
          this.setData({
            conversationList: r.conversations.map((c) => ({
              ...c,
              lastTime: c.lastTime ? c.lastTime.slice(0, 16).replace('T', ' ') : '',
            })),
          });
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
