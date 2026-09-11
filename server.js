/**
 * 健康内容中台 - 后端服务（带登录与权限）
 * - 登录鉴权：管理员(admin) / 查看者(viewer) 两种角色
 * - 内容展示、标签筛选、后台素材（视频/封面/文案）上传与管理
 * - 上传的文件与内容数据持久化到 DATA_DIR（Render 上挂载独立磁盘，重启不丢）
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
const SEED_DIR = path.join(ROOT, 'seed');
const PUBLIC_DIR = path.join(ROOT, 'share');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'contents.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

[DATA_DIR, UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

/* ---------------- 首次运行：从仓库内置种子初始化 ---------------- */
function seedFile(target, source) {
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    try { fs.copyFileSync(source, target); } catch (e) { /* ignore */ }
  }
}
seedFile(DATA_FILE, path.join(SEED_DIR, 'contents.json'));

/* ---------------- 配置：内容体系 ---------------- */
const CONFIG = {
  CATEGORIES: ['膳食营养库', '慢病管理库', '生活实操库', '辟谣真相库', '专家答疑库', '健康陪伴库'],
  DISEASE_TAGS: ['高血压', '糖尿病', '高血脂', '骨质疏松', '慢阻肺', '普通健康', '食材红黑榜', '三餐搭配', '替代品认知', '食疗调理', '一周食谱', '慢病常识', '生活方式', '监测记录', '并发症预防', '用药尝试', '买菜指南', '下厨实操', '运动处方', '自测工具', '食疗误区', '保健品陷阱', '偏方核查', '代糖代盐真相', '一问一答', '直播回放', '误区纠正', '节气养生', '会员故事', '健康周报'],
  FORMAT_TAGS: ['图文', '短视频', '长视频', '音频答疑', '直播回放', '打卡任务', '自测工具'],
  JOURNEY_TAGS: ['认知层', '行动层', '深化层']
};

/* ---------------- 密码与令牌 ---------------- */
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-prod';
const ADMIN_DEFAULT_PW = process.env.ADMIN_PASSWORD || 'admin123';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex')); }
  catch (e) { return false; }
}
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}

/* ---------------- 用户存储 ---------------- */
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const admin = { username: 'admin', password: hashPassword(ADMIN_DEFAULT_PW), role: 'admin', createdAt: new Date().toISOString() };
    const list = [admin];
    fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2));
    if (ADMIN_DEFAULT_PW === 'admin123') {
      console.log('\n⚠️  初始管理员账号：admin / admin123（请在部署时用环境变量 ADMIN_PASSWORD 修改，或在后台修改密码）\n');
    }
    return list;
  }
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch (e) { return []; }
}
function writeUsers(list) { fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2)); }
function findUser(name) { return readUsers().find(u => u.username === name); }

/* ---------------- 内容存储 ---------------- */
function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch (e) { return []; }
}
function writeData(arr) { fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf-8'); }

/* ---------------- 工具 ---------------- */
function toArr(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
  if (typeof v === 'string' && v.length) return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}
function validTag(v, list) { return list.includes(v); }
function uploadPathOf(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) return path.join(UPLOAD_DIR, url.replace(/^\/uploads\//, ''));
  return null;
}

/* ---------------- 上传（视频 + 封面） ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || (file.mimetype.includes('video') ? '.mp4' : '.jpg');
    cb(null, crypto.randomBytes(10).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: (process.env.MAX_UPLOAD_MB || 300) * 1024 * 1024 }
});
const uploadFields = upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'video', maxCount: 1 }]);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

/* ---------------- 鉴权中间件 ---------------- */
function getToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (m) return m[1];
  if (req.query && req.query.token) return req.query.token;
  return null;
}
function requireAuth(req, res, next) {
  const u = verifyToken(getToken(req));
  if (!u) return res.status(401).json({ error: '请先登录' });
  req.user = u;
  next();
}
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: '需要管理员权限' });
}

/* ---------------- 鉴权 API ---------------- */
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = findUser(String(username).trim());
  if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: '用户名或密码错误' });
  const token = signToken({ username: user.username, role: user.role, exp: Date.now() + 30 * 24 * 3600 * 1000 });
  res.json({ token, user: { username: user.username, role: user.role } });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { username: req.user.username, role: req.user.role } }));

// 管理员修改自己的密码
app.post('/api/auth/change-password', requireAuth, requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: '新密码至少 4 位' });
  const users = readUsers();
  const idx = users.findIndex(u => u.username === req.user.username);
  if (idx === -1) return res.status(404).json({ error: '用户不存在' });
  if (oldPassword && !verifyPassword(oldPassword, users[idx].password)) return res.status(400).json({ error: '原密码不正确' });
  users[idx].password = hashPassword(newPassword);
  writeUsers(users);
  res.json({ ok: true });
});

// 管理员：列出查看者账号（不含密码）
app.get('/api/auth/users', requireAuth, requireAdmin, (req, res) => {
  const list = readUsers()
    .filter(u => u.role === 'viewer')
    .map(u => ({ username: u.username, createdAt: u.createdAt }));
  res.json(list);
});

// 管理员：新建查看者账号
app.post('/api/auth/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password } = req.body || {};
  const uname = String(username || '').trim();
  if (!uname) return res.status(400).json({ error: '请输入账号名' });
  if (!/^[\w一-龥.-]{2,20}$/.test(uname)) return res.status(400).json({ error: '账号名 2-20 位，可用中英文、数字、._-' });
  if (!password || String(password).length < 4) return res.status(400).json({ error: '密码至少 4 位' });
  const users = readUsers();
  if (users.some(u => u.username === uname)) return res.status(409).json({ error: '该账号已存在' });
  users.push({ username: uname, password: hashPassword(password), role: 'viewer', createdAt: new Date().toISOString() });
  writeUsers(users);
  res.status(201).json({ username: uname });
});

