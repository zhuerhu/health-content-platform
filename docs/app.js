/* ===========================================================================
 * 健康内容中台 · 在线版（GitHub Pages 托管 + GitHub 仓库存储）
 * - 任何人打开本页即可浏览（内容从 data/content.json 读取）。
 * - 管理员粘贴 GitHub 令牌后，可在页面里上传视频/封面/文案；
 *   保存时会用 GitHub API 把文件提交进本仓库，约 1 分钟后所有人可见。
 * =========================================================================== */

/* ---------------- 配置 ---------------- */
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

/* GitHub 仓库信息 */
const OWNER = 'zhuerhu';
const REPO = 'health-content-platform';
const BRANCH = 'main';
const DATA_PATH = 'docs/data/content.json';
const MEDIA_DIR = 'docs/media';
const API = 'https://api.github.com';

const TOKEN_KEY = 'hcp_gh_token_v1';
let TOKEN = localStorage.getItem(TOKEN_KEY) || '';
let ME = null;              // { login }
let ALL_ITEMS = [];
let current = [];

/* ---------------- 小工具 ---------------- */
const el = id => document.getElementById(id);
const ICONS = { '膳食营养库': '🥗', '慢病管理库': '❤️', '生活实操库': '🍳', '辟谣真相库': '🔍', '专家答疑库': '💬', '健康陪伴库': '🤝' };
const FAV_KEY = 'hcp_online_fav_v1';
const SORT_LABEL = { new: '最新优先', old: '最早优先', title: '按标题排序' };
const DIM_LABEL = { disease: '内容标签', format: '内容形态', journey: '内容深度' };
const P = { category: 'cat', disease: 'dis', format: 'fmt', journey: 'jrn', q: 'q', sort: 'sort', fav: 'fav', view: 'view' };
const SET_DIMS = ['disease', 'format', 'journey'];

const state = {
  disease: new Set(), format: new Set(), journey: new Set(),
  category: '', q: '', sort: 'new', favOnly: false, view: 'grid', editing: false
};
let favorites = new Set(readFavs());
let modalItem = null, editingId = null, draftCover = null, coverFileObj = null, videoFileObj = null, draftSel = null;

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
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toDateInput(iso) {
  const d = iso ? new Date(iso) : new Date(); if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toggleIn(set, v, force) { if (force === true || !set.has(v)) set.add(v); else set.delete(v); }
function newId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function toast(msg) {
  const t = el('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- 收藏 ---------------- */
function readFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } }
function saveFavs() { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); } catch (e) {} }
function toggleFav(id) { if (favorites.has(id)) favorites.delete(id); else favorites.add(id); saveFavs(); return favorites.has(id); }

