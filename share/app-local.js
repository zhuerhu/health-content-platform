/* ===========================================================================
 * 健康内容中台 · 本地单文件版
 * 无需服务器：内容与上传的视频都存在本机浏览器（IndexedDB）里，
 * 关闭页面 / 重开浏览器后仍在；点「编辑模式」即可上传视频、封面与文案。
 * 收藏（♡）同样存在本机。
 *
 * 筛选语义：跨维度 AND；同维度内 OR。
 * =========================================================================== */

/* ---------------- 配置（内嵌，无需服务器） ---------------- */
const CONFIG = {
  CATEGORIES: ['膳食营养库', '慢病管理库', '生活实操库', '辟谣真相库', '专家答疑库', '健康陪伴库'],
  DISEASE_TAGS: ['高血压', '糖尿病', '高血脂', '骨质疏松', '慢阻肺', '普通健康', '食材红黑榜', '三餐搭配', '替代品认知', '食疗调理', '一周食谱', '慢病常识', '生活方式', '监测记录', '并发症预防', '用药尝试', '买菜指南', '下厨实操', '运动处方', '自测工具', '食疗误区', '保健品陷阱', '偏方核查', '代糖代盐真相', '一问一答', '直播回放', '误区纠正', '节气养生', '会员故事', '健康周报'],
  FORMAT_TAGS: ['图文', '短视频', '长视频', '音频答疑', '直播回放', '打卡任务', '自测工具'],
  JOURNEY_TAGS: ['认知层', '行动层', '深化层'],
  CATEGORY_COLOR: {
    '膳食营养库': '#2e9e5b', '慢病管理库': '#e8633a', '生活实操库': '#2f8fd6',
    '辟谣真相库': '#c0392b', '专家答疑库': '#8e44ad', '健康陪伴库': '#d4a017'
  }
};
let ALL_ITEMS = [];

