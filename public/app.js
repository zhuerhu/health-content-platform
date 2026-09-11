/* ===========================================================================
 * 健康内容中台 · 内容广场（服务端版）
 * 数据来自后端 /api/config 与 /api/contents（一次性拉全量后本地筛选）。
 * 除「数据来源」外，逻辑与分享版 share/app.js 完全一致。
 *
 * 筛选语义（与后端 /api/contents 一致）：跨维度 AND；同维度内 OR。
 * =========================================================================== */

/* ---------------- 数据来源（服务端版：拉 API） ---------------- */
let CONFIG = {};
let ALL_ITEMS = [];
async function loadSource() {
  const [cfg, items] = await Promise.all([
    fetch('/api/config').then(r => r.json()),
    fetch('/api/contents').then(r => r.json())
  ]);
  CONFIG = cfg || {};
  ALL_ITEMS = Array.isArray(items) ? items : [];
}

/* ---------------- 常量 ---------------- */
const ICONS = {
  '膳食营养库': '🥗', '慢病管理库': '❤️', '生活实操库': '🍳',
  '辟谣真相库': '🔍', '专家答疑库': '💬', '健康陪伴库': '🤝'
};
const FAV_KEY = 'hcp_favorites_v1';
const SORT_LABEL = { new: '最新优先', old: '最早优先', title: '按标题排序' };
const DIM_LABEL = { subtopic: '细分主题', disease: '内容标签', format: '内容形态', journey: '内容深度' };

/* URL 参数名（保持简短，链接更好看） */
const P = { category: 'cat', disease: 'dis', format: 'fmt', journey: 'jrn', subtopic: 'sub', q: 'q', sort: 'sort', fav: 'fav', view: 'view' };
const SET_DIMS = ['subtopic', 'disease', 'format', 'journey'];

/* ---------------- 状态 ---------------- */
const state = {
  disease: new Set(), format: new Set(), journey: new Set(), subtopic: new Set(),
  category: '', q: '', sort: 'new', favOnly: false, view: 'grid'
};
let favorites = new Set(readFavs());
let current = [];        // 当前筛出的列表
let modalItem = null;    // 弹窗中的内容

/* ---------------- 小工具 ---------------- */
const el = id => document.getElementById(id);
const uniq = arr => [...new Set(arr)];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hl(text, kw) {
  const s = escapeHtml(text);
  if (!kw) return s;
  const k = escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return k ? s.replace(new RegExp(k, 'gi'), m => `<mark>${m}</mark>`) : s;
}
function colorOf(cat) { return (CONFIG.CATEGORY_COLOR && CONFIG.CATEGORY_COLOR[cat]) || '#2e9e5b'; }
function iconOf(cat) { return ICONS[cat] || '🌿'; }
function allSubtopics() { return uniq(Object.values(CONFIG.SUBTOPICS || {}).flat()); }
function subtopicsOf(cat) { return (CONFIG.SUBTOPICS && CONFIG.SUBTOPICS[cat]) || []; }
function subtypeSet(dim) {
  return dim === 'disease' ? (CONFIG.DISEASE_TAGS || [])
    : dim === 'format' ? (CONFIG.FORMAT_TAGS || [])
      : dim === 'journey' ? (CONFIG.JOURNEY_TAGS || [])
        : allSubtopics();
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toggleIn(set, v, force) {
  if (force === true || !set.has(v)) set.add(v); else set.delete(v);
}

function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------------- 收藏（localStorage） ---------------- */
function readFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
}
function saveFavs() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); } catch (e) { /* 隐私模式忽略 */ }
}
function toggleFav(id) {
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  saveFavs();
  return favorites.has(id);
}