/* ---------------- GitHub API ---------------- */
function authHeaders() { return TOKEN ? { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github+json' } : { 'Accept': 'application/vnd.github+json' }; }
async function gh(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return res;
}
async function ghJson(method, path, body) {
  const r = await gh(method, path, body);
  let d = null; try { d = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((d && d.message) || (method + ' ' + path + ' ' + r.status));
  return d;
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
/** 上传/更新仓库里的一个文件 */
async function putRepoFile(path, base64, message) {
  let sha = null;
  const g = await gh('GET', `/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`);
  if (g.status === 200) { try { sha = (await g.json()).sha; } catch (e) {} }
  const body = { message, content: base64, branch: BRANCH };
  if (sha) body.sha = sha;
  await ghJson('PUT', `/repos/${OWNER}/${REPO}/contents/${path}`, body);
}
async function loadContent() {
  try {
    const r = await fetch('data/content.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : (Array.isArray(d.contents) ? d.contents : []);
  } catch (e) { return []; }
}
/** 从线上重新拉取并刷新视图 */
async function reload() {
  ALL_ITEMS = await loadContent();
  ALL_ITEMS.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  animKey = '';
  applyState();
  renderEditbar();
  return ALL_ITEMS.length;
}

/* ---------------- URL ⇄ 状态 ---------------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  SET_DIMS.forEach(dim => { const v = p.get(P[dim]); if (v) v.split(',').filter(Boolean).forEach(t => state[dim].add(t)); });
  state.category = p.get(P.category) || '';
  state.q = p.get(P.q) || '';
  state.sort = p.get(P.sort) || 'new';
  state.favOnly = p.get(P.fav) === '1';
  state.view = p.get(P.view) === 'list' ? 'list' : 'grid';
  if (!(CONFIG.CATEGORIES || []).includes(state.category)) state.category = '';
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
  try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) {}
}

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
      .concat(it.diseaseTags || [], it.formatTags || [], it.journeyTags || []).join(' ').toLowerCase().includes(kw));
  }
  const byDate = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  if (state.sort === 'old') items.sort(byDate);
  else if (state.sort === 'title') items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN'));
  else items.sort((a, b) => byDate(b, a));
  return items;
}

/* ---------------- 渲染 ---------------- */
function renderStats() {
  const tagCount = (CONFIG.DISEASE_TAGS || []).length + (CONFIG.FORMAT_TAGS || []).length + (CONFIG.JOURNEY_TAGS || []).length;
  const data = [{ n: ALL_ITEMS.length, k: '条内容' }, { n: (CONFIG.CATEGORIES || []).length, k: '大内容库' }, { n: tagCount, k: '个标签' }];
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
    d.innerHTML = `<div class="row"><div class="ic">${iconOf(cat)}</div><div style="min-width:0"><div class="nm">${escapeHtml(cat)}</div><div class="ct">${n} 条</div></div></div><div class="bar"><i style="width:${Math.round(n / max * 100)}%"></i></div>`;
    d.onclick = () => { state.category = state.category === cat ? '' : cat; el('category').value = state.category; applyState(true); };
    box.appendChild(d);
  });
}
function makePill(text, active, onclick) {
  const s = document.createElement('span');
  s.className = 'pill' + (active ? ' active' : ''); s.textContent = text; s.onclick = onclick; return s;
}
function buildPills() {
  const fill = (id, tags, dim) => {
    const c = el(id); c.innerHTML = '';
    (tags || []).forEach(t => c.appendChild(makePill(t, state[dim].has(t), () => { toggleIn(state[dim], t); applyState(); })));
  };
  fill('disease-pills', CONFIG.DISEASE_TAGS, 'disease');
  fill('format-pills', CONFIG.FORMAT_TAGS, 'format');
  fill('journey-pills', CONFIG.JOURNEY_TAGS, 'journey');
}
function renderActive() {
  const bar = el('active-bar'); const chips = [];
  if (state.favOnly) chips.push({ t: '只看收藏', rm: () => { state.favOnly = false; } });
  if (state.category) chips.push({ t: '分类：' + state.category, rm: () => { state.category = ''; el('category').value = ''; } });
  SET_DIMS.forEach(dim => [...state[dim]].forEach(t => chips.push({ t: DIM_LABEL[dim] + '：' + t, rm: () => state[dim].delete(t) })));
  if (state.q) chips.push({ t: '关键词：' + state.q, rm: () => { state.q = ''; el('search').value = ''; } });
  if (!chips.length) { bar.classList.remove('show'); bar.innerHTML = ''; return; }
  bar.classList.add('show');
  bar.innerHTML = `<span class="lbl">已选条件：</span>` + chips.map((c, i) => `<span class="chip" data-i="${i}">${escapeHtml(c.t)}<span class="x">×</span></span>`).join('') + `<button class="chip-clear" id="chip-clear">清除全部</button>`;
  bar.querySelectorAll('.chip').forEach(node => { node.onclick = () => { chips[+node.dataset.i].rm(); applyState(); }; });
  el('chip-clear').onclick = resetFilters;
}
let animKey = '';
function renderList(items) {
  const grid = el('grid');
  grid.className = 'grid' + (state.view === 'list' ? ' list' : '');
  grid.innerHTML = '';
  const kw = state.q;
  const ids = items.map(i => i.id).join('|');
  const animate = ids !== animKey; animKey = ids;
  items.forEach((it, i) => {
    const color = colorOf(it.category);
    const coverStyle = it.cover ? `background-image:url('${encodeURI(it.cover)}');background-size:cover;background-position:center;`
      : `background:linear-gradient(135deg, ${color}, ${color}cc 70%, ${color}99);`;
    const card = document.createElement('article');
    card.className = 'card';
    if (animate) card.style.animationDelay = Math.min(i * 26, 360) + 'ms';
    card.innerHTML = `
      <div class="cover" style="${coverStyle}">
        ${it.cover ? '' : `<span>${iconOf(it.category)}</span>`}
        <span class="cat-badge">${escapeHtml(it.category)}</span>
        <button class="fav${favorites.has(it.id) ? ' on' : ''}" title="收藏">${favorites.has(it.id) ? '♥' : '♡'}</button>
        ${(it.formatTags && it.formatTags[0]) ? `<span class="idx">${escapeHtml(it.formatTags[0])}</span>` : ''}
        ${(it.video || it.videoUrl) ? `<span class="idx" style="right:auto;left:11px;bottom:9px">▶ 视频</span>` : ''}
      </div>
      <div class="body">
        <h3 class="title">${hl(it.title, kw)}</h3>
        <p class="summary">${hl(it.summary || '', kw)}</p>
        <div class="tags">${tagHtml(it.diseaseTags)}${tagHtml(it.formatTags)}${tagHtml(it.journeyTags)}</div>
        ${(state.editing && ME) ? `<div class="foot ops">
          <button class="mini" data-act="edit">✎ 编辑</button>
          <button class="mini" data-act="dup">⧉ 复制</button>
          <button class="mini danger" data-act="del">✕ 删除</button>
        </div>` : `<div class="foot"><span class="date">${fmtDate(it.createdAt)}</span><span class="more">查看详情 →</span></div>`}
      </div>`;
    card.querySelector('.fav').onclick = e => {
      e.stopPropagation();
      const on = toggleFav(it.id);
      e.currentTarget.classList.toggle('on', on); e.currentTarget.textContent = on ? '♥' : '♡';
      updateFavBadge(); if (state.favOnly) applyState(); else toast(on ? '已加入收藏' : '已取消收藏');
    };
    card.onclick = () => openDetail(it);
    if (state.editing && ME) {
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
function tagHtml(arr) {
  return (arr || []).map(t => `<span class="tag disease">${escapeHtml(t)}</span>`).join('');
}

/* ---------------- 主流程 ---------------- */
function applyState(scroll) {
  syncUrl(); renderStats(); renderCats(); buildPills(); renderActive();
  el('sort').value = state.sort;
  el('fav-toggle').classList.toggle('on', state.favOnly);
  updateFavBadge(); update();
  if (scroll) scrollToResults();
}
function update() {
  current = filterItems();
  el('total').textContent = current.length;
  el('range').textContent = current.length ? ' · ' + SORT_LABEL[state.sort] : '';
  el('empty').style.display = current.length ? 'none' : 'block';
  const emptyT = document.querySelector('#empty .t');
  if (!current.length && !ALL_ITEMS.length) emptyT.textContent = '还没有内容';
  else emptyT.textContent = '没有符合条件的内容';
  renderList(current);
}
function resetFilters() {
  SET_DIMS.forEach(dim => state[dim].clear());
  state.category = ''; state.q = ''; state.sort = 'new'; state.favOnly = false;
  el('search').value = ''; el('category').value = ''; el('sort').value = 'new';
  applyState();
}
function updateFavBadge() { el('fav-count').textContent = favorites.size; }

/* ---------------- 详情 ---------------- */
function openDetail(it) {
  modalItem = it;
  const color = colorOf(it.category);
  const cover = el('m-cover');
  cover.style.background = it.cover ? `#223329 url('${encodeURI(it.cover)}') center/cover`
    : `linear-gradient(135deg, ${color}, ${color}bb 75%, ${color}88)`;
  cover.innerHTML = `${it.cover ? '' : `<span>${iconOf(it.category)}</span>`}<span class="m-cat">${escapeHtml(it.category)}</span>`;
  el('m-title').textContent = it.title || '(无标题)';
  const cAt = fmtDate(it.createdAt), uAt = fmtDate(it.updatedAt);
  el('m-time').textContent = `${cAt}${uAt && uAt !== cAt ? ' · 更新于 ' + uAt : ''}`;
  const meta = el('m-meta');
  const tags = [].concat([{ t: it.category, dim: 'category' }], (it.diseaseTags || []).map(t => ({ t, dim: 'disease' })), (it.formatTags || []).map(t => ({ t, dim: 'format' })), (it.journeyTags || []).map(t => ({ t, dim: 'journey' })));
  meta.innerHTML = tags.map(x => `<span class="tag format" data-dim="${x.dim}" data-val="${escapeHtml(x.t)}">${escapeHtml(x.t)}</span>`).join('');
  meta.querySelectorAll('.tag').forEach(node => {
    node.onclick = () => {
      const dim = node.dataset.dim, val = node.dataset.val;
      if (dim === 'category') { state.category = val; el('category').value = val; } else toggleIn(state[dim], val, true);
      closeModal(); applyState(true); toast('已按「' + val + '」筛选');
    };
  });
  const body = it.body || it.summary || '（暂无正文）';
  el('m-text').innerHTML = String(body).split(/\n+/).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  const v = it.video || it.videoUrl || '';
  if (v) {
    const isMedia = /\.(mp4|webm|ogg|mov|m4v)$/i.test(v) || v.startsWith('media/') || v.startsWith('blob:') || v.startsWith('/uploads/');
    el('m-video').innerHTML = isMedia
      ? `<video controls preload="metadata" src="${escapeHtml(v)}" style="width:100%;border-radius:12px;background:#000;max-height:60vh"></video>`
      : `<a href="${escapeHtml(v)}" target="_blank" rel="noopener">📎 打开视频 / 链接</a>`;
  } else el('m-video').innerHTML = '';
  const scored = ALL_ITEMS.filter(x => x.id !== it.id).map(x => {
    let s = x.category === it.category ? 2 : 0;
    ['diseaseTags', 'formatTags', 'journeyTags'].forEach(k => { s += (x[k] || []).filter(t => (it[k] || []).includes(t)).length; });
    return { x, s };
  }).filter(o => o.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
  const relBox = el('m-related');
  if (scored.length) {
    relBox.style.display = 'block';
    el('m-related-list').innerHTML = scored.map(o => `<div class="related-item" data-id="${escapeHtml(o.x.id)}"><span class="dot" style="background:${colorOf(o.x.category)}"></span><span class="rt">${escapeHtml(o.x.title)}</span><span class="rc">${escapeHtml(o.x.category)}</span></div>`).join('');
    el('m-related-list').querySelectorAll('.related-item').forEach(node => {
      node.onclick = () => { const nxt = ALL_ITEMS.find(x => x.id === node.dataset.id); if (nxt) { el('modal').querySelector('.modal').scrollTop = 0; openDetail(nxt); } };
    });
  } else relBox.style.display = 'none';
  const fb = el('modal-fav');
  fb.classList.toggle('on', favorites.has(it.id)); fb.textContent = favorites.has(it.id) ? '♥' : '♡';
  el('modal-edit').style.display = (state.editing && ME) ? '' : 'none';
  el('modal').classList.add('open'); document.body.style.overflow = 'hidden';
  el('modal').querySelector('.modal').scrollTop = 0;
}
function closeModal() { el('modal').classList.remove('open'); document.body.style.overflow = ''; modalItem = null; }

/* ---------------- 编辑模式 ---------------- */
function setEditing(on) {
  state.editing = on;
  document.body.classList.toggle('editing', on);
  el('edit-toggle').classList.toggle('on', on);
  el('edit-toggle').innerHTML = on ? '✓ 退出编辑' : '✏️ 编辑模式';
  renderEditbar(); update();
}
function renderEditbar() {
  el('ed-state').innerHTML = `已登录 <b>@${escapeHtml((ME && ME.login) || '')}</b> · 共 ${ALL_ITEMS.length} 条 · 内容存于 <b>GitHub</b>（提交后约 1 分钟全员可见）`;
}

function openEditor(it) {
  const blank = { id: '', title: '', category: (CONFIG.CATEGORIES || [])[0] || '', diseaseTags: [], formatTags: [], journeyTags: [], summary: '', body: '', cover: '', video: '', videoUrl: '', createdAt: new Date().toISOString() };
  const d = it || blank;
  editingId = it ? it.id : null;
  draftSel = { disease: new Set(d.diseaseTags || []), format: new Set(d.formatTags || []), journey: new Set(d.journeyTags || []) };
  draftCover = d.cover || ''; coverFileObj = null; videoFileObj = null;
  el('ed-head-title').textContent = it ? '编辑内容' : '新建内容';
  const sel = el('ed-category');
  sel.innerHTML = (CONFIG.CATEGORIES || []).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
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
  renderCoverPreview(); renderVideoPreview();
  el('editor').classList.add('open'); document.body.style.overflow = 'hidden';
  el('editor').querySelector('.modal').scrollTop = 0;
  setTimeout(() => { try { el('ed-title').focus(); } catch (e) {} }, 80);
}
function closeEditor() {
  el('editor').classList.remove('open');
  if (!el('modal').classList.contains('open')) document.body.style.overflow = '';
  editingId = null; draftSel = null; draftCover = null; coverFileObj = null; videoFileObj = null;
}
function buildCheckGrid(containerId, options, dim) {
  const c = el(containerId); c.innerHTML = '';
  (options || []).forEach(t => {
    const on = draftSel[dim].has(t);
    const lb = document.createElement('label');
    lb.className = 'chk' + (on ? ' on' : '');
    lb.innerHTML = `<input type="checkbox"${on ? ' checked' : ''} /><span>${escapeHtml(t)}</span>`;
    lb.querySelector('input').onchange = e => { if (e.target.checked) draftSel[dim].add(t); else draftSel[dim].delete(t); lb.classList.toggle('on', e.target.checked); };
    c.appendChild(lb);
  });
}
function renderCoverPreview() {
  const p = el('ed-cover-prev'), hint = el('ed-cover-hint');
  if (draftCover) {
    p.style.backgroundImage = `url('${draftCover}')`; p.textContent = ''; p.classList.add('has-img');
    hint.textContent = coverFileObj ? `已选择本地图片：${coverFileObj.name}` : '使用图片地址';
  } else {
    p.style.backgroundImage = ''; p.classList.remove('has-img'); p.textContent = iconOf(el('ed-category').value);
    hint.textContent = '建议宽度 600px 以上';
  }
}
function renderVideoPreview() {
  const hint = el('ed-video-hint'); if (!hint) return;
  if (videoFileObj) { el('ed-video-prev').textContent = '🎬'; hint.textContent = '已选择视频：' + videoFileObj.name + '（' + (Math.round(videoFileObj.size / 1048576 * 10) / 10) + ' MB）'; }
  else if (el('ed-video').value.trim()) { el('ed-video-prev').textContent = '🔗'; hint.textContent = '使用视频链接'; }
  else { el('ed-video-prev').textContent = '🎬'; hint.textContent = '未选择视频文件'; }
}
function shrinkImage(src, maxW, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / (img.width || maxW));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject; img.src = src;
  });
}

/* ---------------- 保存 / 删除 / 复制 ---------------- */
async function saveEditor() {
  const title = el('ed-title').value.trim();
  const category = el('ed-category').value;
  const miss = []; if (!title) miss.push('标题'); if (!category) miss.push('分类');
  if (miss.length) { el('ed-error').textContent = '请先填写：' + miss.join('、'); return; }
  if (videoFileObj && videoFileObj.size > 100 * 1024 * 1024) { el('ed-error').textContent = '视频超过 100MB，GitHub 无法保存，请改用「视频链接」。'; return; }

  const wasNew = !editingId;
  const existing = editingId ? ALL_ITEMS.find(x => x.id === editingId) : null;
  const dateVal = el('ed-date').value;
  const dt = dateVal ? new Date(dateVal + 'T09:00:00') : new Date();
  const item = Object.assign({}, existing || {});
  item.id = editingId || newId();
  item.title = title; item.category = category;
  item.diseaseTags = [...draftSel.disease]; item.formatTags = [...draftSel.format]; item.journeyTags = [...draftSel.journey];
  item.summary = el('ed-summary').value.trim(); item.body = el('ed-body').value;
  if (isNaN(dt)) { if (!existing) item.createdAt = new Date().toISOString(); } else item.createdAt = dt.toISOString();
  item.updatedAt = new Date().toISOString();

  const btn = el('ed-save'); btn.disabled = true;
  el('ed-error').textContent = '';
  try {
    // 1) 封面：本地图片 → 上传仓库；网址 → 直接用
    if (coverFileObj) {
      const base64 = await fileToBase64(coverFileObj);
      const name = genName(coverFileObj.name || 'cover.jpg');
      el('ed-error').textContent = '正在上传封面…';
      await putRepoFile(`${MEDIA_DIR}/${name}`, base64, 'upload cover: ' + (item.title || name));
      item.cover = 'media/' + name;
    } else {
      item.cover = draftCover || null;
    }
    // 2) 视频：本地文件 → 上传仓库；链接 → 直接用
    const url = el('ed-video').value.trim();
    if (videoFileObj) {
      const base64 = await fileToBase64(videoFileObj);
      const name = genName(videoFileObj.name || 'video.mp4');
      el('ed-error').textContent = '正在上传视频…（大文件请耐心等待）';
      await putRepoFile(`${MEDIA_DIR}/${name}`, base64, 'upload video: ' + (item.title || name));
      item.video = 'media/' + name; item.videoName = videoFileObj.name; item.videoUrl = '';
    } else {
      item.video = existing ? (existing.video || '') : ''; item.videoUrl = url;
      if (url) item.video = '';
    }
    // 3) 更新内容清单
    el('ed-error').textContent = '正在写入内容清单…';
    let list = await loadContent();
    if (editingId) { const i = list.findIndex(x => x.id === editingId); if (i >= 0) list[i] = item; else list.unshift(item); }
    else list.unshift(item);
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2))));
    await putRepoFile(DATA_PATH, b64, (wasNew ? 'add: ' : 'update: ') + (item.title || item.id));

    // 4) 本地即时更新
    closeEditor();
    ALL_ITEMS = list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    animKey = ''; applyState(); renderEditbar();
    toast(wasNew ? '已发布！约 1 分钟后所有人可见（本页已即时更新）' : '已保存修改！约 1 分钟后全员可见');
  } catch (e) {
    el('ed-error').textContent = '保存失败：' + (e.message || e) + '（请检查令牌是否有 repo 权限）';
  } finally { btn.disabled = false; }
}
function genName(orig) {
  const ext = (orig.match(/\.[A-Za-z0-9]+$/) || [''])[0] || '';
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + ext.toLowerCase();
}
async function deleteItem(it) {
  if (!it) return;
  if (!window.confirm(`确定删除「${it.title}」？删除后所有人将看不到这条内容。`)) return;
  try {
    let list = await loadContent();
    list = list.filter(x => x.id !== it.id);
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2))));
    await putRepoFile(DATA_PATH, b64, 'delete: ' + (it.title || it.id));
    if (favorites.delete(it.id)) { saveFavs(); updateFavBadge(); }
    closeEditor();
    ALL_ITEMS = list; animKey = ''; applyState(); renderEditbar();
    toast('已删除！约 1 分钟后全员同步');
  } catch (e) { toast('删除失败：' + (e.message || e)); }
}
async function duplicateItem(it) {
  const copy = Object.assign({}, it, { id: newId(), title: (it.title || '') + '（副本）', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  try {
    const list = await loadContent(); list.unshift(copy);
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2))));
    await putRepoFile(DATA_PATH, b64, 'duplicate: ' + (copy.title || copy.id));
    closeEditor(); ALL_ITEMS = list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    animKey = ''; applyState(); renderEditbar();
    toast('已复制一份，约 1 分钟后全员可见');
  } catch (e) { toast('复制失败：' + (e.message || e)); }
}

