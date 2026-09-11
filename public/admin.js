// 健康内容中台 - 后台素材管理逻辑
let CONFIG = null;
const ICONS = { '膳食营养库':'🥗','慢病管理库':'❤️','生活实操库':'🍳','辟谣真相库':'🔍','专家答疑库':'💬','健康陪伴库':'🤝' };

function el(id) { return document.getElementById(id); }
function toast(msg) {
  const t = el('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function init() {
  const res = await fetch('/api/config');
  CONFIG = await res.json();
  const cat = el('f-category');
  CONFIG.CATEGORIES.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; cat.appendChild(o); });
  buildChecks('f-disease', CONFIG.DISEASE_TAGS);
  buildChecks('f-format', CONFIG.FORMAT_TAGS);
  buildChecks('f-journey', CONFIG.JOURNEY_TAGS);

  el('f-category').addEventListener('change', e => { buildSubtopicChecks(e.target.value); });

  el('content-form').addEventListener('submit', onSubmit);
  el('cancel-edit').addEventListener('click', resetForm);
  loadList();
}

function buildSubtopicChecks(category) {
  const c = el('f-subtopic');
  c.innerHTML = '';
  const hint = el('subtopic-hint');
  const subs = (CONFIG.SUBTOPICS && CONFIG.SUBTOPICS[category]) || [];
  if (!category || !subs.length) {
    hint.textContent = '请先选择上方"内容分类"，再勾选对应的细分主题。';
    return;
  }
  hint.textContent = `（${category} 的子分类，可多选）`;
  subs.forEach(t => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${t}"> ${t}`;
    c.appendChild(label);
  });
}

function buildChecks(containerId, tags) {
  const c = el(containerId);
  tags.forEach(t => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${t}" data-dim="${containerId}"> ${t}`;
    c.appendChild(label);
  });
}
function checkedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(i => i.value);
}
function setChecked(containerId, values) {
  document.querySelectorAll(`#${containerId} input`).forEach(i => { i.checked = values.includes(i.value); });
}

async function onSubmit(e) {
  e.preventDefault();
  const id = el('edit-id').value;
  const fd = new FormData();
  fd.set('title', el('f-title').value.trim());
  fd.set('category', el('f-category').value);
  fd.set('diseaseTags', checkedValues('f-disease').join(','));
  fd.set('formatTags', checkedValues('f-format').join(','));
  fd.set('journeyTags', checkedValues('f-journey').join(','));
  fd.set('subTopics', checkedValues('f-subtopic').join(','));
  fd.set('summary', el('f-summary').value.trim());
  fd.set('body', el('f-body').value.trim());
  fd.set('videoUrl', el('f-video').value.trim());
  const cover = el('f-cover').files[0];
  if (cover) fd.set('cover', cover);

  const url = id ? `/api/contents/${id}` : '/api/contents';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    toast('保存失败：' + (err.error || res.status));
    return;
  }
  toast(id ? '已更新内容' : '已发布内容');
  resetForm();
  loadList();
}

function resetForm() {
  el('content-form').reset();
  el('edit-id').value = '';
  buildSubtopicChecks('');
  el('cover-hint').textContent = '不上传则使用分类占位图。';
  el('form-title').textContent = '新增内容素材';
  el('submit-btn').textContent = '保存内容';
  el('cancel-edit').style.display = 'none';
}

async function loadList() {
  const res = await fetch('/api/contents?sort=new');
  const items = await res.json();
  el('list-count').textContent = items.length;
  const box = el('admin-items');
  box.innerHTML = '';
  items.forEach(it => {
    const color = (CONFIG.CATEGORY_COLOR && CONFIG.CATEGORY_COLOR[it.category]) || '#2e9e5b';
    const icon = ICONS[it.category] || '🌿';
    const row = document.createElement('div');
    row.className = 'admin-item';
    const thumbStyle = it.cover
      ? `background-image:url('${it.cover}');background-size:cover;background-position:center;`
      : `background:${color};`;
    row.innerHTML = `
      <div class="thumb" style="${thumbStyle}">${it.cover ? '' : icon}</div>
      <div class="info">
        <div class="t">${escapeHtml(it.title)}</div>
        <div class="m">${it.category} · ${(it.diseaseTags||[]).join('/') || '—'} · ${(it.formatTags||[]).join('/') || '—'}</div>
      </div>
      <div class="ops">
        <button class="btn" data-edit="${it.id}">编辑</button>
        <button class="btn" data-del="${it.id}">删除</button>
      </div>`;
    row.querySelector('[data-edit]').onclick = () => editItem(it.id);
    row.querySelector('[data-del]').onclick = () => deleteItem(it.id);
    box.appendChild(row);
  });
}

async function editItem(id) {
  const res = await fetch('/api/contents/' + id);
  if (!res.ok) return;
  const it = await res.json();
  el('edit-id').value = it.id;
  el('f-title').value = it.title;
  el('f-category').value = it.category;
  buildSubtopicChecks(it.category);
  setChecked('f-disease', it.diseaseTags || []);
  setChecked('f-format', it.formatTags || []);
  setChecked('f-journey', it.journeyTags || []);
  setChecked('f-subtopic', it.subTopics || []);
  el('f-summary').value = it.summary || '';
  el('f-body').value = it.body || '';
  el('f-video').value = it.videoUrl || '';
  el('cover-hint').textContent = it.cover ? '当前已有封面，重新选择将替换。' : '不上传则使用分类占位图。';
  el('form-title').textContent = '编辑内容：' + it.title;
  el('submit-btn').textContent = '更新内容';
  el('cancel-edit').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(id) {
  if (!confirm('确定删除这条内容？此操作不可恢复。')) return;
  const res = await fetch('/api/contents/' + id, { method: 'DELETE' });
  if (res.ok) { toast('已删除'); loadList(); }
  else toast('删除失败');
}

init();