/* ---------------- URL ⇄ 状态 ---------------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  SET_DIMS.forEach(dim => {
    const v = p.get(P[dim]);
    if (v) v.split(',').filter(Boolean).forEach(t => state[dim].add(t));
  });
  state.category = p.get(P.category) || '';
  state.q = p.get(P.q) || '';
  state.sort = p.get(P.sort) || 'new';
  state.favOnly = p.get(P.fav) === '1';
  state.view = p.get(P.view) === 'list' ? 'list' : 'grid';

  // 容错：清理 URL 里已失效的值（旧链接 / 手改参数）
  if (!(CONFIG.CATEGORIES || []).includes(state.category)) state.category = '';
  SET_DIMS.forEach(dim => {
    const valid = new Set(subtypeSet(dim));
    [...state[dim]].forEach(t => { if (!valid.has(t)) state[dim].delete(t); });
  });
  if (!SORT_LABEL[state.sort]) state.sort = 'new';
}
function syncUrl() {
  const p = new URLSearchParams();
  if (state.category) p.set(P.category, state.category);
  SET_DIMS.forEach(dim => { if (state[dim].size) p.set(P[dim], [...state[dim]].join(',')); });
  if (state.q) p.set(P.q, state.q);
  if (state.sort !== 'new') p.set(P.sort, state.sort);
  if (state.favOnly) p.set(P.fav, '1');
  if (state.view !== 'grid') p.set(P.view, 'list');
  const qs = p.toString();
  try {
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  } catch (e) { /* 无 history 权限时忽略 */ }
}
function currentShareUrl() { return location.href; }

/* ---------------- 筛选 ---------------- */
function filterItems() {
  let items = ALL_ITEMS.slice();
  if (state.favOnly) items = items.filter(it => favorites.has(it.id));
  if (state.category) items = items.filter(it => it.category === state.category);
  if (state.disease.size) items = items.filter(it => [...state.disease].some(t => (it.diseaseTags || []).includes(t)));
  if (state.format.size) items = items.filter(it => [...state.format].some(t => (it.formatTags || []).includes(t)));
  if (state.journey.size) items = items.filter(it => [...state.journey].some(t => (it.journeyTags || []).includes(t)));
  if (state.subtopic.size) items = items.filter(it => [...state.subtopic].some(t => (it.subTopics || []).includes(t)));
  if (state.q) {
    const kw = state.q.toLowerCase();
    items = items.filter(it => [it.title, it.summary, it.body, it.category]
      .concat(it.diseaseTags || [], it.formatTags || [], it.journeyTags || [], it.subTopics || [])
      .join(' ').toLowerCase().includes(kw));
  }
  const byDate = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  if (state.sort === 'old') items.sort(byDate);
  else if (state.sort === 'title') items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN'));
  else items.sort((a, b) => byDate(b, a));
  return items;
}

/* ---------------- 渲染：统计 / 分类入口 ---------------- */
function renderStats() {
  const subtopicCount = allSubtopics().length;
  const tagCount = (CONFIG.DISEASE_TAGS || []).length + (CONFIG.FORMAT_TAGS || []).length + (CONFIG.JOURNEY_TAGS || []).length;
  const data = [
    { n: ALL_ITEMS.length, k: '条内容' },
    { n: (CONFIG.CATEGORIES || []).length, k: '大内容库' },
    { n: subtopicCount, k: '个细分主题' },
    { n: tagCount, k: '个内容标签' }
  ];
  el('stats').innerHTML = data.map(s => `<div class="stat"><div class="n">${s.n}</div><div class="k">${s.k}</div></div>`).join('');
}

