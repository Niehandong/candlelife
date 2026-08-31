(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ZhushengCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const DEFAULT_CONFIG = {
    schemaVersion: SCHEMA_VERSION,
    app: {
      name: '烛生',
      slogan: '陪你按时睡觉',
      homeQuestion: '今晚，几点睡？'
    },
    schedule: {
      bedtime: '23:30',
      wakeTime: '07:30',
      minTime: '20:00',
      maxTime: '02:00'
    },
    ritual: {
      toleranceMinutes: 30,
      dimMinutes: 10,
      goodnightText: '今天已经好好结束了。晚安。',
      interruptText: '不用责怪自己。今晚仍然可以重新开始。',
      resistanceOptions: ['我还在刷手机', '我还在工作', '我还不困', '我舍不得结束今天'],
      gratitudeCount: 3,
      planCount: 3
    },
    records: {
      journalDays: 30,
      journalEmptyCopy: '完成一次睡前仪式后，这里会出现你的熄灯时间和夜晚记录。',
      rewardCopy: '昨夜按时熄灯，收到一份安静的礼物。',
      collectionEmptyCopy: '按计划完成一次熄灯仪式，明天会收到一幅安静的艺术作品。'
    },
    legal: {
      version: '2026-08-27',
      analyticsNotice: '匿名统计仅包含仪式完成、是否按时和奖励解锁，不包含感恩或计划正文。'
    },
    artPool: [
      {
        id: 'monet-water-lilies',
        title: '睡莲',
        artist: '克劳德·莫奈',
        year: '约 1916–1919',
        thumbnail: './image/zhusheng-sleep-ui/monet-thumb-optimized.jpg',
        image: './image/zhusheng-sleep-ui/monet-water-lilies-optimized.jpg',
        alt: '克劳德·莫奈《睡莲》',
        source: '公共领域作品，来源信息待正式上线前复核',
        article: '莫奈在睡莲池畔反复观察光线与水面的变化。把这张卡留到清晨再看，也是在提醒自己：夜晚已经结束，新的光正在到来。'
      }
    ],
    updatedBy: '管理员',
    updatedAt: ''
  };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('无效日期');
    return date;
  }

  function dateKey(value) {
    const date = toDate(value);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(value, days) {
    const date = toDate(value);
    date.setDate(date.getDate() + days);
    return date;
  }

  function parseTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) throw new Error('计划时间格式必须为 HH:MM');
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Error('计划时间无效');
    return { hour, minute };
  }

  function plannedDateForCompletion(completedAt, plannedTime) {
    const completed = toDate(completedAt);
    const { hour, minute } = parseTime(plannedTime);
    const candidates = [-1, 0, 1].map(offset => {
      const date = addDays(completed, offset);
      date.setHours(hour, minute, 0, 0);
      return date;
    });
    candidates.sort((a, b) => Math.abs(a - completed) - Math.abs(b - completed));
    return candidates[0];
  }

  function evaluateCompletion(input) {
    const completed = toDate(input.completedAt);
    const plannedAt = plannedDateForCompletion(completed, input.plannedTime);
    const tolerance = Number.isFinite(Number(input.toleranceMinutes)) ? Number(input.toleranceMinutes) : 30;
    const deltaMinutes = Math.floor((completed - plannedAt) / 60000);
    const eligible = deltaMinutes >= -360 && deltaMinutes <= tolerance;
    const ritualAnchor = plannedAt.getHours() < 6 ? addDays(plannedAt, -1) : plannedAt;
    return {
      plannedAt: plannedAt.toISOString(),
      completedAt: completed.toISOString(),
      ritualDate: dateKey(ritualAnchor),
      lateMinutes: Math.max(0, deltaMinutes),
      eligible
    };
  }

  function calculateOnTimeStreak(records) {
    if (!Array.isArray(records) || !records.length) return 0;
    const byDate = new Map();
    records.forEach(record => {
      if (record && /^\d{4}-\d{2}-\d{2}$/.test(record.ritualDate || '')) {
        byDate.set(record.ritualDate, Boolean(record.eligible));
      }
    });
    const dates = [...byDate.keys()].sort();
    if (!dates.length || !byDate.get(dates[dates.length - 1])) return 0;
    let streak = 1;
    for (let index = dates.length - 1; index > 0; index -= 1) {
      const current = new Date(`${dates[index]}T12:00:00`);
      const previous = new Date(`${dates[index - 1]}T12:00:00`);
      const gap = Math.round((current - previous) / DAY_MS);
      if (gap !== 1 || !byDate.get(dates[index - 1])) break;
      streak += 1;
    }
    return streak;
  }

  function rewardDrawCount(streak) {
    return streak === 3 || streak === 7 ? 2 : 1;
  }

  function canRevealReward(record, now) {
    if (!record || !record.eligible || record.rewardRevealedAt || !record.completedAt) return false;
    return dateKey(now || new Date()) > dateKey(record.completedAt);
  }

  function drawRewards(pool, count, random) {
    const validPool = Array.isArray(pool) ? pool.filter(art => validateArt(art).ok) : [];
    if (!validPool.length || count <= 0) return [];
    const rng = typeof random === 'function' ? random : Math.random;
    return Array.from({ length: count }, () => {
      const raw = Number(rng());
      const normalized = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0;
      const art = validPool[Math.floor(normalized * validPool.length)];
      return { artId: art.id, awardedAt: new Date().toISOString() };
    });
  }

  function summarizeCollection(rewards) {
    const counts = {};
    (Array.isArray(rewards) ? rewards : []).forEach(reward => {
      if (reward && reward.artId) counts[reward.artId] = (counts[reward.artId] || 0) + 1;
    });
    return { totalCards: Object.values(counts).reduce((sum, value) => sum + value, 0), uniqueWorks: Object.keys(counts).length, counts };
  }

  function validateArt(art) {
    const required = ['id', 'title', 'artist', 'year', 'thumbnail', 'image', 'alt', 'source', 'article'];
    const errors = required.filter(key => typeof art?.[key] !== 'string' || !art[key].trim());
    return { ok: errors.length === 0, errors };
  }

  function validateConfig(config) {
    const errors = [];
    if (!config || config.schemaVersion !== SCHEMA_VERSION) errors.push('schemaVersion');
    if (!config?.app?.name || !config?.app?.homeQuestion) errors.push('app');
    if (!config?.schedule?.bedtime || !config?.schedule?.wakeTime) errors.push('schedule');
    if (!Number.isFinite(Number(config?.ritual?.toleranceMinutes))) errors.push('ritual.toleranceMinutes');
    if (!Array.isArray(config?.artPool) || !config.artPool.length || config.artPool.some(art => !validateArt(art).ok)) errors.push('artPool');
    return { ok: errors.length === 0, errors };
  }

  function parseEnvelope(text, kind) {
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON 解析失败：${error.message}`);
    }
    if (!envelope || envelope.kind !== kind) throw new Error('导入文件类型不匹配');
    if (envelope.schemaVersion !== SCHEMA_VERSION) throw new Error('导入文件版本不受支持');
    if (!Object.prototype.hasOwnProperty.call(envelope, 'data')) throw new Error('导入文件缺少 data');
    return envelope.data;
  }

  return {
    SCHEMA_VERSION,
    DEFAULT_CONFIG,
    dateKey,
    evaluateCompletion,
    calculateOnTimeStreak,
    rewardDrawCount,
    canRevealReward,
    drawRewards,
    summarizeCollection,
    validateArt,
    validateConfig,
    parseEnvelope
  };
});
