const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../zhusheng-core.js');

test('30 分钟容差内完成可获得奖励', () => {
  const result = core.evaluateCompletion({
    plannedTime: '23:30',
    completedAt: '2026-08-27T23:59:00+08:00',
    toleranceMinutes: 30
  });
  assert.equal(result.eligible, true);
  assert.equal(result.lateMinutes, 29);
  assert.equal(result.ritualDate, '2026-08-27');
});

test('跨午夜超过 30 分钟不具备奖励资格', () => {
  const result = core.evaluateCompletion({
    plannedTime: '23:30',
    completedAt: '2026-08-28T00:01:00+08:00',
    toleranceMinutes: 30
  });
  assert.equal(result.eligible, false);
  assert.equal(result.lateMinutes, 31);
  assert.equal(result.ritualDate, '2026-08-27');
});

test('凌晨计划时间属于当晚而不是前一天', () => {
  const result = core.evaluateCompletion({
    plannedTime: '01:30',
    completedAt: '2026-08-28T01:45:00+08:00',
    toleranceMinutes: 30
  });
  assert.equal(result.eligible, true);
  assert.equal(result.ritualDate, '2026-08-27');
});

test('连续 3 晚和 7 晚各增加一次抽卡', () => {
  assert.equal(core.rewardDrawCount(1), 1);
  assert.equal(core.rewardDrawCount(3), 2);
  assert.equal(core.rewardDrawCount(4), 1);
  assert.equal(core.rewardDrawCount(7), 2);
  assert.equal(core.rewardDrawCount(8), 1);
});

test('连续记录只计算相邻自然日的按时完成', () => {
  const records = [
    { ritualDate: '2026-08-25', eligible: true },
    { ritualDate: '2026-08-26', eligible: true },
    { ritualDate: '2026-08-27', eligible: true }
  ];
  assert.equal(core.calculateOnTimeStreak(records), 3);
  assert.equal(core.calculateOnTimeStreak([...records, { ritualDate: '2026-08-28', eligible: false }]), 0);
});

test('奖励必须到完成后的下一自然日才能揭晓', () => {
  const record = {
    ritualDate: '2026-08-27',
    completedAt: '2026-08-27T23:59:00+08:00',
    eligible: true,
    rewardRevealedAt: ''
  };
  assert.equal(core.canRevealReward(record, new Date('2026-08-27T23:59:30+08:00')), false);
  assert.equal(core.canRevealReward(record, new Date('2026-08-28T07:00:00+08:00')), true);
  assert.equal(core.canRevealReward({ ...record, rewardRevealedAt: '2026-08-28T07:01:00+08:00' }, new Date('2026-08-28T08:00:00+08:00')), false);
});

test('随机抽取允许同一作品重复出现', () => {
  const pool = [{
    id: 'monet-1', title: '睡莲', artist: '莫奈', year: '1916',
    thumbnail: './image/thumb.jpg', image: './image/full.jpg', alt: '莫奈睡莲',
    source: '公共领域', article: '完整作品介绍'
  }];
  const rewards = core.drawRewards(pool, 2, () => 0);
  assert.equal(rewards.length, 2);
  assert.equal(rewards[0].artId, 'monet-1');
  assert.equal(rewards[1].artId, 'monet-1');
});

test('收藏摘要区分累计卡片和不同作品', () => {
  assert.deepEqual(
    core.summarizeCollection([{ artId: 'a' }, { artId: 'a' }, { artId: 'b' }]),
    { totalCards: 3, uniqueWorks: 2, counts: { a: 2, b: 1 } }
  );
});

test('艺术作品缺少版权来源或图片时不能进入奖励池', () => {
  const incomplete = core.validateArt({ id: 'a', title: '睡莲', artist: '莫奈' });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.includes('thumbnail'));
  assert.ok(incomplete.errors.includes('source'));
});

test('版本化配置必须包含合法艺术池', () => {
  const valid = structuredClone(core.DEFAULT_CONFIG);
  assert.equal(core.validateConfig(valid).ok, true);
  assert.equal(core.validateConfig({ schemaVersion: 99 }).ok, false);
});

test('导入包拒绝无效 JSON 和错误类型', () => {
  assert.throws(() => core.parseEnvelope('{bad json', 'zhusheng-config'), /JSON/);
  assert.throws(
    () => core.parseEnvelope(JSON.stringify({ kind: 'zhusheng-backup', schemaVersion: 1, data: {} }), 'zhusheng-config'),
    /类型/
  );
});