function renderCats() {
  const box = el('cats');
  const max = Math.max(1, ...(CONFIG.CATEGORIES || []).map(c => ALL_ITEMS.filter(i => i.category === c).length));
  box.innerHTML = '';
  (CONFIG.CATEGORIES || []).forEach(cat => {
    const n = ALL_ITEMS.filter(i => i.category === cat).length;
    const subs = subtopicsOf(cat);
    const d = document.createElement('div');
    d.className = 'cat-card' + (state.category === cat ? ' active' : '');
    d.style.setProperty('--c', colorOf(cat));
    d.title = state.category === cat ? '再次点击取消该分类' : `只看「${cat}」`;
    d.innerHTML = `
      <div class="row">
        <div class="ic">${iconOf(cat)}</div>
        <div style="min-width:0">
          <div class="nm">${escapeHtml(cat)}</div>
          <div class="ct">${n} 条 · ${subs.length} 个主题</div>
        </div>
      </div>
      <div class="subs">${subs.map(escapeHtml).join(' · ')}</div>
      <div class="bar"><i style="width:${Math.round(n / max * 100)}%"></i></div>`;
    d.onclick = () => {
      if (state.category === cat) state.category = '';
      else { state.category = cat; state.subtopic.clear(); }
      el('category').value = state.category;
      applyState(true);
    };
    box.appendChild(d);
  });
}

/* ---------------- 渲染：筛选 pill / 已选条件 ---------------- */
function makePill(text, active, onclick) {
  const s = document.createElement('span');
  s.className = 'pill' + (active ? ' active' : '');
  s.textContent = text;
  s.onclick = onclick;
  return s;
}
function buildPills() {
  const fill = (id, tags, dim) => {
    const c = el(id); c.innerHTML = '';
    (tags || []).forEach(t => c.appendChild(makePill(t, state[dim].has(t), () => {
      toggleIn(state[dim], t); applyState();
    })));
  };
  fill('disease-pills', CONFIG.DISEASE_TAGS, 'disease');
  fill('format-pills', CONFIG.FORMAT_TAGS, 'format');
  fill('journey-pills', CONFIG.JOURNEY_TAGS, 'journey');
  buildSubtopicPills();
}
function buildSubtopicPills() {
  const c = el('subtopic-pills');
  c.innerHTML = '';
  const cats = state.category ? [state.category] : (CONFIG.CATEGORIES || []);
  cats.forEach(cat => {
    const subs = subtopicsOf(cat);
    if (!subs.length) return;
    const gl = document.createElement('span');
    gl.className = 'pill-group-label';
    gl.textContent = cat;
    c.appendChild(gl);
    subs.forEach(t => c.appendChild(makePill(t, state.subtopic.has(t), () => {
      toggleIn(state.subtopic, t); applyState();
    })));
  });
}

function renderActive() {
  const bar = el('active-bar');
  const chips = [];
  if (state.favOnly) chips.push({ t: '只看收藏', rm: () => { state.favOnly = false; } });
  if (state.category) chips.push({ t: '分类：' + state.category, rm: () => { state.category = ''; el('category').value = ''; } });
  SET_DIMS.forEach(dim => [...state[dim]].forEach(t => chips.push({ t: DIM_LABEL[dim] + '：' + t, rm: () => state[dim].delete(t) })));
  if (state.q) chips.push({ t: '关键词：' + state.q, rm: () => { state.q = ''; el('search').value = ''; } });

  if (!chips.length) { bar.classList.remove('show'); bar.innerHTML = ''; return; }
  bar.classList.add('show');
  bar.innerHTML = `<span class="lbl">已选条件：</span>` +
    chips.map((c, i) => `<span class="chip" data-i="${i}">${escapeHtml(c.t)}<span class="x">×</span></span>`).join('') +
    `<button class="chip-clear" id="chip-clear">清除全部</button>`;
  bar.querySelectorAll('.chip').forEach(node => {
    node.onclick = () => { chips[+node.dataset.i].rm(); applyState(); };
  });
  el('chip-clear').onclick = resetFilters;
}

