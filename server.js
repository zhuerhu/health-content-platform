/**
 * 健康内容中台 - 后端服务
 * 提供内容展示、标签筛选、后台素材上传与管理的 REST API
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'share');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(PUBLIC_DIR, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'contents.json');

[DATA_DIR, UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// 首次运行（例如挂载了独立数据盘、DATA_DIR 为空）时，从仓库内置种子初始化内容库
if (!fs.existsSync(DATA_FILE)) {
  const seedSrc = path.join(ROOT, 'data', 'contents.json');
  try { fs.copyFileSync(seedSrc, DATA_FILE); }
  catch (e) { writeData([]); }
}

// ---- 配置：来自《小程序内容中台·内容体系设计方案》 ----
const CONFIG = {
  CATEGORIES: ['膳食营养库', '慢病管理库', '生活实操库', '辟谣真相库', '专家答疑库', '健康陪伴库'],
  DISEASE_TAGS: ['高血压', '糖尿病', '高血脂', '骨质疏松', '慢阻肺', '普通健康', '食材红黑榜', '三餐搭配', '替代品认知', '食疗调理', '一周食谱', '慢病常识', '生活方式', '监测记录', '并发症预防', '用药尝试', '买菜指南', '下厨实操', '运动处方', '自测工具', '食疗误区', '保健品陷阱', '偏方核查', '代糖代盐真相', '一问一答', '直播回放', '误区纠正', '节气养生', '会员故事', '健康周报'],
  FORMAT_TAGS: ['图文', '短视频', '长视频', '音频答疑', '直播回放', '打卡任务', '自测工具'],
  JOURNEY_TAGS: ['认知层', '行动层', '深化层'],
  // 各分类下的细分主题（病种标签的进一步细分）
  SUBTOPICS: {
    '膳食营养库': ['食材红黑榜', '三餐搭配', '替代品认知', '食疗调理', '一周食谱'],
    '慢病管理库': ['慢病常识', '生活方式', '监测记录', '并发症预防', '用药尝试'],
    '生活实操库': ['买菜指南', '下厨实操', '运动处方', '自测工具'],
    '辟谣真相库': ['食疗误区', '保健品陷阱', '偏方核查', '代糖代盐真相'],
    '专家答疑库': ['一问一答', '直播回放', '误区纠正'],
    '健康陪伴库': ['节气养生', '会员故事', '健康周报']
  }
};
const ALL_SUBTOPICS = Object.values(CONFIG.SUBTOPICS).flat();

// 分类 -> 主题色（用于前端占位图）
const CATEGORY_COLOR = {
  '膳食营养库': '#2e9e5b',
  '慢病管理库': '#e8633a',
  '生活实操库': '#2f8fd6',
  '辟谣真相库': '#c0392b',
  '专家答疑库': '#8e44ad',
  '健康陪伴库': '#d4a017'
};

// ---- 数据存储（JSON 文件，零原生依赖，便于查看与备份） ----
function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch (e) { return []; }
}
function writeData(arr) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf-8');
}

// ---- 工具 ----
function toArr(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
  if (typeof v === 'string' && v.length) return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}
function validTag(v, list) { return list.includes(v); }

// ---- 上传 ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, crypto.randomBytes(8).toString('hex') + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---- API ----
app.get('/api/config', (req, res) => res.json({ ...CONFIG, CATEGORY_COLOR }));

app.get('/api/contents', (req, res) => {
  let items = readData();
  const { disease, format, journey, subtopic, category, q, sort } = req.query;

  // 跨维度 AND；同维度内 OR（命中任一即可）
  if (category) items = items.filter(it => it.category === category);
  if (disease) {
    const s = disease.split(',').filter(Boolean);
    items = items.filter(it => s.some(t => (it.diseaseTags || []).includes(t)));
  }
  if (format) {
    const s = format.split(',').filter(Boolean);
    items = items.filter(it => s.some(t => (it.formatTags || []).includes(t)));
  }
  if (journey) {
    const s = journey.split(',').filter(Boolean);
    items = items.filter(it => s.some(t => (it.journeyTags || []).includes(t)));
  }
  if (subtopic) {
    const s = subtopic.split(',').filter(Boolean);
    items = items.filter(it => s.some(t => (it.subTopics || []).includes(t)));
  }
  if (q) {
    const kw = q.toLowerCase();
    items = items.filter(it =>
      [it.title, it.summary, it.body, it.category]
        .concat(it.diseaseTags || [], it.formatTags || [], it.journeyTags || [])
        .join(' ').toLowerCase().includes(kw)
    );
  }
  if (sort === 'old') items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  else items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  res.json(items);
});

app.get('/api/contents/:id', (req, res) => {
  const items = readData();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

app.post('/api/contents', upload.single('cover'), (req, res) => {
  const b = req.body;
  if (!b.title || !b.category) return res.status(400).json({ error: '标题与分类必填' });
  if (!CONFIG.CATEGORIES.includes(b.category)) return res.status(400).json({ error: '分类非法' });
  const item = {
    id: crypto.randomUUID(),
    title: b.title.trim(),
    category: b.category,
    diseaseTags: toArr(b.diseaseTags).filter(t => validTag(t, CONFIG.DISEASE_TAGS)),
    formatTags: toArr(b.formatTags).filter(t => validTag(t, CONFIG.FORMAT_TAGS)),
    journeyTags: toArr(b.journeyTags).filter(t => validTag(t, CONFIG.JOURNEY_TAGS)),
    subTopics: toArr(b.subTopics).filter(t => ALL_SUBTOPICS.includes(t)),
    summary: (b.summary || '').trim(),
    body: (b.body || '').trim(),
    videoUrl: (b.videoUrl || '').trim(),
    cover: req.file ? '/uploads/' + req.file.filename : (b.cover || null),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const items = readData();
  items.unshift(item);
  writeData(items);
  res.status(201).json(item);
});

app.put('/api/contents/:id', upload.single('cover'), (req, res) => {
  const items = readData();
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const b = req.body;
  const old = items[idx];
  if (b.category && !CONFIG.CATEGORIES.includes(b.category)) return res.status(400).json({ error: '分类非法' });

  if (req.file) {
    // 删除旧封面
    if (old.cover && old.cover.startsWith('/uploads/')) {
      const oldPath = path.join(PUBLIC_DIR, old.cover.replace(/^\//, ''));
      try { fs.unlinkSync(oldPath); } catch (e) {}
    }
  }
  const updated = {
    ...old,
    title: b.title ? b.title.trim() : old.title,
    category: b.category || old.category,
    diseaseTags: b.diseaseTags !== undefined ? toArr(b.diseaseTags).filter(t => validTag(t, CONFIG.DISEASE_TAGS)) : old.diseaseTags,
    formatTags: b.formatTags !== undefined ? toArr(b.formatTags).filter(t => validTag(t, CONFIG.FORMAT_TAGS)) : old.formatTags,
    journeyTags: b.journeyTags !== undefined ? toArr(b.journeyTags).filter(t => validTag(t, CONFIG.JOURNEY_TAGS)) : old.journeyTags,
    subTopics: b.subTopics !== undefined ? toArr(b.subTopics).filter(t => ALL_SUBTOPICS.includes(t)) : old.subTopics,
    summary: b.summary !== undefined ? b.summary.trim() : old.summary,
    body: b.body !== undefined ? b.body.trim() : old.body,
    videoUrl: b.videoUrl !== undefined ? b.videoUrl.trim() : old.videoUrl,
    cover: req.file ? '/uploads/' + req.file.filename : (b.cover !== undefined ? b.cover : old.cover),
    updatedAt: new Date().toISOString()
  };
  items[idx] = updated;
  writeData(items);
  res.json(updated);
});

app.delete('/api/contents/:id', (req, res) => {
  const items = readData();
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const removed = items[idx];
  if (removed.cover && removed.cover.startsWith('/uploads/')) {
    try { fs.unlinkSync(path.join(PUBLIC_DIR, removed.cover.replace(/^\//, ''))); } catch (e) {}
  }
  items.splice(idx, 1);
  writeData(items);
  res.json({ ok: true });
});

// 分类统计（用于首页概览）
app.get('/api/stats', (req, res) => {
  const items = readData();
  const byCategory = {};
  CONFIG.CATEGORIES.forEach(c => byCategory[c] = 0);
  items.forEach(it => { if (byCategory[it.category] !== undefined) byCategory[it.category]++; });
  res.json({ total: items.length, byCategory });
});

app.listen(PORT, () => {
  console.log(`健康内容中台已启动: http://localhost:${PORT}`);
  console.log(`前台展示: http://localhost:${PORT}/`);
  console.log(`后台管理: http://localhost:${PORT}/admin.html`);
});
