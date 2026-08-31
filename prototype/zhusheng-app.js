(function () {
  'use strict';

  const core = window.ZhushengCore;
  if (!core) throw new Error('烛生核心脚本未加载');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const app = $('#app');
  const nav = $('#bottomNav');
  const toast = $('#toast');
  const memory = new Map();
  let persistent = true;
  let selectedRecord = null;
  let selectedArt = null;
  let pendingReward = null;

  const storage = {
    get(key, fallback = '') {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch {
        persistent = false;
        return memory.has(key) ? memory.get(key) : fallback;
      }
    },
    set(key, value) {
      memory.set(key, String(value));
      try { localStorage.setItem(key, String(value)); }
      catch { persistent = false; }
    },
    remove(key) {
      memory.delete(key);
      try { localStorage.removeItem(key); }
      catch { persistent = false; }
    }
  };

  function readJson(key, fallback) {
    try { return JSON.parse(storage.get(key, JSON.stringify(fallback))); }
    catch { return fallback; }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  let config = readJson('zhusheng-runtime-config-v1', clone(core.DEFAULT_CONFIG));
  if (!core.validateConfig(config).ok) config = clone(core.DEFAULT_CONFIG);

  const data = {
    screen: 'welcome',
    bedtime: storage.get('zhusheng-bedtime', config.schedule.bedtime),
    wake: storage.get('zhusheng-wake', config.schedule.wakeTime),
    reason: storage.get('zhusheng-reason', '我还在刷手机'),
    reduced: storage.get('zhusheng-reduced', '') === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches,
    lastScreen: storage.get('zhusheng-last-screen', ''),
    tick: null,
    clearTimer: null
  };

  const validScreens = new Set($$('.screen').map(screen => screen.dataset.screen));
  const navScreens = new Set(['home', 'journal', 'collection', 'settings']);
  const resumableScreens = new Set(['resistance', 'gratitude', 'plan', 'prep', 'quiet']);
  const navAssets = {
    home: ['nav-home-on.svg', 'nav-journal-off-dark.svg', 'nav-collection-off-dark.svg', 'nav-settings-off-dark.svg'],
    journal: ['nav-home-off.svg', 'nav-journal-on.svg', 'nav-collection-off.svg', 'nav-settings-off.svg'],
    collection: ['nav-home-off-c.svg', 'nav-journal-off-c.svg', 'nav-collection-on.svg', 'nav-settings-off-c.svg'],
    settings: ['nav-home-off-s.svg', 'nav-journal-off-s.svg', 'nav-collection-off-s.svg', 'nav-settings-on.svg']
  };

  function say(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(say.timer);
    say.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function records() { return readJson('zhusheng-records-v2', []); }
  function rewards() { return readJson('zhusheng-rewards-v2', []); }
  function events() { return readJson('zhusheng-events-v1', []); }

  function writeRecords(value) { storage.set('zhusheng-records-v2', JSON.stringify(value)); }
  function writeRewards(value) { storage.set('zhusheng-rewards-v2', JSON.stringify(value)); }

  function queueEvent(type, detail = {}) {
    const safe = { type, at: new Date().toISOString(), ...detail };
    delete safe.gratitudes;
    delete safe.plans;
    const next = events().concat(safe).slice(-200);
    storage.set('zhusheng-events-v1', JSON.stringify(next));
  }

  function readWriting() {
    return {
      gratitudes: $$('.gratitude-input').map(input => input.value.trim()).filter(Boolean),
      plans: $$('.plan-input').map(input => input.value.trim()).filter(Boolean)
    };
  }

  function saveWriting() {
    const writing = readWriting();
    storage.set('zhusheng-gratitudes', JSON.stringify(writing.gratitudes));
    storage.set('zhusheng-plans', JSON.stringify(writing.plans));
    renderDetail(writing.gratitudes, writing.plans);
  }

  function renderDetail(gratitudes, plans) {
    $('#detailGratitudes').innerHTML = gratitudes?.length
      ? gratitudes.slice(0, 3).map((value, index) => `<div class="detail-item"><b>0${index + 1}</b><span>${escapeHtml(value)}</span></div>`).join('')
      : '<div class="detail-empty">今晚还没有写下感恩。</div>';
    $('#detailPlans').innerHTML = plans?.length
      ? plans.slice(0, 3).map(value => `<div class="detail-item"><b>○</b><span>${escapeHtml(value)}</span></div>`).join('')
      : '<div class="detail-empty">明天的三件事还没有填写。</div>';
  }

  function ensureCompletion() {
    const now = new Date();
    const assessment = core.evaluateCompletion({
      plannedTime: data.bedtime,
      completedAt: now,
      toleranceMinutes: Number(config.ritual.toleranceMinutes)
    });
    const existing = records().find(record => record.ritualDate === assessment.ritualDate);
    if (existing) return existing;
    const writing = readWriting();
    const record = {
      id: `night-${assessment.ritualDate}`,
      ...assessment,
      plannedTime: data.bedtime,
      reason: data.reason,
      gratitudes: writing.gratitudes,
      plans: writing.plans,
      rewardRevealedAt: ''
    };
    writeRecords(records().concat(record));
    storage.remove('zhusheng-last-screen');
    queueEvent('ritual_completed', { ritualDate: record.ritualDate, eligible: record.eligible, lateMinutes: record.lateMinutes });
    renderAllRecords();
    return record;
  }

  function revealPendingRewards(now = new Date()) {
    const allRecords = records();
    const allRewards = rewards();
    const pending = allRecords.filter(record => core.canRevealReward(record, now));
    if (!pending.length) return null;
    let latest = null;
    pending.forEach(record => {
      const throughNight = allRecords.filter(item => item.ritualDate <= record.ritualDate);
      const streak = core.calculateOnTimeStreak(throughNight);
      const draws = core.drawRewards(config.artPool, core.rewardDrawCount(streak));
      const awardedAt = now.toISOString();
      draws.forEach((draw, index) => {
        const art = config.artPool.find(item => item.id === draw.artId);
        if (!art) return;
        latest = { id: `${record.id}-${index}-${Date.now()}`, recordId: record.id, artId: art.id, awardedAt, streak, art: clone(art) };
        allRewards.push(latest);
      });
      record.rewardRevealedAt = awardedAt;
      queueEvent('reward_revealed', { ritualDate: record.ritualDate, draws: draws.length, streak });
    });
    writeRecords(allRecords);
    writeRewards(allRewards);
    renderAllRecords();
    return latest;
  }

  function renderReward(reward) {
    if (!reward) return;
    pendingReward = reward;
    $('#rewardImage').src = reward.art.thumbnail;
    $('#rewardImage').alt = reward.art.alt;
    $('#rewardArtTitle').textContent = `《${reward.art.title}》`;
    $('#rewardArtMeta').innerHTML = `${escapeHtml(reward.art.artist)}<br>${escapeHtml(reward.art.year)}`;
    $('#rewardSummary').textContent = reward.streak === 3 || reward.streak === 7 ? `连续按时 ${reward.streak} 晚，获得额外礼物` : '昨夜按时熄灯';
    $('#rewardDetail').textContent = reward.streak === 3 || reward.streak === 7 ? '今晚共获得两张随机艺术卡，重复作品也会累计次数。' : '这份礼物已经收入你的收藏。';
  }

  function updateNav(screen) {
    const show = navScreens.has(screen);
    nav.classList.toggle('show', show);
    nav.classList.toggle('dark', screen === 'home');
    if (!show) return;
    const files = navAssets[screen];
    $$('[data-nav]', nav).forEach((button, index) => {
      const active = button.dataset.nav === screen;
      button.classList.toggle('active', active);
      active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
      $('img', button).src = `./image/zhusheng-sleep-ui/${files[index]}`;
    });
  }

  function navigate(screen, options = {}) {
    const replace = Boolean(options.replace);
    if (!validScreens.has(screen)) screen = storage.get('zhusheng-onboarded', '') === 'true' ? 'home' : 'welcome';
    if (screen === 'reward' && !pendingReward) screen = 'collection';
    if (screen === 'journal-detail' && !selectedRecord) screen = 'journal';
    if (screen === 'art-detail' && !selectedArt) screen = 'collection';
    $$('.screen').forEach(element => {
      const active = element.dataset.screen === screen;
      element.classList.toggle('active', active);
      element.setAttribute('aria-hidden', String(!active));
      if (active && element.classList.contains('record-screen')) element.scrollTop = 0;
    });
    data.screen = screen;
    app.dataset.screen = screen;
    if (resumableScreens.has(screen)) storage.set('zhusheng-last-screen', screen);
    if (screen === 'goodnight') ensureCompletion();
    if (screen === 'story') requestAnimationFrame(playStory);
    else if (!$('#storyVideo').paused) $('#storyVideo').pause();
    updateNav(screen);
    renderResumeState();
    const url = `#${screen}`;
    if (location.hash !== url) history[replace ? 'replaceState' : 'pushState']({ screen }, '', url);
  }

  function renderResumeState() {
    data.lastScreen = storage.get('zhusheng-last-screen', '');
    $('#resumeNote').classList.toggle('hidden', !resumableScreens.has(data.lastScreen));
  }

  function formatDate(iso) {
    const date = new Date(iso);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatClock(iso) {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function renderJournal() {
    const all = records().slice().sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    $('#journalEmpty').classList.toggle('hidden', all.length > 0);
    $('#nightList').classList.toggle('hidden', all.length === 0);
    $('#nightList').innerHTML = '<h2>夜晚明细</h2>' + all.map(record => `<button class="night-row${record.eligible ? '' : ' late'}" data-record-id="${escapeHtml(record.id)}"><strong>${escapeHtml(formatDate(record.completedAt))}</strong><small>${escapeHtml(record.plannedTime)} → ${escapeHtml(formatClock(record.completedAt))}</small><em>${record.eligible ? '按时完成' : `晚 ${record.lateMinutes} 分钟`}&nbsp; ›</em></button>`).join('');
    $$('[data-record-id]', $('#nightList')).forEach(button => button.addEventListener('click', () => {
      selectedRecord = all.find(record => record.id === button.dataset.recordId) || null;
      if (!selectedRecord) return;
      $('#detailTitle').textContent = formatDate(selectedRecord.completedAt);
      const times = $$('.comparison-times span');
      times[0].textContent = selectedRecord.plannedTime;
      times[1].textContent = formatClock(selectedRecord.completedAt);
      $('.comparison-note').textContent = selectedRecord.eligible ? '在计划容差内完成' : `超过计划 ${selectedRecord.lateMinutes} 分钟`;
      renderDetail(selectedRecord.gratitudes, selectedRecord.plans);
      navigate('journal-detail');
    }));
  }

  function artForReward(reward) {
    return reward.art || config.artPool.find(art => art.id === reward.artId);
  }

  function renderCollection() {
    const all = rewards().slice().sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
    const summary = core.summarizeCollection(all);
    $('#collectionCount').textContent = `累计 ${summary.totalCards} 张 · ${summary.uniqueWorks} 幅作品`;
    $('#collectionEmpty').classList.toggle('hidden', all.length > 0);
    $$('[data-record-content]', $('[data-screen="collection"]')).forEach(element => element.classList.toggle('hidden', all.length === 0));
    const unique = [...new Set(all.map(reward => reward.artId))].map(id => {
      const reward = all.find(item => item.artId === id);
      return { reward, art: artForReward(reward), count: summary.counts[id] };
    }).filter(item => item.art);
    $('#collectionGrid').innerHTML = unique.map(item => `<button class="collection-main" data-art-id="${escapeHtml(item.art.id)}"><span class="collection-image-frame"><img class="stateful-image is-loaded" src="${escapeHtml(item.art.image)}" alt="${escapeHtml(item.art.alt)}"><span class="image-error-state" role="status">艺术图片暂时没有加载出来，请稍后再试。</span></span><h2>${escapeHtml(item.art.title)}</h2><small>获得 ${item.count} 次</small></button>`).join('');
    $$('[data-art-id]', $('#collectionGrid')).forEach(button => button.addEventListener('click', () => {
      const item = unique.find(entry => entry.art.id === button.dataset.artId);
      selectedArt = item?.art || null;
      if (!selectedArt) return;
      $('.art-image').src = selectedArt.image;
      $('.art-image').alt = selectedArt.alt;
      $('#artTitle').textContent = `《${selectedArt.title}》`;
      $('.art-copy>p').textContent = `${selectedArt.artist} · ${selectedArt.year}`;
      $('.story-blank small').textContent = selectedArt.article;
      navigate('art-detail');
    }));
  }

  function renderAllRecords() {
    renderJournal();
    renderCollection();
  }

  function bedtimeInfo(value) {
    const [hour, minute] = value.split(':').map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target - now < -6 * 3600000) target.setDate(target.getDate() + 1);
    const delta = Math.floor((target - now) / 1000);
    return delta < 0 ? { seconds: 0, late: -delta } : { seconds: delta, late: 0 };
  }

  function formatLong(seconds) {
    const hour = Math.floor(seconds / 3600);
    const minute = Math.floor((seconds % 3600) / 60);
    const second = seconds % 60;
    return [hour, minute, second].map(value => String(value).padStart(2, '0')).join(' : ');
  }

  function sleepDuration() {
    const [bedHour, bedMinute] = data.bedtime.split(':').map(Number);
    const [wakeHour, wakeMinute] = data.wake.split(':').map(Number);
    let minutes = (wakeHour * 60 + wakeMinute) - (bedHour * 60 + bedMinute);
    if (minutes <= 0) minutes += 1440;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return minute ? `${hour} 小时 ${minute} 分钟` : `${hour} 小时`;
  }

  function updateTimes() {
    const info = bedtimeInfo(data.bedtime);
    $('#distanceLabel').textContent = info.late ? '比计划晚了' : '距离入睡';
    $('#homeCountdown').textContent = formatLong(info.late || info.seconds);
    $('#durationLabel').textContent = sleepDuration();
    $('#wakeLabel').textContent = data.wake;
    $('#prepCountdown').textContent = info.late ? '现在就可以熄灯' : formatLong(info.seconds);
    $('#quietCountdown').textContent = info.late ? '00 : 00' : formatLong(info.seconds);
    app.dataset.ritualPhase = info.late || info.seconds === 0 ? 'sleep' : info.seconds <= Number(config.ritual.dimMinutes) * 60 ? 'near' : 'prepare';
    if (data.screen === 'quiet' && (info.late || info.seconds === 0)) navigate('goodnight');
  }

  function applyConfig() {
    data.bedtime = storage.get('zhusheng-bedtime', config.schedule.bedtime);
    data.wake = storage.get('zhusheng-wake', config.schedule.wakeTime);
    $('#bedtime').value = data.bedtime;
    $('#homeTitle').textContent = config.app.homeQuestion;
    $('.home-brand').textContent = config.app.name;
    $('#goodnightTitle').nextElementSibling.textContent = config.ritual.goodnightText;
    updateTimes();
  }

  function applySettings() {
    app.dataset.reduced = String(data.reduced);
    $('#motionDescription').textContent = `减少动态效果：${data.reduced ? '开启' : '关闭'}`;
    $('#motionToggle').textContent = data.reduced ? '已开启' : '设置';
  }

  function downloadJson(filename, envelope) {
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function readFile(file, callback) {
    const reader = new FileReader();
    reader.onload = () => callback(String(reader.result || ''));
    reader.onerror = () => say('文件读取失败');
    reader.readAsText(file, 'utf-8');
  }

  function exportBackup() {
    const payload = {
      records: records(), rewards: rewards(), events: events(),
      bedtime: data.bedtime, wake: data.wake, reduced: data.reduced,
      config
    };
    downloadJson(`烛生本地备份-${core.dateKey(new Date())}.json`, { kind: 'zhusheng-backup', schemaVersion: core.SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: payload });
    say('备份已导出，请妥善保管私人内容');
  }

  function importBackupText(text) {
    const payload = core.parseEnvelope(text, 'zhusheng-backup');
    if (!Array.isArray(payload.records) || !Array.isArray(payload.rewards) || !core.validateConfig(payload.config).ok) throw new Error('备份内容不完整');
    if (!confirm(`将导入 ${payload.records.length} 条夜记和 ${payload.rewards.length} 张收藏卡，并覆盖当前本地数据。是否继续？`)) return;
    storage.set('zhusheng-records-v2', JSON.stringify(payload.records));
    storage.set('zhusheng-rewards-v2', JSON.stringify(payload.rewards));
    storage.set('zhusheng-events-v1', JSON.stringify(Array.isArray(payload.events) ? payload.events : []));
    storage.set('zhusheng-runtime-config-v1', JSON.stringify(payload.config));
    config = payload.config;
    data.bedtime = payload.bedtime || config.schedule.bedtime;
    data.wake = payload.wake || config.schedule.wakeTime;
    data.reduced = Boolean(payload.reduced);
    storage.set('zhusheng-bedtime', data.bedtime);
    storage.set('zhusheng-wake', data.wake);
    storage.set('zhusheng-reduced', String(data.reduced));
    applyConfig(); applySettings(); renderAllRecords();
    say('本地备份已导入');
  }

  function importConfigText(text) {
    const incoming = core.parseEnvelope(text, 'zhusheng-config');
    const validation = core.validateConfig(incoming);
    if (!validation.ok) throw new Error(`配置缺少：${validation.errors.join('、')}`);
    config = incoming;
    storage.set('zhusheng-runtime-config-v1', JSON.stringify(config));
    applyConfig(); renderAllRecords();
    say('运营配置已导入并生效');
  }

  const storyVideo = $('#storyVideo');
  const storyScreen = $('#storyScreen');
  const storyStatus = $('#storyStatus');
  const storyProgress = $('#storyProgress');
  const storyContinue = $('#storyContinue');

  async function playStory() {
    storyScreen.classList.remove('video-error', 'video-paused', 'video-complete');
    storyVideo.currentTime = 0;
    storyVideo.muted = true;
    storyProgress.style.transform = 'scaleX(0)';
    if (data.reduced) {
      storyVideo.pause(); storyScreen.classList.add('video-paused');
      storyStatus.textContent = '已开启减少动态效果，可以直接进入烛生。';
      storyContinue.textContent = '进入烛生';
      return;
    }
    storyContinue.textContent = '播放序章';
    try { await storyVideo.play(); }
    catch { storyScreen.classList.add('video-paused'); storyStatus.textContent = '轻触按钮，播放今晚的序章。'; }
  }

  storyVideo.addEventListener('timeupdate', () => {
    const progress = storyVideo.duration ? Math.min(1, storyVideo.currentTime / storyVideo.duration) : 0;
    storyProgress.style.transform = `scaleX(${progress})`;
  });
  storyVideo.addEventListener('ended', () => {
    storyScreen.classList.add('video-complete'); storyStatus.textContent = '序章结束，今晚从这里开始。';
    storyContinue.textContent = '进入烛生'; storyProgress.style.transform = 'scaleX(1)';
  });
  storyVideo.addEventListener('error', () => {
    storyScreen.classList.add('video-error'); storyStatus.textContent = '视频没有加载出来，你仍然可以继续。'; storyContinue.textContent = '进入烛生';
  });
  $('#skipStory').addEventListener('click', () => { storage.set('zhusheng-onboarded', 'true'); navigate('home'); });
  storyContinue.addEventListener('click', () => {
    if (data.reduced || storyScreen.classList.contains('video-error') || storyScreen.classList.contains('video-complete')) {
      storage.set('zhusheng-onboarded', 'true'); navigate('home');
    } else playStory();
  });

  $$('.reason-card').forEach(card => card.addEventListener('click', () => {
    $$('.reason-card').forEach(item => { item.classList.toggle('selected', item === card); item.setAttribute('aria-checked', String(item === card)); });
    data.reason = card.dataset.reason; storage.set('zhusheng-reason', data.reason); $('#gentleReply').textContent = `“${card.dataset.reply}”`;
  }));
  $$('.gratitude-input').forEach(input => input.addEventListener('input', () => { $('#gratitudeCount').textContent = $$('.gratitude-input').filter(item => item.value.trim()).length; saveWriting(); }));
  $$('.plan-input').forEach(input => input.addEventListener('input', saveWriting));
  $('#bedtime').value = data.bedtime;
  $('#bedtime').addEventListener('change', event => { data.bedtime = event.target.value || config.schedule.bedtime; storage.set('zhusheng-bedtime', data.bedtime); updateTimes(); });
  $('#resumeRitual').addEventListener('click', () => navigate(data.lastScreen || 'resistance'));
  $('#motionToggle').addEventListener('click', () => { data.reduced = !data.reduced; storage.set('zhusheng-reduced', String(data.reduced)); applySettings(); say(data.reduced ? '已开启减少动态效果' : '已恢复柔和动效'); });

  $$('[data-next]').forEach(button => button.addEventListener('click', () => { saveWriting(); navigate(button.dataset.next); }));
  $$('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
  $$('[data-toast]').forEach(button => button.addEventListener('click', event => { if (button.tagName === 'A') event.preventDefault(); say(button.dataset.toast); }));

  $('#openLegal').addEventListener('click', () => { $('#legalDialog').hidden = false; $('#closeLegal').focus(); });
  $('#closeLegal').addEventListener('click', () => { $('#legalDialog').hidden = true; $('#openLegal').focus(); });
  $('#legalDialog').addEventListener('click', event => { if (event.target === $('#legalDialog')) $('#closeLegal').click(); });

  $('#importConfig').addEventListener('click', () => $('#importConfigInput').click());
  $('#importConfigInput').addEventListener('change', event => {
    const file = event.target.files?.[0]; if (!file) return;
    readFile(file, text => { try { importConfigText(text); } catch (error) { say(error.message); } event.target.value = ''; });
  });
  $('#exportBackup').addEventListener('click', exportBackup);
  $('#importBackup').addEventListener('click', () => $('#importBackupInput').click());
  $('#importBackupInput').addEventListener('change', event => {
    const file = event.target.files?.[0]; if (!file) return;
    readFile(file, text => { try { importBackupText(text); } catch (error) { say(error.message); } event.target.value = ''; });
  });

  $('#clearData').addEventListener('click', () => {
    const button = $('#clearData');
    if (!button.classList.contains('armed')) {
      button.classList.add('armed'); button.textContent = '再次点击确认清除'; say('将清除本设备上的夜记、收藏与书写内容');
      clearTimeout(data.clearTimer); data.clearTimer = setTimeout(() => { button.classList.remove('armed'); button.textContent = '清除本地数据'; }, 4200); return;
    }
    ['zhusheng-records-v2', 'zhusheng-rewards-v2', 'zhusheng-events-v1', 'zhusheng-gratitudes', 'zhusheng-plans', 'zhusheng-last-screen'].forEach(storage.remove);
    $$('.gratitude-input,.plan-input').forEach(input => { input.value = ''; });
    $('#gratitudeCount').textContent = '0'; renderAllRecords(); renderDetail([], []);
    button.classList.remove('armed'); button.textContent = '清除本地数据'; say('本地睡前数据已清除');
  });

  addEventListener('popstate', () => navigate(location.hash.slice(1) || 'home', { replace: true }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#legalDialog').hidden) $('#closeLegal').click(); });

  const savedGratitudes = readJson('zhusheng-gratitudes', []);
  const savedPlans = readJson('zhusheng-plans', []);
  savedGratitudes.forEach((value, index) => { if ($$('.gratitude-input')[index]) $$('.gratitude-input')[index].value = value; });
  savedPlans.forEach((value, index) => { if ($$('.plan-input')[index]) $$('.plan-input')[index].value = value; });
  $('#gratitudeCount').textContent = savedGratitudes.filter(Boolean).length;
  renderDetail(savedGratitudes, savedPlans);
  applyConfig(); applySettings(); renderResumeState(); renderAllRecords();
  const revealed = revealPendingRewards();
  if (revealed) renderReward(revealed);
  if (!persistent) setTimeout(() => say('当前浏览器禁止本地存储，关闭页面后数据不会保留'), 300);
  data.tick = setInterval(updateTimes, 1000);
  const requested = location.hash.slice(1);
  const initial = revealed ? 'reward' : requested || (storage.get('zhusheng-onboarded', '') === 'true' ? 'home' : 'welcome');
  navigate(initial, { replace: true });
})();