/* ---------------- 渲染：列表 ---------------- */
let animKey = '';   // 结果集未变化时不重播入场动画（避免输入关键词时闪烁）
function renderList(items) {
  const grid = el('grid');
  grid.className = 'grid' + (state.view === 'list' ? ' list' : '');
  grid.innerHTML = '';
  const kw = state.q;
  const ids = items.map(i => i.id).join('|');
  const animate = ids !== animKey;
  animKey = ids;

  items.forEach((it, i) => {
    const color = colorOf(it.category);
    const coverStyle = it.cover
      ? `background-image:url('${encodeURI(it.cover)}');background-size:cover;background-position:center;`
      : `background:linear-gradient(135deg, ${color}, ${color}cc 70%, ${color}99);`;
    const card = document.createElement('article');
    card.className = 'card';
    card.style.animation = animate ? '' : 'none';
    if (animate) card.style.animationDelay = Math.min(i * 26, 360) + 'ms';
    card.innerHTML = `
      <div class="cover" style="${coverStyle}">
        ${it.cover ? '' : `<span>${iconOf(it.category)}</span>`}
        <span class="cat-badge">${escapeHtml(it.category)}</span>
        <button class="fav${favorites.has(it.id) ? ' on' : ''}" title="收藏 / 取消收藏">${favorites.has(it.id) ? '♥' : '♡'}</button>
        ${(it.formatTags && it.formatTags[0]) ? `<span class="idx">${escapeHtml(it.formatTags[0])}</span>` : ''}
      </div>
      <div class="body">
        <h3 class="title">${hl(it.title, kw)}</h3>
        <p class="summary">${hl(it.summary || '', kw)}</p>
        <div class="tags">
          ${tagHtml(it.diseaseTags, 'disease')}
          ${tagHtml(it.formatTags, 'format')}
          ${tagHtml(it.journeyTags, 'journey')}
          ${tagHtml(it.subTopics, 'subtopic')}
        </div>
        <div class="foot">
          <span class="date">${fmtDate(it.createdAt)}</span>
          <span class="more">查看详情 →</span>
        </div>
      </div>`;
    card.querySelector('.fav').onclick = e => {
      e.stopPropagation();
      const on = toggleFav(it.id);
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.textContent = on ? '♥' : '♡';
      updateFavBadge();
      if (state.favOnly) applyState(); else toast(on ? '已加入收藏' : '已取消收藏');
    };
    card.onclick = () => openDetail(it);
    grid.appendChild(card);
  });
}

function tagHtml(arr, cls, dim) {
  return (arr || []).map(t =>
    `<span class="tag ${cls}"${dim ? ` data-dim="${dim}" data-val="${escapeHtml(t)}"` : ` data-dim="${clsToDim(cls)}" data-val="${escapeHtml(t)}"`}>${escapeHtml(t)}</span>`
  ).join('');
}
function clsToDim(cls) {
  return cls === 'subtopic' ? 'subtopic' : cls === 'journey' ? 'journey' : cls === 'format' ? 'format' : 'disease';
}

/* ---------------- 主流程 ---------------- */
function applyState(scroll) {
  syncUrl();
  renderCats();
  buildPills();
  renderActive();
  el('sort').value = state.sort;
  el('fav-toggle').classList.toggle('on', state.favOnly);
  updateFavBadge();
  update();
  if (scroll) scrollToResults();
}

function update() {
  current = filterItems();
  el('total').textContent = current.length;
  el('range').textContent = current.length ? ' · ' + SORT_LABEL[state.sort] : '';
  el('empty').style.display = current.length ? 'none' : 'block';
  const emptyT = document.querySelector('#empty .t');
  const emptyS = document.querySelector('#empty .s');
  if (!current.length) {
    if (state.favOnly && !favorites.size) {
      emptyT.textContent = '你还没有收藏任何内容';
      emptyS.innerHTML = '在卡片右上角点 ♡ 即可收藏，收藏会保存在本机浏览器里。';
    } else if (state.favOnly) {
      emptyT.textContent = '收藏的内容不符合当前筛选';
      emptyS.innerHTML = '试试<a href="#" id="empty-reset" style="color:var(--green-dark);text-decoration:underline;">重置全部筛选</a>。';
    } else {
      emptyT.textContent = '没有符合条件的内容';
      emptyS.innerHTML = '试试放宽筛选条件，或者<a href="#" id="empty-reset" style="color:var(--green-dark);text-decoration:underline;">重置全部筛选</a>。';
    }
    const r = el('empty-reset');
    if (r) r.onclick = e => { e.preventDefault(); resetFilters(); };
  }
  renderList(current);
}

