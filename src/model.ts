export type ConnectionState = 'connected' | 'degraded' | 'offline';
export type SegmentState = 'pending' | 'confirmed' | 'duplicate' | 'stale' | 'ignored';
export type SegmentSource = 'live' | 'offline' | 'manual';
export type RecallStatus = 'pending' | 'approved' | 'conflict' | 'dismissed';

export interface RecallRequest {
  id: string;
  segmentId: string;
  sequence: number;
  startTime: number;
  speaker: string;
  /** 申请时记下的字幕版本，用于检测申请后旧句是否又被修改 */
  baseRevision: number;
  /** 申请时直播区旧句（前内容快照） */
  beforeText: string;
  /** 替换文本（复核通过后的后内容） */
  replacement: string;
  reason: string;
  applicant: string;
  requestedAt: number;
  /** 断线期间提交的申请，恢复后按 requestedAt 先后顺序复核 */
  offline: boolean;
  status: RecallStatus;
  reviewer?: string;
  reviewedAt?: number;
  /** 处理后实际留在直播区的内容（通过时等于 replacement，冲突时为当前直播句） */
  afterText?: string;
  conflictReason?: string;
}

export interface CaptionSegment {
  id: string;
  sequence: number;
  startTime: number;
  receivedAt: number;
  confirmedAt?: number;
  speaker: string;
  original: string;
  corrected: string;
  numberHints: string;
  source: SegmentSource;
  state: SegmentState;
  duplicateOf?: string;
  staleReason?: string;
  revision: number;
  tags: string[];
}

export interface TermRule {
  id: string;
  source: string;
  replacement: string;
  speaker: string;
  enabled: boolean;
  caseSensitive: boolean;
  usageCount: number;
  createdAt: number;
}

export interface DeskModel {
  eventName: string;
  eventDate: string;
  segments: CaptionSegment[];
  rules: TermRule[];
  recalls: RecallRequest[];
  operatorName: string;
  selectedId: string;
  connection: ConnectionState;
  simulatedDelay: number;
  fontSize: number;
  nextSequence: number;
  autoStream: boolean;
  lastMergedAt?: number;
  updatedAt: number;
}

export interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  subtitle: string;
}

const now = Date.now();
export const STORAGE_KEY = 'sologsb-1011-live-caption-desk-v1';

function segment(
  id: string,
  sequence: number,
  startTime: number,
  speaker: string,
  original: string,
  corrected = original,
  state: SegmentState = 'pending',
): CaptionSegment {
  return {
    id,
    sequence,
    startTime,
    receivedAt: now - (100 - sequence) * 8_000,
    confirmedAt: state === 'confirmed' ? now - (100 - sequence) * 7_000 : undefined,
    speaker,
    original,
    corrected,
    numberHints: '',
    source: 'live',
    state,
    revision: 0,
    tags: [],
  };
}

const seededSegments: CaptionSegment[] = [
  segment('seg-1', 1, 0, '主持人', '欢迎大家来到二零二六年产品发布会。', '欢迎大家来到2026年产品发布会。', 'confirmed'),
  segment('seg-2', 2, 7, '主讲人', '今天我们会介绍三个模块,首先是实时协作。', '今天我们会介绍三个模块，首先是实时协作。', 'confirmed'),
  segment('seg-3', 3, 15, '主讲人', '延迟和质量监测会帮助我们保持字幕稳定。', '延迟和质量监测会帮助我们保持字幕稳定。', 'confirmed'),
  segment('seg-4', 4, 24, '嘉宾 / 周然', '我们使用 studio cloud 作为演示环境。', '我们使用 Studio Cloud 作为演示环境。', 'pending'),
  segment('seg-5', 5, 34, '嘉宾 / 周然', '每分钟大约会收到一百二十个片段。', '每分钟大约会收到120个片段。', 'pending'),
  segment('seg-6', 6, 43, '主持人', '如果主持人提到 co pilot,需要统一大小写。', '如果主持人提到 Co-Pilot，需要统一大小写。', 'pending'),
  segment('seg-7', 7, 52, '主持人', '这个例子会演示五G网络下的字幕恢复。', '这个例子会演示5G网络下的字幕恢复。', 'pending'),
];