/* ---------------- 本地存储（IndexedDB：内容 + 视频 Blob，均存本机） ---------------- */
const DB_NAME = 'hcp_local_db', STORE = 'contents';
let db = null;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}
function dbAll() {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
function dbPut(obj) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(obj);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
function dbDel(id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
function dbClear() {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/* 视频 Blob → 可播放的本地地址（缓存，避免重复创建与内存泄漏） */
const videoUrls = new Map();
function videoUrlOf(it) {
  if (it.video instanceof Blob) {
    if (!videoUrls.has(it.id)) videoUrls.set(it.id, URL.createObjectURL(it.video));
    return videoUrls.get(it.id);
  }
  return it.videoUrl || '';
}
function dropVideoUrl(id) {
  if (videoUrls.has(id)) { try { URL.revokeObjectURL(videoUrls.get(id)); } catch (e) {} videoUrls.delete(id); }
}

/** 从本机库重新读取全部内容并刷新视图 */
async function reload() {
  ALL_ITEMS = await dbAll();
  animKey = '';
  applyState();
  renderEditbar();
}

/* ---------------- 常量 ---------------- */
const ICONS = {
  '膳食营养库': '🥗', '慢病管理库': '❤️', '生活实操库': '🍳',
  '辟谣真相库': '🔍', '专家答疑库': '💬', '健康陪伴库': '🤝'
};
const FAV_KEY = 'hcp_favorites_v1';
const DATA_KEY = 'hcp_contents_v1';   // 编辑后的内容存这里（覆盖 data.js 的初始数据）
const DATA_LIMIT = 4.2 * 1024 * 1024;  // localStorage 约 5MB，留点余量
const SORT_LABEL = { new: '最新优先', old: '最早优先', title: '按标题排序' };
const DIM_LABEL = { disease: '内容标签', format: '内容形态', journey: '内容深度' };

/* URL 参数名（保持简短，链接更好看） */
const P = { category: 'cat', disease: 'dis', format: 'fmt', journey: 'jrn', q: 'q', sort: 'sort', fav: 'fav', view: 'view' };
const SET_DIMS = ['disease', 'format', 'journey'];

/* ---------------- 状态 ---------------- */
const state = {
  disease: new Set(), format: new Set(), journey: new Set(),
  category: '', q: '', sort: 'new', favOnly: false, view: 'grid', editing: false
};
let favorites = new Set(readFavs());
let current = [];        // 当前筛出的列表
let modalItem = null;    // 弹窗中的内容
let editingId = null;    // 正在编辑的内容 id；null 表示新建
let draftCover = null;   // 编辑中的封面（DataURL 或图片地址）
let videoFileObj = null; // 编辑中待上传的视频文件
let draftSel = null;     // 编辑中的三维标签选择 { disease:Set, format:Set, journey:Set }

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
function subtypeSet(dim) {
  return dim === 'disease' ? (CONFIG.DISEASE_TAGS || [])
    : dim === 'format' ? (CONFIG.FORMAT_TAGS || [])
      : (CONFIG.JOURNEY_TAGS || []);
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
  if (state.q) {
    const kw = state.q.toLowerCase();
    items = items.filter(it => [it.title, it.summary, it.body, it.category]
      .concat(it.diseaseTags || [], it.formatTags || [], it.journeyTags || [])
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
  const tagCount = (CONFIG.DISEASE_TAGS || []).length + (CONFIG.FORMAT_TAGS || []).length + (CONFIG.JOURNEY_TAGS || []).length;
  const data = [
    { n: ALL_ITEMS.length, k: '条内容' },
    { n: (CONFIG.CATEGORIES || []).length, k: '大内容库' },
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
    const d = document.createElement('div');
    d.className = 'cat-card' + (state.category === cat ? ' active' : '');
    d.style.setProperty('--c', colorOf(cat));
    d.title = state.category === cat ? '再次点击取消该分类' : `只看「${cat}」`;
    d.innerHTML = `
      <div class="row">
        <div class="ic">${iconOf(cat)}</div>
        <div style="min-width:0">
          <div class="nm">${escapeHtml(cat)}</div>
          <div class="ct">${n} 条</div>
        </div>
      </div>
      <div class="bar"><i style="width:${Math.round(n / max * 100)}%"></i></div>`;
    d.onclick = () => {
      if (state.category === cat) state.category = '';
      else { state.category = cat; }
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
        </div>
        ${state.editing ? `<div class="foot ops">
          <button class="mini" data-act="edit" title="编辑这条">✎ 编辑</button>
          <button class="mini" data-act="dup" title="复制为新的一条">⧉ 复制</button>
          <button class="mini danger" data-act="del" title="删除这条">✕ 删除</button>
        </div>` : `<div class="foot">
          <span class="date">${fmtDate(it.createdAt)}</span>
          <span class="more">查看详情 →</span>
        </div>`}
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
    if (state.editing) {
      card.classList.add('card-editing');
      card.querySelectorAll('.foot.ops .mini').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          if (btn.dataset.act === 'edit') openEditor(it);
          else if (btn.dataset.act === 'dup') duplicateItem(it);
          else deleteItem(it);
        };
      });
    }
    grid.appendChild(card);
  });
}

function tagHtml(arr, cls, dim) {
  return (arr || []).map(t =>
    `<span class="tag ${cls}"${dim ? ` data-dim="${dim}" data-val="${escapeHtml(t)}"` : ` data-dim="${clsToDim(cls)}" data-val="${escapeHtml(t)}"`}>${escapeHtml(t)}</span>`
  ).join('');
}
function clsToDim(cls) {
  return cls === 'journey' ? 'journey' : cls === 'format' ? 'format' : 'disease';
}

/* ---------------- 主流程 ---------------- */
function applyState(scroll) {
  syncUrl();
  renderStats();
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
    if (state.editing && !ALL_ITEMS.length) {
      emptyT.textContent = '还没有任何内容';
      emptyS.innerHTML = '点上方工具条里的「＋ 新建内容」开始录入。';
    } else if (state.favOnly && !favorites.size) {
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
    .concat((it.journeyTags || []).map(t => ({ t, cls: 'journey', dim: 'journey' })));
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

  const v = videoUrlOf(it);
  if (v) {
    const isMedia = v.startsWith('blob:') || v.startsWith('/uploads/') || /(\.mp4|\.webm|\.ogg|\.mov)$/i.test(v);
    el('m-video').innerHTML = isMedia
      ? `<video controls preload="metadata" src="${escapeHtml(v)}" style="width:100%;border-radius:12px;background:#000;max-height:60vh"></video>`
      : `<a href="${escapeHtml(v)}" target="_blank" rel="noopener">📎 打开视频 / 链接</a>`;
  } else {
    el('m-video').innerHTML = '';
  }

  // 相关推荐：同分类 +2 分，重合标签每个 +1 分
  const scored = ALL_ITEMS.filter(x => x.id !== it.id).map(x => {
    let s = x.category === it.category ? 2 : 0;
    ['diseaseTags', 'formatTags', 'journeyTags'].forEach(k => {
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
  el('modal-edit').style.display = state.editing ? '' : 'none';

  el('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  el('modal').querySelector('.modal').scrollTop = 0;
}
function closeModal() {
  el('modal').classList.remove('open');
  document.body.style.overflow = '';
  modalItem = null;
}

/* ===========================================================================
 * 编辑模式
 * 增删改内容 → 写入本机浏览器存储（IndexedDB），刷新/重开后仍在。
 * 导出 / 导入用于备份与迁移（备份仅含文字与封面，不含视频文件）。
 * =========================================================================== */

/* ---------------- 工具 ---------------- */
function newId() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------------- 编辑模式开关 ---------------- */
function setEditing(on) {
  state.editing = on;
  document.body.classList.toggle('editing', on);
  el('edit-toggle').classList.toggle('on', on);
  el('edit-toggle').innerHTML = on ? '✓ 退出编辑' : '✏️ 编辑模式';
  renderEditbar();
  update();
}
function renderEditbar() {
  const n = ALL_ITEMS.length;
  el('ed-state').innerHTML = `内容保存在<b>本机浏览器</b> · 共 ${n} 条 <span class="badge-local">离线可用</span>`;
}

/* ---------------- 编辑器：打开 / 关闭 ---------------- */
function openEditor(it) {
  const blank = {
    id: '', title: '', category: (CONFIG.CATEGORIES || [])[0] || '',
    diseaseTags: [], formatTags: [], journeyTags: [],
    summary: '', body: '', cover: '', videoUrl: '', createdAt: new Date().toISOString()
  };
  const d = it || blank;
  editingId = it ? it.id : null;
  draftSel = {
    disease: new Set(d.diseaseTags || []),
    format: new Set(d.formatTags || []),
    journey: new Set(d.journeyTags || [])
  };
  draftCover = d.cover || '';
  videoFileObj = null;

  el('ed-head-title').textContent = it ? '编辑内容' : '新建内容';
  const sel = el('ed-category');
  sel.innerHTML = (CONFIG.CATEGORIES || [])
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel.value = d.category || (CONFIG.CATEGORIES || [])[0] || '';
  el('ed-title').value = d.title || '';
  el('ed-date').value = toDateInput(d.createdAt);
  el('ed-summary').value = d.summary || '';
  el('ed-body').value = d.body || '';
  el('ed-video').value = d.videoUrl || '';
  el('ed-cover-url').value = /^https?:/i.test(d.cover || '') ? d.cover : '';
  el('ed-delete').style.display = it ? '' : 'none';
  el('ed-error').textContent = '';

  buildCheckGrid('ed-disease', CONFIG.DISEASE_TAGS, 'disease');
  buildCheckGrid('ed-format', CONFIG.FORMAT_TAGS, 'format');
  buildCheckGrid('ed-journey', CONFIG.JOURNEY_TAGS, 'journey');
  renderCoverPreview();
  renderVideoPreview();

  el('editor').classList.add('open');
  document.body.style.overflow = 'hidden';
  el('editor').querySelector('.modal').scrollTop = 0;
  setTimeout(() => { try { el('ed-title').focus(); } catch (e) {} }, 80);
}
function closeEditor() {
  el('editor').classList.remove('open');
  if (!el('modal').classList.contains('open')) document.body.style.overflow = '';
  editingId = null; draftSel = null; draftCover = null;
}

/* ---------------- 编辑器：表单控件 ---------------- */
function buildCheckGrid(containerId, options, dim) {
  const c = el(containerId);
  c.innerHTML = '';
  const list = options || [];
  if (!list.length) { c.innerHTML = '<span class="hint">该分类下暂无细分主题</span>'; return; }
  list.forEach(t => {
    const on = draftSel[dim].has(t);
    const lb = document.createElement('label');
    lb.className = 'chk' + (on ? ' on' : '');
    lb.innerHTML = `<input type="checkbox"${on ? ' checked' : ''} /><span>${escapeHtml(t)}</span>`;
    lb.querySelector('input').onchange = e => {
      if (e.target.checked) draftSel[dim].add(t); else draftSel[dim].delete(t);
      lb.classList.toggle('on', e.target.checked);
    };
    c.appendChild(lb);
  });
}
function toDateInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function renderCoverPreview() {
  const p = el('ed-cover-prev');
  const hint = el('ed-cover-hint');
  if (draftCover) {
    p.style.backgroundImage = `url('${draftCover}')`;
    p.textContent = '';
    p.classList.add('has-img');
    hint.textContent = /^data:/i.test(draftCover)
      ? `已压缩存储，约 ${Math.round(draftCover.length * 0.75 / 1024)} KB`
      : '使用图片地址（不占本地空间）';
  } else {
    p.style.backgroundImage = '';
    p.classList.remove('has-img');
    p.textContent = iconOf(el('ed-category').value);
    hint.textContent = '建议宽度 600px 以上；图片会压缩后存在本机浏览器里';
  }
}
function renderVideoPreview() {
  const hint = el('ed-video-hint');
  if (!hint) return;
  if (videoFileObj) {
    el('ed-video-prev').textContent = '🎬';
    const mb = Math.round(videoFileObj.size / 1048576 * 10) / 10;
    hint.textContent = '已选择视频：' + videoFileObj.name + '（' + mb + ' MB）';
  } else if (el('ed-video').value.trim()) {
    el('ed-video-prev').textContent = '🔗';
    hint.textContent = '使用视频链接：' + el('ed-video').value.trim();
  } else {
    el('ed-video-prev').textContent = '🎬';
    hint.textContent = '未选择视频文件';
  }
}

/** 等比压缩图片，避免把 localStorage 撑爆 */
function shrinkImage(src, maxW, quality) {  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / (img.width || maxW));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------------- 编辑：保存 / 删除 / 复制 / 恢复 ---------------- */
async function saveEditor() {
  const title = el('ed-title').value.trim();
  const category = el('ed-category').value;
  const miss = [];
  if (!title) miss.push('标题');
  if (!category) miss.push('分类');
  if (miss.length) { el('ed-error').textContent = '请先填写：' + miss.join('、'); return; }

  const wasNew = !editingId;
  const existing = editingId ? ALL_ITEMS.find(x => x.id === editingId) : null;
  const dateVal = el('ed-date').value;
  const dt = dateVal ? new Date(dateVal + 'T09:00:00') : new Date();

  const item = Object.assign({}, existing || {});
  item.id = editingId || newId();
  item.title = title;
  item.category = category;
  item.diseaseTags = [...draftSel.disease];
  item.formatTags = [...draftSel.format];
  item.journeyTags = [...draftSel.journey];
  item.summary = el('ed-summary').value.trim();
  item.body = el('ed-body').value;
  item.cover = draftCover || null;
  if (isNaN(dt)) { if (!existing) item.createdAt = new Date().toISOString(); } else item.createdAt = dt.toISOString();
  item.updatedAt = new Date().toISOString();

  const url = el('ed-video').value.trim();
  if (videoFileObj) {
    item.video = videoFileObj; item.videoName = videoFileObj.name; item.videoUrl = '';
  } else {
    item.videoUrl = url;
    if (url) { item.video = null; item.videoName = ''; }
  }

  const btn = el('ed-save');
  if (btn) btn.disabled = true;
  try {
    await dbPut(item);
    dropVideoUrl(item.id);
    closeEditor();
    await reload();
    toast(wasNew ? '已保存（视频已存到本机）' : '已保存修改');
  } catch (e) {
    el('ed-error').textContent = '保存失败：' + (e.message || e);
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function deleteItem(it) {
  if (!it) return;
  if (!window.confirm(`确定删除「${it.title}」？\n\n删除后本机将不再保存这条内容（含已上传的视频）。`)) return;
  try {
    await dbDel(it.id);
    dropVideoUrl(it.id);
    if (favorites.delete(it.id)) { saveFavs(); updateFavBadge(); }
    closeEditor();
    await reload();
    toast('已删除');
  } catch (e) { toast('删除失败：' + (e.message || e)); }
}
async function duplicateItem(it) {
  const copy = Object.assign({}, it, {
    id: newId(),
    title: (it.title || '') + '（副本）',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  try {
    await dbPut(copy);
    closeEditor();
    await reload();
    toast('已复制一份');
  } catch (e) { toast('复制失败：' + (e.message || e)); }
}
async function clearAll() {
  if (!ALL_ITEMS.length) { toast('当前没有内容'); return; }
  if (!window.confirm('确定清空本机保存的全部内容？此操作不可恢复（含已上传的视频）。')) return;
  try {
    await dbClear();
    videoUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    videoUrls.clear();
    favorites = new Set(); saveFavs(); updateFavBadge();
    await reload();
    toast('已清空全部内容');
  } catch (e) { toast('清空失败：' + (e.message || e)); }
}

/* ---------------- 导入 / 导出（备份仅含元数据 + 封面，不含视频文件） ---------------- */
function exportData() {
  const contents = ALL_ITEMS.map(it => { const { video, ...rest } = it; return rest; });
  const payload = { app: '健康内容中台（本地版）', version: 1, exportedAt: new Date().toISOString(), note: '视频文件体积较大，未包含在备份中', contents };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `健康内容中台-备份-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('已导出 JSON 备份（不含视频文件）');
}
function pickImport() {
  const f = el('import-file');
  f.value = '';
  f.click();
}
function normalizeItem(raw) {
  const s = raw || {};
  const arr = v => Array.isArray(v) ? v.map(String).filter(Boolean) : (v == null || v === '' ? [] : [String(v)]);
  return {
    id: s.id || newId(),
    title: String(s.title || '').trim(),
    category: String(s.category || '').trim() || (CONFIG.CATEGORIES || [])[0] || '',
    diseaseTags: arr(s.diseaseTags),
    formatTags: arr(s.formatTags),
    journeyTags: arr(s.journeyTags),
    summary: String(s.summary || ''),
    body: String(s.body || ''),
    cover: (typeof s.cover === 'string' && s.cover) ? s.cover : null,
    videoUrl: String(s.videoUrl || ''),
    createdAt: s.createdAt || new Date().toISOString(),
    updatedAt: s.updatedAt || new Date().toISOString()
  };
}
function onImportFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try { data = JSON.parse(String(reader.result)); }
    catch (err) { toast('解析失败：这不是合法的 JSON 文件'); return; }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.contents) ? data.contents : null);
    if (!list) { toast('文件里没找到 contents 数组'); return; }
    const cleaned = list.map(normalizeItem).filter(x => x.title);
    if (!cleaned.length) { toast('没有可导入的有效内容（标题为空）'); return; }
    if (!window.confirm(`导入会用文件里的 ${cleaned.length} 条替换本机现有内容（备份不含视频文件），确定？`)) return;
    try {
      await dbClear();
      videoUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
      videoUrls.clear();
      for (const c of cleaned) await dbPut(c);
      await reload();
      toast(`已导入 ${cleaned.length} 条`);
    } catch (e) { toast('导入失败：' + (e.message || e)); }
  };
  reader.readAsText(f, 'utf-8');
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
    state.category = e.target.value; applyState();
  });
  el('sort').addEventListener('change', e => { state.sort = e.target.value; applyState(); });
  el('reset').addEventListener('click', resetFilters);
  el('fav-toggle').addEventListener('click', () => {
    state.favOnly = !state.favOnly;
    if (state.favOnly && !favorites.size) toast('还没有收藏内容，先点卡片右上角的 ♡');
    applyState();
  });
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
  el('modal-edit').addEventListener('click', () => {
    const it = modalItem;
    closeModal();
    if (it) openEditor(it);
  });

  /* ---------- 编辑模式 ---------- */
  el('edit-toggle').addEventListener('click', () => setEditing(!state.editing));
  el('btn-new').addEventListener('click', () => openEditor(null));
  el('btn-export').addEventListener('click', exportData);
  el('btn-import').addEventListener('click', pickImport);
  el('btn-clear').addEventListener('click', clearAll);
  el('import-file').addEventListener('change', onImportFile);

  el('ed-close').addEventListener('click', closeEditor);
  el('ed-cancel').addEventListener('click', closeEditor);
  el('ed-save').addEventListener('click', saveEditor);
  el('ed-delete').addEventListener('click', () => {
    const it = ALL_ITEMS.find(x => x.id === editingId);
    if (it) deleteItem(it);
  });
  el('editor').addEventListener('click', e => { if (e.target === el('editor')) closeEditor(); });
  el('ed-category').addEventListener('change', e => {
    renderCoverPreview();
  });
  el('ed-cover-pick').addEventListener('click', () => {
    const f = el('ed-cover-file');
    f.value = '';
    f.click();
  });
  el('ed-cover-clear').addEventListener('click', () => {
    draftCover = null;
    el('ed-cover-url').value = '';
    renderCoverPreview();
  });
  el('ed-cover-url').addEventListener('input', e => {
    const v = e.target.value.trim();
    draftCover = v || null;
    renderCoverPreview();
  });
  el('ed-cover-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { el('ed-error').textContent = '请选择图片文件（jpg / png / webp）'; return; }
    const reader = new FileReader();
    reader.onload = () => {
      shrinkImage(String(reader.result), 900, 0.82)
        .then(dataUrl => { draftCover = dataUrl; el('ed-error').textContent = ''; renderCoverPreview(); })
        .catch(() => { el('ed-error').textContent = '图片处理失败，请换一张试试'; });
    };
    reader.readAsDataURL(f);
  });
  el('ed-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEditor(); } });

  document.querySelectorAll('.seg button').forEach(b => {
    b.onclick = () => {
      state.view = b.dataset.view;
      document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
      syncUrl();
      renderList(current);
    };
  });

  document.addEventListener('keydown', e => {
    const inEditor = el('editor').classList.contains('open');
    if (inEditor && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveEditor();
      return;
    }
    if (e.key === 'Escape') {
      if (inEditor) closeEditor();
      else if (el('modal').classList.contains('open')) closeModal();
      else if (document.activeElement === el('search')) {
        el('search').value = ''; state.q = ''; syncUrl(); renderActive(); update(); el('search').blur();
      }
    }
    if (e.key === '/' && !inEditor && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); el('search').focus();
    }
  });

  /* ---------- 视频上传 ---------- */
  el('ed-video-pick').addEventListener('click', () => { el('ed-video-file').value = ''; el('ed-video-file').click(); });
  el('ed-video-clear').addEventListener('click', () => { videoFileObj = null; el('ed-video').value = ''; renderVideoPreview(); });
  el('ed-video-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^video\//.test(f.type)) { el('ed-error').textContent = '请选择视频文件（mp4 / webm 等）'; return; }
    videoFileObj = f; el('ed-video').value = ''; el('ed-error').textContent = ''; renderVideoPreview();
  });
  el('ed-video').addEventListener('input', e => { if (e.target.value.trim()) videoFileObj = null; renderVideoPreview(); });

  /* ---------- 登录 / 退出（在启动即绑定，见 bindAuthUI） ---------- */

  window.addEventListener('scroll', () => {
    const t = el('toolbar');
    t.classList.toggle('stuck', t.getBoundingClientRect().top <= 12);
    el('to-top').classList.toggle('show', window.scrollY > 500);
  }, { passive: true });
}

/* ---------------- 启动 ---------------- */
async function init() {
  try { await openDB(); }
  catch (e) { toast('本机存储不可用：请用 Chrome / Edge 打开本页面'); }
  try { ALL_ITEMS = await dbAll(); }
  catch (e) { ALL_ITEMS = []; }
  readUrl();
  el('category').innerHTML = '<option value="">全部分类</option>';
  (CONFIG.CATEGORIES || []).forEach(c => {
    const o = document.createElement('option'); o.value = c; o.textContent = c; el('category').appendChild(o);
  });
  el('search').value = state.q;
  el('category').value = state.category;
  el('sort').value = state.sort;
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  renderEditbar();
  bindEvents();
  applyState();
  el('to-top').classList.toggle('show', window.scrollY > 500);
}

init();
