/**
 * LuaProtect — Bảo vệ script Lua
 * - Dán script → nhận link + mật khẩu
 * - Trình duyệt: cần mật khẩu mới xem code
 * - Roblox: dùng /raw/:id (hoặc link có key) để HttpGet / loadstring bình thường
 *
 * npm install && npm start → http://localhost:3000
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'scripts.json');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

if (!fs.existsSync(path.join(ROOT, 'data'))) fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, 'public')));

function readDB() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}
function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function isRobloxRequest(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  // Roblox HttpService thường có user-agent đặc trưng hoặc trống / Roblox
  return (
    ua.includes('roblox') ||
    ua.includes('httpclient') ||
    req.headers['roblox-id'] ||
    req.query.raw === '1'
  );
}

// Tạo script bảo vệ
app.post('/api/create', async (req, res) => {
  try {
    const { script, password, title, note } = req.body;
    if (!script || typeof script !== 'string' || !script.trim()) {
      return res.status(400).json({ error: 'Thiếu nội dung script' });
    }
    if (!password || String(password).length < 3) {
      return res.status(400).json({ error: 'Mật khẩu tối thiểu 3 ký tự' });
    }

    const id = uuidv4().replace(/-/g, '').slice(0, 12);
    const rawKey = crypto.randomBytes(16).toString('hex');
    const hash = await bcrypt.hash(String(password), 10);

    // Lưu file script
    const filePath = path.join(SCRIPTS_DIR, id + '.lua');
    fs.writeFileSync(filePath, script, 'utf8');

    const db = readDB();
    db[id] = {
      id,
      title: (title || 'Protected Script').slice(0, 80),
      note: (note || '').slice(0, 200),
      passwordHash: hash,
      rawKey,
      createdAt: Date.now(),
      views: 0,
      rawHits: 0
    };
    writeDB(db);

    const base = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      id,
      // Link xem trên trình duyệt (cần mật khẩu)
      viewUrl: `${base}/s/${id}`,
      // Link raw cho Roblox loadstring (có key bí mật)
      rawUrl: `${base}/raw/${id}?key=${rawKey}`,
      // Gợi ý code Roblox
      robloxExample:
        `loadstring(game:HttpGet("${base}/raw/${id}?key=${rawKey}"))()`
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Tạo thất bại' });
  }
});

// Meta công khai (không lộ script)
app.get('/api/meta/:id', (req, res) => {
  const db = readDB();
  const item = db[req.params.id];
  if (!item) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json({
    id: item.id,
    title: item.title,
    note: item.note,
    createdAt: item.createdAt,
    views: item.views
  });
});

// Xác minh mật khẩu → trả script (chỉ cho browser view)
app.post('/api/unlock/:id', async (req, res) => {
  const db = readDB();
  const item = db[req.params.id];
  if (!item) return res.status(404).json({ error: 'Không tìm thấy' });

  const { password } = req.body;
  const ok = await bcrypt.compare(String(password || ''), item.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Sai mật khẩu' });

  const filePath = path.join(SCRIPTS_DIR, item.id + '.lua');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File script mất' });

  item.views = (item.views || 0) + 1;
  writeDB(db);

  const script = fs.readFileSync(filePath, 'utf8');
  res.json({ success: true, script, title: item.title });
});

// RAW endpoint — dành cho Roblox HttpGet
// Bảo vệ bằng ?key=rawKey (không dùng password)
app.get('/raw/:id', (req, res) => {
  const db = readDB();
  const item = db[req.params.id];
  if (!item) {
    res.status(404).type('text/plain').send('-- script not found');
    return;
  }

  const key = req.query.key || '';
  if (key !== item.rawKey) {
    // Nếu là Roblox nhưng sai key → từ chối
    // Nếu browser vào /raw không key → cũng từ chối (bảo vệ)
    res.status(403).type('text/plain').send('-- forbidden: invalid or missing key');
    return;
  }

  const filePath = path.join(SCRIPTS_DIR, item.id + '.lua');
  if (!fs.existsSync(filePath)) {
    res.status(404).type('text/plain').send('-- file missing');
    return;
  }

  item.rawHits = (item.rawHits || 0) + 1;
  writeDB(db);

  const script = fs.readFileSync(filePath, 'utf8');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(script);
});

// Trang xem script (SPA fallback)
app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'view.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🔒 LuaProtect: http://localhost:${PORT}\n`);
});