const duplicate: CaptionSegment = {
  ...segment('seg-8', 8, 61, '主讲人', '今天我们重点讨论字幕队列。', '今天我们重点讨论字幕队列。', 'duplicate'),
  source: 'live',
  duplicateOf: 'seg-2',
  staleReason: '与第 2 段高度相似',
};

const seededRecalls: RecallRequest[] = [
  {
    id: 'recall-1',
    segmentId: 'seg-3',
    sequence: 3,
    startTime: 15,
    speaker: '主讲人',
    baseRevision: 0,
    beforeText: '延迟和质量监测会帮助我们保持字幕稳定。',
    replacement: '延迟和质量监控会帮助我们保持字幕稳定。',
    reason: '“监测”应为“监控”，直播区仍挂着错句',
    applicant: '值班校对 / 林岑',
    requestedAt: now - 110_000,
    offline: false,
    status: 'pending',
  },
  {
    id: 'recall-2',
    segmentId: 'seg-1',
    sequence: 1,
    startTime: 0,
    speaker: '主持人',
    baseRevision: 0,
    beforeText: '欢迎大家来到二零二六年产品发布会。',
    replacement: '欢迎大家来到2026年秋季产品发布会。',
    reason: '漏写“秋季”',
    applicant: '值班校对 / 林岑',
    requestedAt: now - 360_000,
    offline: false,
    status: 'approved',
    reviewer: '复核 / 周然',
    reviewedAt: now - 300_000,
    afterText: '欢迎大家来到2026年产品发布会。',
  },
];

export function createInitialModel(): DeskModel {
  return {
    eventName: '新品发布会现场字幕',
    eventDate: new Date(now).toISOString().slice(0, 10),
    segments: [...seededSegments.map((item) => item.id === 'seg-1' ? { ...item, revision: 1 } : item), duplicate],
    rules: [
      { id: 'term-1', source: 'co pilot', replacement: 'Co-Pilot', speaker: '', enabled: true, caseSensitive: false, usageCount: 4, createdAt: now - 86_400_000 },
      { id: 'term-2', source: 'studio cloud', replacement: 'Studio Cloud', speaker: '', enabled: true, caseSensitive: false, usageCount: 7, createdAt: now - 43_200_000 },
      { id: 'term-3', source: '五G', replacement: '5G', speaker: '', enabled: true, caseSensitive: true, usageCount: 2, createdAt: now - 3_600_000 },
    ],
    recalls: seededRecalls,
    operatorName: '值班校对 / 林岑',
    selectedId: 'seg-4',
    connection: 'connected',
    simulatedDelay: 1.8,
    fontSize: 18,
    nextSequence: 9,
    autoStream: true,
    updatedAt: now,
  };
}

export function cloneModel(model: DeskModel): DeskModel {
  return structuredClone(model);
}

export function normalizeNumbers(text: string): string {
  const digitMap: Record<string, string> = { '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9' };
  const chineseNumber = (raw: string): number => {
    const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (!/[十百千万]/u.test(raw)) return Number([...raw].map((char) => digits[char] ?? 0).join(''));
    let total = 0;
    let section = 0;
    let number = 0;
    for (const char of raw) {
      if (digits[char] !== undefined) {
        number = digits[char];
      } else if (char === '十') {
        section += (number || 1) * 10;
        number = 0;
      } else if (char === '百') {
        section += (number || 1) * 100;
        number = 0;
      } else if (char === '千') {
        section += (number || 1) * 1000;
        number = 0;
      } else if (char === '万') {
        total += (section + number) * 10_000;
        section = 0;
        number = 0;
      }
    }
    return total + section + number;
  };

  return text
    .replace(/[０-９]/g, (char) => digitMap[char] ?? char)
    .replace(/([零〇一二两三四五六七八九十百千万]+)/gu, (match) => String(chineseNumber(match)))
    .replace(/(?<=\d)[，,](?=\d{3}\b)/g, ',');
}

