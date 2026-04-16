const COMMON_RANK_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/鍏紑婧愭湭鍛戒腑锛?/g, '公开源未命中：'],
  [/鑷姩瀵煎叆瀹屾垚锛?/g, '自动导入完成：'],
  [/鑷姩瀵煎叆浠诲姟宸插畬鎴愩€?/g, '自动导入任务已完成。'],
  [/鑷姩瀵煎叆浠诲姟鎵ц澶辫触銆?/g, '自动导入任务执行失败。'],
  [/鑷姩瀵煎叆浠诲姟姝ｅ湪鍚庡彴鎵ц锛岃绋嶅悗鍒锋柊鐘舵€併€?/g, '自动导入任务正在后台执行，请稍后刷新状态。'],
  [
    /鑷姩瀵煎叆浠诲姟宸插湪鍚庡彴鍚姩锛岀郴缁熶細鎸佺画鍙戠幇骞跺悓姝ヤ富鍙蜂笌灏忓彿銆?/g,
    '自动导入任务已在后台启动，系统会持续发现并同步主号与小号。',
  ],
  [/鑷姩瀵煎叆浠诲姟蹇冭烦宸蹭腑鏂紝绯荤粺宸茶嚜鍔ㄩ噸缃姸鎬併€?/g, '自动导入任务心跳已中断，系统已自动重置状态。'],
  [/鑷姩瀵煎叆浠诲姟鏁翠綋鎵ц瓒呮椂锛岀郴缁熷凡鑷姩閲嶇疆鐘舵€併€?/g, '自动导入任务整体执行超时，系统已自动重置状态。'],
  [/鎵嬪姩鎵ц Rank 鍚屾澶辫触銆?/g, '手动执行 Rank 同步失败。'],
  [/瀹氭椂 Rank 鍚屾澶辫触銆?/g, '定时 Rank 同步失败。'],
  [/TrackingThePros 鑷姩鍙戠幇锛?/g, 'TrackingThePros 自动发现：'],
  [/OP\.GG 鑷姩鍙戠幇锛欿R/g, 'OP.GG 自动发现：KR'],
  [/寰呯‘璁ゆ槧灏\??/g, '待确认映射'],
  [/鑷姩琛ラ綈鏄犲皠/g, '自动补齐映射'],
  [
    /鑷姩鍗犱綅锛氬叕寮€鏉ユ簮鏆傛湭鍙戠幇鍙獙璇佽处鍙凤紝寰呭悗缁浛鎹紙/g,
    '自动占位：公开来源暂未发现可验证账号，待后续替换（',
  ],
  [/淇濈暀鍗犱綅鏄犲皠锛岀敤浜庡悗缁叕寮€婧愮户缁繁鎸栥€?/g, '保留占位映射，用于后续公开源继续深挖。'],
  [/锛?/g, '：'],
  [/銆?/g, '。'],
];

function looksLikeGarbledRankText(value: string) {
  return /[鑷鍏鍙鎵寰鍚鍔绯缁鐘態鍛濮埌浣璺銆锛]/.test(value);
}

export function normalizeRankText(value: string) {
  let text = String(value || '');
  if (!text) return text;

  for (const [pattern, replacement] of COMMON_RANK_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text;
}

export function normalizeRankTextIfNeeded(value: string) {
  const text = String(value || '');
  if (!text) return text;
  return looksLikeGarbledRankText(text) ? normalizeRankText(text) : text;
}

export function sanitizeRankTextDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return normalizeRankTextIfNeeded(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRankTextDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      sanitizeRankTextDeep(entryValue),
    ]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}