// 管理员：删除查看者账号（不能删自己）
app.delete('/api/auth/users/:username', requireAuth, requireAdmin, (req, res) => {
  const name = req.params.username;
  if (name === req.user.username) return res.status(400).json({ error: '不能删除管理员自己' });
  const users = readUsers();
  const idx = users.findIndex(u => u.username === name && u.role === 'viewer');
  if (idx === -1) return res.status(404).json({ error: '账号不存在' });
  users.splice(idx, 1);
  writeUsers(users);
  res.json({ ok: true });
});

/* ---------------- 内容 API ---------------- */
app.get('/api/config', (req, res) => res.json(CONFIG));

app.get('/api/contents', requireAuth, (req, res) => {
  let items = readData();
  const { disease, format, journey, category, q, sort } = req.query;
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

app.get('/api/contents/:id', requireAuth, (req, res) => {
  const item = readData().find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

// 从 multipart 的 meta 字段解析结构化数据，并落库
function buildItemFromReq(req, existing) {
  const meta = JSON.parse(req.body.meta || '{}');
  const b = meta;
  if (!b.title || !b.category) throw new Error('标题与分类必填');
  if (!CONFIG.CATEGORIES.includes(b.category)) throw new Error('分类非法');
  const coverFile = req.files && req.files.cover && req.files.cover[0];
  const videoFile = req.files && req.files.video && req.files.video[0];
  const item = {
    id: existing ? existing.id : crypto.randomUUID(),
    title: String(b.title).trim(),
    category: b.category,
    diseaseTags: toArr(b.diseaseTags).filter(t => validTag(t, CONFIG.DISEASE_TAGS)),
    formatTags: toArr(b.formatTags).filter(t => validTag(t, CONFIG.FORMAT_TAGS)),
    journeyTags: toArr(b.journeyTags).filter(t => validTag(t, CONFIG.JOURNEY_TAGS)),
    summary: String(b.summary || '').trim(),
    body: String(b.body || '').trim(),
    cover: coverFile ? '/uploads/' + coverFile.filename : (b.cover !== undefined ? b.cover : (existing ? existing.cover : null)),
    videoUrl: videoFile ? '/uploads/' + videoFile.filename : (b.videoUrl !== undefined ? b.videoUrl : (existing ? existing.videoUrl : '')),
    createdAt: existing ? existing.createdAt : (b.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
  return item;
}

app.post('/api/contents', requireAuth, requireAdmin, (req, res) => {
  uploadFields(req, res, err => {
    if (err) return res.status(400).json({ error: '上传失败：' + err.message });
    try {
      const item = buildItemFromReq(req, null);
      const items = readData();
      items.unshift(item);
      writeData(items);
      res.status(201).json(item);
    } catch (e) {
      // 清理已上传的文件
      ['cover', 'video'].forEach(k => { const f = req.files && req.files[k] && req.files[k][0]; if (f) try { fs.unlinkSync(f.path); } catch (_) {} });
      res.status(400).json({ error: e.message });
    }
  });
});

app.put('/api/contents/:id', requireAuth, requireAdmin, (req, res) => {
  uploadFields(req, res, err => {
    if (err) return res.status(400).json({ error: '上传失败：' + err.message });
    try {
      const items = readData();
      const idx = items.findIndex(i => i.id === req.params.id);
      if (idx === -1) throw new Error('not found');
      const old = items[idx];
      const updated = buildItemFromReq(req, old);
      // 封面/视频被替换时，删除旧文件
      const coverFile = req.files && req.files.cover && req.files.cover[0];
      const videoFile = req.files && req.files.video && req.files.video[0];
      if (coverFile) { const p = uploadPathOf(old.cover); if (p) try { fs.unlinkSync(p); } catch (_) {} }
      if (videoFile) { const p = uploadPathOf(old.videoUrl); if (p) try { fs.unlinkSync(p); } catch (_) {} }
      items[idx] = updated;
      writeData(items);
      res.json(updated);
    } catch (e) {
      ['cover', 'video'].forEach(k => { const f = req.files && req.files[k] && req.files[k][0]; if (f) try { fs.unlinkSync(f.path); } catch (_) {} });
      res.status(e.message === 'not found' ? 404 : 400).json({ error: e.message });
    }
  });
});

app.delete('/api/contents/:id', requireAuth, requireAdmin, (req, res) => {
  const items = readData();
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const removed = items[idx];
  [removed.cover, removed.videoUrl].forEach(u => { const p = uploadPathOf(u); if (p) try { fs.unlinkSync(p); } catch (_) {} });
  items.splice(idx, 1);
  writeData(items);
  res.json({ ok: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const items = readData();
  const byCategory = {};
  CONFIG.CATEGORIES.forEach(c => byCategory[c] = 0);
  items.forEach(it => { if (byCategory[it.category] !== undefined) byCategory[it.category]++; });
  res.json({ total: items.length, byCategory });
});

// 兜底错误（如文件超限）
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '文件过大，超过上传上限' });
  res.status(500).json({ error: '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`健康内容中台已启动: http://localhost:${PORT}`);
  console.log(`前台展示: http://localhost:${PORT}/`);
});