export function normalizePunctuation(text: string): string {
  return text
    .replace(/([，。！？；：])(?=[^\s，。！？；：])/gu, '$1')
    .replace(/\s+([，。！？；：])/gu, '$1')
    .replace(/([,;:!?])(?=[^\s,;:!?])/g, (match) => ({ ',': '，', ';': '；', ':': '：', '!': '！', '?': '？' }[match] ?? match));
}

export function applyRules(text: string, model: DeskModel): { text: string; used: string[] } {
  let next = text;
  const used: string[] = [];
  for (const rule of model.rules.filter((item) => item.enabled)) {
    if (!rule.source || !next) continue;
    const flags = rule.caseSensitive ? 'g' : 'gi';
    const expression = new RegExp(rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    if (expression.test(next)) {
      next = next.replace(expression, rule.replacement);
      used.push(rule.id);
    }
  }
  return { text: normalizePunctuation(next), used };
}

export function isDuplicate(candidate: CaptionSegment, existing: CaptionSegment[]): CaptionSegment | undefined {
  const normalize = (value: string) => value.replace(/[\s，。！？；：,.;:!?]/g, '').toLocaleLowerCase();
  const candidateText = normalize(candidate.corrected || candidate.original);
  return existing.find((segmentItem) => {
    if (segmentItem.id === candidate.id || segmentItem.state === 'ignored') return false;
    const text = normalize(segmentItem.corrected || segmentItem.original);
    if (!candidateText || !text) return false;
    return text === candidateText || (Math.abs(segmentItem.startTime - candidate.startTime) < 12 && (text.includes(candidateText) || candidateText.includes(text)));
  });
}

export function mergeConfirmedSegments(model: DeskModel): DeskModel {
  const seen: string[] = [];
  const segments = model.segments
    .map((item) => ({ ...item }))
    .sort((a, b) => a.sequence - b.sequence || a.startTime - b.startTime)
    .map((item): CaptionSegment => {
      if (item.source === 'offline' && item.state === 'confirmed') {
        item.source = item.confirmedAt && Date.now() - item.confirmedAt > 90_000 ? 'offline' : 'live';
        item.staleReason = Date.now() - item.receivedAt > 90_000 ? `离线恢复后合并，原始片段已延迟 ${Math.round((Date.now() - item.receivedAt) / 1000)} 秒` : undefined;
        if (item.staleReason) item.state = 'stale';
      }
      const duplicate = isDuplicate(item, seen.map((id) => model.segments.find((segmentItem) => segmentItem.id === id)).filter(Boolean) as CaptionSegment[]);
      if (duplicate && item.state !== 'confirmed') {
        item.state = 'duplicate';
        item.duplicateOf = duplicate.id;
      }
      if (item.state !== 'ignored') seen.push(item.id);
      return item;
    });

  return {
    ...model,
    segments,
    connection: 'connected',
    simulatedDelay: Math.max(0.8, model.simulatedDelay - 0.7),
    lastMergedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function queueStats(model: DeskModel) {
  const pending = model.segments.filter((item) => item.state === 'pending');
  const stale = model.segments.filter((item) => item.state === 'stale');
  const duplicate = model.segments.filter((item) => item.state === 'duplicate');
  const offline = model.segments.filter((item) => item.source === 'offline' && item.state === 'confirmed');
  const recallPending = (model.recalls ?? []).filter((item) => item.status === 'pending').length;
  return {
    pending: pending.length,
    stale: stale.length,
    duplicate: duplicate.length,
    offline: offline.length,
    recallPending,
    backlog: pending.length + stale.length + duplicate.length + offline.length,
    oldestWaitSeconds: pending.length ? Math.max(...pending.map((item) => Math.round((Date.now() - item.receivedAt) / 1000))) : 0,
  };
}

export function createLiveSegment(sequence: number): CaptionSegment {
  const speakers = ['主持人', '主讲人', '嘉宾 / 周然', '现场提问'];
  const samples = [
    '接下来请产品团队介绍新的工作流。',
    '请注意屏幕右侧的实时队列状态。',
    '在弱网环境下我们会保留未确认片段。',
    '如果网络恢复,系统会按照时间顺序自动合并。',
    '这段字幕包含二零二五年的项目数据。',
    '大家可以在会后查看完整回放和术语表。',
  ];
  const start = Math.max(0, sequence * 9 - 10);
  return {
    id: `seg-live-${sequence}-${Date.now().toString(36)}`,
    sequence,
    startTime: start,
    receivedAt: Date.now(),
    speaker: speakers[(sequence - 1) % speakers.length],
    original: samples[(sequence - 1) % samples.length],
    corrected: samples[(sequence - 1) % samples.length],
    numberHints: '',
    source: 'live',
    state: 'pending',
    revision: 0,
    tags: [],
  };
}

export function simulateLatency(model: DeskModel): DeskModel {
  if (model.connection === 'offline') return model;
  const step = model.connection === 'degraded' ? 0.7 : model.simulatedDelay > 2.8 ? -0.3 : 0.15;
  const delay = Math.max(0.7, Math.min(8.9, Number((model.simulatedDelay + step).toFixed(1))));
  const applyStream = model.autoStream && Math.random() > 0.68;
  let nextSequence = model.nextSequence;
  let segments = model.segments;
  if (applyStream) {
    const candidate = createLiveSegment(model.nextSequence);
    const duplicate = isDuplicate(candidate, segments);
    segments = [...segments, duplicate ? { ...candidate, state: 'duplicate', duplicateOf: duplicate.id, staleReason: `与第 ${duplicate.sequence} 段重复` } : candidate];
    nextSequence += 1;
  }
  const pendingCutoff = Date.now() - 90_000;
  segments = segments.map((item) => item.state === 'pending' && item.receivedAt < pendingCutoff
    ? { ...item, state: 'stale', staleReason: `片段已等待 ${Math.round((Date.now() - item.receivedAt) / 1000)} 秒` }
    : item);
  return {
    ...model,
    segments,
    nextSequence,
    simulatedDelay: delay,
    connection: delay > 4.2 ? 'degraded' : model.connection,
    updatedAt: Date.now(),
  };
}

// —— 快速撤回 ——

export const RECALL_WINDOW_MS = 90_000;

/** 同一片段只允许一份待处理撤回 */
export function pendingRecallForSegment(model: DeskModel, segmentId: string): RecallRequest | undefined {
  return (model.recalls ?? []).find((item) => item.segmentId === segmentId && item.status === 'pending');
}

/**
 * 复核冲突检测：
 * 1. 原句在申请后又改过（版本号变化）
 * 2. 申请超过九十秒
 * 3. 片段已撤回 / 已离开直播区（不再是已确认）
 */
export function recallConflict(model: DeskModel, recall: RecallRequest): string | undefined {
  const segment = model.segments.find((item) => item.id === recall.segmentId);
  if (!segment) return '该片段已不存在，无法定位撤回目标';
  if (segment.state !== 'confirmed') return '该片段已不在直播区（可能已被撤回或移除）';
  if (segment.corrected !== recall.beforeText) return `申请后原句又被修改（当前直播：${segment.corrected}）`;
  if (segment.revision !== recall.baseRevision) return `字幕版本已变化（申请时 v${recall.baseRevision}，当前 v${segment.revision}）`;
  if (Date.now() - recall.requestedAt > RECALL_WINDOW_MS) {
    return `申请已超过 90 秒（实际等待 ${Math.round((Date.now() - recall.requestedAt) / 1000)} 秒）`;
  }
  return undefined;
}

export interface NewRecallInput {
  segmentId: string;
  replacement: string;
  reason: string;
  applicant: string;
}

export interface NewRecallResult {
  model: DeskModel;
  /** true 表示覆盖了同一片段上原有的待处理申请 */
  replaced: boolean;
}

export function submitRecall(model: DeskModel, input: NewRecallInput): NewRecallResult {
  const segment = model.segments.find((item) => item.id === input.segmentId);
  if (!segment) return { model, replaced: false };
  const nowTs = Date.now();
  const existing = pendingRecallForSegment(model, segment.id);
  // 已有申请若已处于不可复核的冲突状态（超时、原句改动、离开直播区），作为全新申请重新计时
  const stale = existing ? !!recallConflict(model, existing) : true;
  const offline = model.connection === 'offline';
  const request: RecallRequest = {
    id: `recall-${nowTs.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    segmentId: segment.id,
    sequence: segment.sequence,
    startTime: segment.startTime,
    speaker: segment.speaker,
    baseRevision: segment.revision,
    beforeText: segment.corrected,
    replacement: input.replacement,
    reason: input.reason,
    applicant: input.applicant,
    requestedAt: existing && !stale ? existing.requestedAt : nowTs,
    offline: offline || (!stale && !!existing?.offline),
    status: 'pending',
  };
  // 同一片段只留一份待处理：覆盖旧申请；有效申请沿用最早排队时间，保证离线恢复后按先后处理
  const recalls = [...(model.recalls ?? []).filter((item) => item.id !== existing?.id), request]
    .sort((a, b) => a.requestedAt - b.requestedAt);
  return {
    model: { ...model, recalls, updatedAt: nowTs },
    replaced: !!existing,
  };
}

/** 复核决定：通过则旧句转入撤回记录、新文本回到原时间位置；冲突则保留当前直播内容 */
export function decideRecall(model: DeskModel, recallId: string, approve: boolean, reviewer: string): DeskModel {
  const recall = (model.recalls ?? []).find((item) => item.id === recallId);
  if (!recall || recall.status !== 'pending') return model;

  const conflict = recallConflict(model, recall);
  const reviewedAt = Date.now();
  let segments = model.segments;

  let next: RecallRequest;
  if (approve && !conflict) {
    segments = model.segments.map((item) => item.id === recall.segmentId ? {
      ...item,
      corrected: recall.replacement,
      revision: item.revision + 1,
      tags: [...new Set([...item.tags, `撤回替换 ${new Date(reviewedAt).toLocaleTimeString('zh-CN')}`])],
    } : item);
    next = { ...recall, status: 'approved', reviewer, reviewedAt, afterText: recall.replacement };
  } else {
    const segment = model.segments.find((item) => item.id === recall.segmentId);
    const keptText = segment?.corrected ?? recall.beforeText;
    next = {
      ...recall,
      // 通过时发现冲突记为 conflict；复核员主动拒绝记为 dismissed，二者都保留当前直播内容
      status: approve ? 'conflict' : 'dismissed',
      reviewer,
      reviewedAt,
      afterText: keptText,
      conflictReason: approve
        ? (conflict ?? '复核未通过')
        : conflict
          ? `拒绝撤回并保留当前直播内容；${conflict}`
          : '复核员拒绝撤回，保留当前直播内容',
    };
  }

  return {
    ...model,
    segments,
    recalls: (model.recalls ?? []).map((item) => item.id === recallId ? next : item),
    updatedAt: reviewedAt,
  };
}

/** 恢复连接：断线期间提交的申请回到待复核队列，按提交时间先后处理 */
export function requeueOfflineRecalls(model: DeskModel): DeskModel {
  const recalls = (model.recalls ?? [])
    .map((item) => item.status === 'pending' ? { ...item, offline: false } : item)
    .sort((a, b) => (a.status === 'pending' && b.status === 'pending' ? a.requestedAt - b.requestedAt : 0));
  return { ...model, recalls, updatedAt: Date.now() };
}

export function toSrt(model: DeskModel): string {  const stamp = (seconds: number, separator = ',') => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds - Math.floor(seconds)) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
  };
  return model.segments
    .filter((item) => item.state === 'confirmed')
    .sort((a, b) => a.startTime - b.startTime)
    .map((item, index) => `${index + 1}\n${stamp(item.startTime)} --> ${stamp(item.startTime + 7)}\n[${item.speaker}] ${item.corrected}\n`)
    .join('\n');
}