function resetFilters() {
  SET_DIMS.forEach(dim => state[dim].clear());
  state.category = ''; state.q = ''; state.sort = 'new'; state.favOnly = false;
  el('search').value = ''; el('category').value = ''; el('sort').value = 'new';
  applyState();
}

function updateFavBadge() {
  el('fav-count').textContent = favorites.size;
}

/* ---------------- 详情弹窗 ---------------- */
function openDetail(it) {
  modalItem = it;
  const color = colorOf(it.category);
  const cover = el('m-cover');
  cover.style.background = it.cover
    ? `#223329 url('${encodeURI(it.cover)}') center/cover`
    : `linear-gradient(135deg, ${color}, ${color}bb 75%, ${color}88)`;
  cover.innerHTML = `${it.cover ? '' : `<span>${iconOf(it.category)}</span>`}<span class="m-cat">${escapeHtml(it.category)}</span>`;

  el('m-title').textContent = it.title || '(无标题)';
  const cAt = fmtDate(it.createdAt), uAt = fmtDate(it.updatedAt);
  el('m-time').textContent = `${cAt}${uAt && uAt !== cAt ? ' · 更新于 ' + uAt : ''}`;

  const meta = el('m-meta');
  const tags = []
    .concat([{ t: it.category, cls: 'format', dim: 'category' }])
    .concat((it.diseaseTags || []).map(t => ({ t, cls: 'disease', dim: 'disease' })))
    .concat((it.formatTags || []).map(t => ({ t, cls: 'format', dim: 'format' })))
    .concat((it.journeyTags || []).map(t => ({ t, cls: 'journey', dim: 'journey' })))
    .concat((it.subTopics || []).map(t => ({ t, cls: 'subtopic', dim: 'subtopic' })));
  meta.innerHTML = tags.map(x => `<span class="tag ${x.cls}" data-dim="${x.dim}" data-val="${escapeHtml(x.t)}" title="按此标签筛选">${escapeHtml(x.t)}</span>`).join('');
  meta.querySelectorAll('.tag').forEach(node => {
    node.onclick = () => {
      const dim = node.dataset.dim, val = node.dataset.val;
      if (dim === 'category') { state.category = val; el('category').value = val; }
      else toggleIn(state[dim], val, true);
      closeModal();
      applyState(true);
      toast('已按「' + val + '」筛选');
    };
  });

  const body = it.body || it.summary || '（暂无正文）';
  el('m-text').innerHTML = String(body).split(/\n+/).filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`).join('');

  el('m-video').innerHTML = it.videoUrl
    ? `<a href="${escapeHtml(it.videoUrl)}" target="_blank" rel="noopener">📎 ${escapeHtml(it.videoUrl)}</a>`
    : '';

  // 相关推荐：同分类 +2 分，重合标签每个 +1 分
  const scored = ALL_ITEMS.filter(x => x.id !== it.id).map(x => {
    let s = x.category === it.category ? 2 : 0;
    ['diseaseTags', 'formatTags', 'journeyTags', 'subTopics'].forEach(k => {
      s += (x[k] || []).filter(t => (it[k] || []).includes(t)).length;
    });
    return { x, s };
  }).filter(o => o.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);

  const relBox = el('m-related');
  if (scored.length) {
    relBox.style.display = 'block';
    el('m-related-list').innerHTML = scored.map(o =>
      `<div class="related-item" data-id="${escapeHtml(o.x.id)}">
        <span class="dot" style="background:${colorOf(o.x.category)}"></span>
        <span class="rt">${escapeHtml(o.x.title)}</span>
        <span class="rc">${escapeHtml(o.x.category)}</span>
      </div>`).join('');
    el('m-related-list').querySelectorAll('.related-item').forEach(node => {
      node.onclick = () => {
        const nxt = ALL_ITEMS.find(x => x.id === node.dataset.id);
        if (nxt) { el('modal').querySelector('.modal').scrollTop = 0; openDetail(nxt); }
      };
    });
  } else {
    relBox.style.display = 'none';
  }

  const fb = el('modal-fav');
  fb.classList.toggle('on', favorites.has(it.id));
  fb.textContent = favorites.has(it.id) ? '♥' : '♡';

  el('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  el('modal').querySelector('.modal').scrollTop = 0;
}
function closeModal() {
  el('modal').classList.remove('open');
  document.body.style.overflow = '';
  modalItem = null;
}

/* ---------------- 分享 / 复制 ---------------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* 降级 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
async function shareCurrent() {
  const url = currentShareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: '健康内容中台 · 内容广场', url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const ok = await copyText(url);
  toast(ok ? '已复制当前筛选链接，粘贴即可分享' : '复制失败，请手动复制地址栏链接');
}

/* ---------------- 滚动辅助 ---------------- */
function scrollToResults() {
  const top = el('toolbar').getBoundingClientRect().top + window.scrollY - 12;
  window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
}

/* ---------------- 事件绑定 ---------------- */
function bindEvents() {
  el('search').addEventListener('input', e => { state.q = e.target.value.trim(); syncUrl(); renderActive(); update(); });
  el('category').addEventListener('change', e => {
    state.category = e.target.value; state.subtopic.clear(); applyState();
  });
  el('sort').addEventListener('change', e => { state.sort = e.target.value; applyState(); });
  el('reset').addEventListener('click', resetFilters);
  el('fav-toggle').addEventListener('click', () => {
    state.favOnly = !state.favOnly;
    if (state.favOnly && !favorites.size) toast('还没有收藏内容，先点卡片右上角的 ♡');
    applyState();
  });
  el('share-btn').addEventListener('click', shareCurrent);
  el('empty-reset') && (el('empty-reset').onclick = e => { e.preventDefault(); resetFilters(); });
  el('to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  el('modal-close').addEventListener('click', closeModal);
  el('modal').addEventListener('click', e => { if (e.target === el('modal')) closeModal(); });
  el('modal-fav').addEventListener('click', e => {
    if (!modalItem) return;
    const on = toggleFav(modalItem.id);
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.textContent = on ? '♥' : '♡';
    updateFavBadge();
    if (state.favOnly) applyState(); else update();
    toast(on ? '已加入收藏' : '已取消收藏');
  });

  document.querySelectorAll('.seg button').forEach(b => {
    b.onclick = () => {
      state.view = b.dataset.view;
      document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
      syncUrl();
      renderList(current);
    };
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (el('modal').classList.contains('open')) closeModal();
      else if (document.activeElement === el('search')) { el('search').value = ''; state.q = ''; syncUrl(); renderActive(); update(); el('search').blur(); }
    }
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); el('search').focus();
    }
  });

  window.addEventListener('scroll', () => {
    const t = el('toolbar');
    t.classList.toggle('stuck', t.getBoundingClientRect().top <= 12);
    el('to-top').classList.toggle('show', window.scrollY > 500);
  }, { passive: true });
}

/* ---------------- 启动 ---------------- */
async function init() {
  try { await loadSource(); }
  catch (e) { toast('数据加载失败，请检查服务后刷新重试'); return; }
  readUrl();
  el('category').innerHTML = '<option value="">全部分类</option>';
  (CONFIG.CATEGORIES || []).forEach(c => {
    const o = document.createElement('option'); o.value = c; o.textContent = c; el('category').appendChild(o);
  });
  el('search').value = state.q;
  el('category').value = state.category;
  el('sort').value = state.sort;
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  renderStats();
  bindEvents();
  applyState();
  el('to-top').classList.toggle('show', window.scrollY > 500);
}

init();
