(function () {
  'use strict';

  const Core = window.ZhushengCore;
  if (!Core) throw new Error('ZhushengCore 未加载');

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pages = { config: '小程序配置', onboarding: '游客与引导', ritual: '睡前仪式', records: '夜记与收藏', art: '艺术内容库' };
  const storageKey = 'zhusheng-admin-config-v1';
  document.body.classList.add('js-ready');
  const clone = value => JSON.parse(JSON.stringify(value));
  const memory = {};
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return memory[key] || null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) { memory[key] = value; } }
  };

  let config = loadConfig();
  let lastFocus = null;
  let toastTimer = null;
  let editingArtId = null;

  function loadConfig() {
    try {
      const value = JSON.parse(store.get(storageKey));
      if (Core.validateConfig(value).ok) return value;
    } catch (_) {}
    return clone(Core.DEFAULT_CONFIG);
  }

  function notify(message) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function markModified() {
    config.updatedBy = '管理员';
    config.updatedAt = new Date().toISOString();
    store.set(storageKey, JSON.stringify(config));
    renderAudit();
  }

  function renderAudit() {
    const text = config.updatedAt ? new Date(config.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '尚未修改';
    $('#lastModified').textContent = `最后修改：${config.updatedBy || '管理员'} · ${text}`;
  }

  function formData(form) {
    const result = {};
    new FormData(form).forEach((value, key) => { result[key] = value; });
    $$('input[type="checkbox"]', form).forEach(input => { result[input.name] = input.checked; });
    return result;
  }

  function applyForm(storeName, data) {
    if (storeName === 'config') {
      config.app = { name: data.appName, slogan: data.slogan, homeQuestion: data.homeQuestion };
      config.schedule = { bedtime: data.bedtime, wakeTime: data.wakeTime, minTime: data.minTime, maxTime: data.maxTime };
      config.features = { skipTonight: data.skipTonight, onboarding: data.onboarding, reduceMotion: data.reduceMotion };
    } else if (storeName === 'privacy') {
      config.legal = Object.assign({}, config.legal, { analyticsNotice: Core.DEFAULT_CONFIG.legal.analyticsNotice, anonymousAnalytics: data.anonymousAnalytics });
    } else if (storeName === 'onboarding') {
      config.onboarding = data;
    } else if (storeName === 'ritual') {
      config.ritual = Object.assign({}, config.ritual, {
        durationMinutes: Number(data.ritualMinutes), dimMinutes: Number(data.dimMinutes),
        goodnightText: data.goodnightText, interruptText: data.interruptText
      });
    } else if (storeName === 'ritual-writing') {
      config.ritual = Object.assign({}, config.ritual, {
        resistanceOptions: String(data.resistanceOptions || '').split(/\n+/).filter(Boolean),
        gratitudeCount: Number(data.gratitudeCount), planCount: Number(data.planCount), resistanceReply: data.resistanceReply
      });
    } else if (storeName === 'records') {
      config.ritual.toleranceMinutes = Number(data.completionWindow);
      config.records = Object.assign({}, config.records, {
        journalDays: Number(data.journalDays), journalEmptyCopy: data.journalEmptyCopy,
        comparisonCopy: data.comparisonCopy, collectionLimit: Number(data.collectionLimit),
        rewardTiming: 'next-day', rewardCopy: data.rewardCopy, collectionEmptyCopy: data.collectionEmptyCopy,
        randomArt: data.randomArt, imageFallback: data.imageFallback
      });
    }
  }

  function saveForm(form) {
    applyForm(form.dataset.store, formData(form));
    const validation = Core.validateConfig(config);
    if (!validation.ok) return notify(`配置未保存：${validation.errors.join('、')}`);
    markModified();
    notify('设置已保存，立即生效');
  }

  function go(view, updateHash = true) {
    if (!pages[view]) view = 'config';
    $$('.view').forEach(node => node.classList.toggle('active', node.dataset.page === view));
    $$('.nav-btn').forEach(button => button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'));
    $('#crumbTitle').textContent = pages[view];
    document.title = `${pages[view]} · 烛生管理后台`;
    store.set('zhusheng-admin-view', view);
    if (updateHash && location.hash !== `#${view}`) location.hash = view;
    closeNav();
  }

  function closeNav() {
    document.body.classList.remove('nav-open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
  }

  function openDialog(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    lastFocus = document.activeElement;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    $('input, button, textarea, select', overlay)?.focus();
  }

  function closeDialog(target) {
    const overlay = target.closest ? target.closest('.overlay') : target;
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    lastFocus?.focus();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function renderArt() {
    const rows = $('#artRows');
    rows.innerHTML = config.artPool.map(art => `<tr><td class="art-title">《${escapeHtml(art.title)}》</td><td>${escapeHtml(art.artist)}</td><td>${escapeHtml(art.year)}</td><td><span class="badge success">已完成</span></td><td><span class="badge success">已发布</span></td><td><button class="link-btn" type="button" data-art-id="${escapeHtml(art.id)}">查看</button></td></tr>`).join('');
    const metrics = $$('.metric-value', $('[data-page="art"]'));
    if (metrics[0]) metrics[0].textContent = String(config.artPool.length);
    if (metrics[1]) metrics[1].textContent = String(config.artPool.length);
    $$('[data-art-id]', rows).forEach(button => button.addEventListener('click', () => {
      const art = config.artPool.find(item => item.id === button.dataset.artId);
      if (!art) return;
      $('#artViewTitle').textContent = `《${art.title}》`;
      $('#artViewImage').src = art.image;
      $('#artViewImage').alt = art.alt;
      $('#artViewArtist').textContent = `艺术家：${art.artist}`;
      $('#artViewYear').textContent = `年代：${art.year}`;
      $('#artViewSource').textContent = `来源：${art.source}`;
      $('#artViewArticle').textContent = art.article;
      editingArtId = art.id;
      openDialog('artViewDialog');
    }));
    filterArt();
  }

  function filterArt() {
    const query = ($('#artSearch').value || '').trim().toLowerCase();
    const status = $('#artStatus').value;
    let visible = 0;
    $$('#artRows tr').forEach(row => {
      const show = (!query || row.textContent.toLowerCase().includes(query)) && (!status || row.textContent.includes(status));
      row.hidden = !show;
      if (show) visible += 1;
    });
    $('#artEmpty').style.display = visible ? 'none' : 'block';
  }

  function slug(value) {
    return String(value).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || `art-${Date.now()}`;
  }

  function addArt(event) {
    event.preventDefault();
    const art = {
      id: slug($('#newArtTitle').value), title: $('#newArtTitle').value.trim(), artist: $('#newArtist').value.trim(),
      year: $('#newYear').value.trim(), thumbnail: $('#newThumb').value.trim(), image: $('#newImage').value.trim(),
      alt: $('#newAlt').value.trim(), source: $('#newSource').value.trim(), article: $('#newArticle').value.trim()
    };
    const validation = Core.validateArt(art);
    if (!validation.ok) return notify(`作品资料不完整：${validation.errors.join('、')}`);
    if (editingArtId) {
      const index = config.artPool.findIndex(item => item.id === editingArtId);
      if (index >= 0) { art.id = editingArtId; config.artPool[index] = art; }
    } else {
      if (config.artPool.some(item => item.id === art.id)) art.id = `${art.id}-${Date.now()}`;
      config.artPool.unshift(art);
    }
    editingArtId = null;
    markModified();
    renderArt();
    event.currentTarget.reset();
    closeDialog($('#artDialog'));
    notify('作品内容已保存并立即生效');
  }

  function editPublishedArt() {
    const art = config.artPool.find(item => item.id === editingArtId);
    if (!art) return;
    $('#newArtTitle').value = art.title; $('#newArtist').value = art.artist; $('#newYear').value = art.year;
    $('#newSource').value = art.source; $('#newThumb').value = art.thumbnail; $('#newImage').value = art.image;
    $('#newAlt').value = art.alt; $('#newArticle').value = art.article;
    closeDialog($('#artViewDialog')); openDialog('artDialog');
    $('#artDialogTitle').textContent = '编辑已发布作品';
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportConfig() {
    const validation = Core.validateConfig(config);
    if (!validation.ok) return notify(`不能导出：${validation.errors.join('、')}`);
    const envelope = { kind: 'zhusheng-config', schemaVersion: Core.SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: config };
    download('烛生-小程序配置.json', JSON.stringify(envelope, null, 2), 'application/json;charset=utf-8');
    notify('小程序配置已导出');
  }

  $$('.nav-btn').forEach(button => button.addEventListener('click', () => go(button.dataset.view)));
  $('#menuBtn').addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  });
  $('#backdrop').addEventListener('click', closeNav);
  window.addEventListener('hashchange', () => go(location.hash.slice(1), false));
  $$('.save-form').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); saveForm(form); }));
  $$('[data-open]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.open === 'artDialog') { editingArtId = null; $('#artDialogTitle').textContent = '新增艺术作品'; }
    openDialog(button.dataset.open);
  }));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button)));
  $$('.overlay').forEach(overlay => overlay.addEventListener('mousedown', event => { if (event.target === overlay) closeDialog(overlay); }));
  $$('[data-toast]').forEach(button => button.addEventListener('click', () => notify(button.dataset.toast)));
  $('#artSearch').addEventListener('input', filterArt);
  $('#artStatus').addEventListener('change', filterArt);
  $('#artForm').addEventListener('submit', addArt);
  $('#editPublishedArt').addEventListener('click', editPublishedArt);
  $('#exportConfig').addEventListener('click', exportConfig);
  $('[data-export="art"]').addEventListener('click', () => {
    const lines = ['作品,艺术家,年代,来源'].concat(config.artPool.map(art => [art.title, art.artist, art.year, art.source].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')));
    download('烛生-艺术内容库.csv', `\ufeff${lines.join('\n')}`, 'text/csv;charset=utf-8');
    notify('艺术清单已导出');
  });
  $('#globalSearch').addEventListener('input', event => {
    const match = Object.entries(pages).find(([, title]) => title.includes(event.target.value.trim()));
    if (match) go(match[0]);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { const overlay = $('.overlay.open'); overlay ? closeDialog(overlay) : closeNav(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#globalSearch').focus(); }
  });

  renderAudit();
  renderArt();
  go(location.hash.slice(1) || store.get('zhusheng-admin-view') || 'config', false);
})();