/* ---------------- 登录 / 退出 ---------------- */
function applyRoleUI() {
  const isAdmin = !!(ME);
  el('edit-toggle').style.display = isAdmin ? '' : 'none';
  el('admin-toggle').style.display = isAdmin ? 'none' : '';
  el('user-box').style.display = isAdmin ? '' : 'none';
  el('logout-btn').style.display = isAdmin ? '' : 'none';
  if (isAdmin) el('user-box').innerHTML = `<span class="ub-name">@${escapeHtml(ME.login)}</span><span class="ub-role">管理员</span>`;
  if (!isAdmin && state.editing) setEditing(false);
}
function openLogin() { el('loginbox').classList.add('open'); el('lg-error').textContent = ''; setTimeout(() => { try { el('tk').focus(); } catch (e) {} }, 80); }
function closeLogin() { el('loginbox').classList.remove('open'); }
async function doLogin() {
  const tk = el('tk').value.trim();
  el('lg-error').textContent = '';
  if (!tk) { el('lg-error').textContent = '请粘贴 GitHub 令牌'; return; }
  const btn = el('tk-btn'); btn.disabled = true;
  try {
    const r = await fetch(API + `/repos/${OWNER}/${REPO}`, { headers: { 'Authorization': 'token ' + tk, 'Accept': 'application/vnd.github+json' } });
    if (r.status === 401) { el('lg-error').textContent = '令牌无效，请重新生成'; return; }
    if (!r.ok) { el('lg-error').textContent = '校验失败（' + r.status + '）'; return; }
    const d = await r.json();
    if (!(d.permissions && d.permissions.push)) { el('lg-error').textContent = '该令牌没有写入权限，请勾选 repo 后重新生成'; return; }
    TOKEN = tk; localStorage.setItem(TOKEN_KEY, tk); ME = { login: (d.owner && d.owner.login) || OWNER };
    closeLogin(); el('tk').value = ''; applyRoleUI(); renderEditbar();
    toast('已登录：@' + ME.login);
  } catch (e) { el('lg-error').textContent = '网络错误：' + (e.message || e); }
  finally { btn.disabled = false; }
}
function logout() {
  if (!window.confirm('确定退出管理员登录？')) return;
  TOKEN = ''; localStorage.removeItem(TOKEN_KEY); ME = null; applyRoleUI(); setEditing(false); renderEditbar();
  toast('已退出登录');
}
async function restoreSession() {
  if (!TOKEN) { applyRoleUI(); return; }
  try {
    const r = await fetch(API + `/repos/${OWNER}/${REPO}`, { headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github+json' } });
    if (r.ok) { const d = await r.json(); if (d.permissions && d.permissions.push) { ME = { login: (d.owner && d.owner.login) || OWNER }; } else { TOKEN = ''; localStorage.removeItem(TOKEN_KEY); } }
    else { TOKEN = ''; localStorage.removeItem(TOKEN_KEY); }
  } catch (e) { /* 离线则保持未登录 */ }
  applyRoleUI();
}

/* ---------------- 分享 ---------------- */
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  try { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:-1000px;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function shareCurrent() { copyText(location.href).then(ok => toast(ok ? '已复制本页链接，粘贴即可分享' : '复制失败，请手动复制地址栏')); }

/* ---------------- 滚动 ---------------- */
function scrollToResults() { const top = el('toolbar').getBoundingClientRect().top + window.scrollY - 12; window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' }); }

/* ---------------- 事件 ---------------- */
function bindEvents() {
  el('search').addEventListener('input', e => { state.q = e.target.value.trim(); syncUrl(); renderActive(); update(); });
  el('category').addEventListener('change', e => { state.category = e.target.value; applyState(); });
  el('sort').addEventListener('change', e => { state.sort = e.target.value; applyState(); });
  el('reset').addEventListener('click', resetFilters);
  el('refresh').addEventListener('click', async () => { const n = await reload(); toast('已刷新，共 ' + n + ' 条'); });
  el('fav-toggle').addEventListener('click', () => { state.favOnly = !state.favOnly; if (state.favOnly && !favorites.size) toast('还没有收藏，点卡片右上角 ♡'); applyState(); });
  el('to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  el('admin-toggle').addEventListener('click', openLogin);
  el('tk-btn').addEventListener('click', doLogin);
  el('tk-cancel').addEventListener('click', closeLogin);
  el('tk').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  el('logout-btn').addEventListener('click', logout);
  el('loginbox').addEventListener('click', e => { if (e.target === el('loginbox')) closeLogin(); });

  el('modal-close').addEventListener('click', closeModal);
  el('modal').addEventListener('click', e => { if (e.target === el('modal')) closeModal(); });
  el('modal-fav').addEventListener('click', e => { if (!modalItem) return; const on = toggleFav(modalItem.id); e.currentTarget.classList.toggle('on', on); e.currentTarget.textContent = on ? '♥' : '♡'; updateFavBadge(); if (state.favOnly) applyState(); else update(); toast(on ? '已加入收藏' : '已取消收藏'); });
  el('modal-edit').addEventListener('click', () => { const it = modalItem; closeModal(); if (it) openEditor(it); });

  el('edit-toggle').addEventListener('click', () => setEditing(!state.editing));
  el('btn-new').addEventListener('click', () => openEditor(null));

  el('ed-close').addEventListener('click', closeEditor);
  el('ed-cancel').addEventListener('click', closeEditor);
  el('ed-save').addEventListener('click', saveEditor);
  el('ed-delete').addEventListener('click', () => { const it = ALL_ITEMS.find(x => x.id === editingId); if (it) deleteItem(it); });
  el('editor').addEventListener('click', e => { if (e.target === el('editor')) closeEditor(); });
  el('ed-category').addEventListener('change', () => renderCoverPreview());
  el('ed-cover-pick').addEventListener('click', () => { const f = el('ed-cover-file'); f.value = ''; f.click(); });
  el('ed-cover-clear').addEventListener('click', () => { draftCover = null; coverFileObj = null; el('ed-cover-url').value = ''; renderCoverPreview(); });
  el('ed-cover-url').addEventListener('input', e => { const v = e.target.value.trim(); draftCover = v || null; coverFileObj = null; renderCoverPreview(); });
  el('ed-cover-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { el('ed-error').textContent = '请选择图片文件'; return; }
    coverFileObj = f;
    const reader = new FileReader();
    reader.onload = () => { shrinkImage(String(reader.result), 1000, 0.85).then(d => { draftCover = d; renderCoverPreview(); }).catch(() => { draftCover = ''; renderCoverPreview(); }); };
    reader.readAsDataURL(f);
  });
  el('ed-video-pick').addEventListener('click', () => { el('ed-video-file').value = ''; el('ed-video-file').click(); });
  el('ed-video-clear').addEventListener('click', () => { videoFileObj = null; el('ed-video').value = ''; renderVideoPreview(); });
  el('ed-video-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!/^video\//.test(f.type)) { el('ed-error').textContent = '请选择视频文件'; return; }
    videoFileObj = f; el('ed-video').value = ''; el('ed-error').textContent = ''; renderVideoPreview();
  });
  el('ed-video').addEventListener('input', e => { if (e.target.value.trim()) videoFileObj = null; renderVideoPreview(); });
  el('ed-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEditor(); } });

  document.querySelectorAll('.seg button').forEach(b => { b.onclick = () => { state.view = b.dataset.view; document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); syncUrl(); renderList(current); }; });

  document.addEventListener('keydown', e => {
    const inEditor = el('editor').classList.contains('open');
    if (inEditor && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveEditor(); return; }
    if (e.key === 'Escape') {
      if (inEditor) closeEditor();
      else if (el('modal').classList.contains('open')) closeModal();
      else if (el('loginbox').classList.contains('open')) closeLogin();
      else if (document.activeElement === el('search')) { el('search').value = ''; state.q = ''; syncUrl(); renderActive(); update(); el('search').blur(); }
    }
    if (e.key === '/' && !inEditor && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); el('search').focus(); }
  });

  window.addEventListener('scroll', () => {
    const t = el('toolbar'); t.classList.toggle('stuck', t.getBoundingClientRect().top <= 12);
    el('to-top').classList.toggle('show', window.scrollY > 500);
  }, { passive: true });
}

/* ---------------- 启动 ---------------- */
async function init() {
  readUrl();
  ALL_ITEMS = await loadContent();
  ALL_ITEMS.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  el('category').innerHTML = '<option value="">全部分类</option>';
  (CONFIG.CATEGORIES || []).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; el('category').appendChild(o); });
  el('search').value = state.q; el('category').value = state.category; el('sort').value = state.sort;
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  renderEditbar(); bindEvents();
  await restoreSession();
  applyState();
  el('to-top').classList.toggle('show', window.scrollY > 500);
}
init();
