const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), QR = require('qrcode'), pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const DIR = process.env.DATA_DIR || __dirname;           // على Render اربطه بـ Persistent Disk
const DB_FILE = path.join(DIR, 'data.json');
const SECRET = process.env.JWT_SECRET || 'change-me-in-render-env';
const TRIAL_DAYS = +process.env.TRIAL_DAYS || 2, TRIAL_MSGS = +process.env.TRIAL_MSGS || 30;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase(), SUPPORT_WA = process.env.SUPPORT_WA || '';
let db = { users: [], logs: [], templates: [], contacts: [], campaigns: [], requests: [], plans: [
  { id: 'basic', name: 'الأساسية', price: '10$', days: 30, daily: 300 },
  { id: 'pro', name: 'الاحترافية', price: '25$', days: 30, daily: 1500 },
  { id: 'biz', name: 'الأعمال', price: '60$', days: 30, daily: 10000 }] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}
let t; const save = () => { clearTimeout(t); t = setTimeout(() => fs.writeFileSync(DB_FILE, JSON.stringify(db)), 300); };
const id = () => crypto.randomBytes(8).toString('hex');
const newKey = () => 'wps_' + crypto.randomBytes(20).toString('hex');
const otps = {};          // `${uid}:${phone}` -> {code, exp}
const sessions = {};      // uid -> {sock,status,qr,phone}

/* ---------- WhatsApp (Baileys) ---------- */
async function startWA(uid) {
  const s = (sessions[uid] ||= { status: 'idle', qr: null, sock: null });
  if (s.sock) return;
  const dir = path.join(DIR, 'sessions', uid);
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: ['WP Sender', 'Chrome', '1.0'] });
  s.sock = sock; s.status = 'connecting';
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async u => {
    if (u.qr) { s.qr = await QR.toDataURL(u.qr); s.status = 'qr'; }
    if (u.connection === 'open') { s.status = 'connected'; s.qr = null; s.phone = sock.user.id.split(':')[0]; }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      s.sock = null; s.status = 'idle'; s.qr = null; s.phone = null;
      if (code === DisconnectReason.loggedOut) fs.rmSync(dir, { recursive: true, force: true });
      else setTimeout(() => startWA(uid).catch(() => {}), 3000);
    }
  });
}
const jidOf = n => String(n).replace(/\D/g, '') + '@s.whatsapp.net';
async function sendWA(user, to, text, type = 'api') {
  const s = sessions[user.id];
  if (!s || s.status !== 'connected') throw new Error('واتساب غير مربوط. اربط الرقم عبر QR أولاً');
  checkAccess(user);
  const log = { id: id(), uid: user.id, to: String(to).replace(/\D/g, ''), text, type, at: new Date().toISOString(), ok: true };
  try { await s.sock.sendMessage(jidOf(to), { text }); } catch (e) { log.ok = false; log.err = e.message; }
  if (log.ok && subInfo(user).type === 'trial') user.trialSent = (user.trialSent || 0) + 1;
  db.logs.push(log); if (db.logs.length > 20000) db.logs.shift(); save();
  if (!log.ok) throw new Error(log.err);
  return log;
}

/* ---------- الاشتراكات ---------- */
const DAY = 864e5, todayStr = () => new Date().toISOString().slice(0, 10);
function subInfo(u) {
  const now = Date.now(), used = db.logs.filter(l => l.uid === u.id && l.ok && l.at.startsWith(todayStr())).length;
  if (u.banned) return { active: false, type: 'banned', name: 'موقوف', reason: 'الحساب موقوف' };
  if (u.role === 'admin') return { active: true, type: 'admin', name: 'مدير', used, limit: 1e9 };
  if (u.sub && new Date(u.sub.expires) > now) return { active: true, type: 'paid', name: db.plans.find(p => p.id === u.sub.plan)?.name || u.sub.plan, expires: u.sub.expires, used, limit: u.sub.daily, left: Math.ceil((new Date(u.sub.expires) - now) / DAY) };
  const ts = u.trialSent || 0, tl = new Date(u.trialEnds) > now;
  if (!u.sub && tl && ts < TRIAL_MSGS) return { active: true, type: 'trial', name: 'تجريبي', expires: u.trialEnds, used: ts, limit: TRIAL_MSGS, left: Math.ceil((new Date(u.trialEnds) - now) / DAY) };
  return { active: false, type: 'expired', name: 'منتهي', used: ts, limit: TRIAL_MSGS, reason: u.sub ? 'انتهى اشتراكك. جدّد الاشتراك للمتابعة' : (ts >= TRIAL_MSGS ? 'استهلكت رسائل الفترة التجريبية' : 'انتهت الفترة التجريبية') + '. فعّل اشتراكاً للمتابعة' };
}
function checkAccess(u) {
  const i = subInfo(u);
  if (!i.active) throw new Error(i.reason);
  if (i.type === 'paid' && i.used >= i.limit) throw new Error('تم تجاوز الحد اليومي لباقتك');
}

/* ---------- Express ---------- */
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const wrap = f => (req, res) => Promise.resolve(f(req, res)).catch(e => res.status(400).json({ error: e.message }));

const auth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key) { const u = db.users.find(u => u.apiKey === key); if (u) { req.user = u; return next(); } return res.status(401).json({ error: 'مفتاح API غير صالح' }); }
  const done = () => req.user.banned && req.user.role !== 'admin' && req.path !== '/me' ? res.status(403).json({ error: 'الحساب موقوف' }) : next();
  try { const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); req.user = db.users.find(u => u.id === p.id); if (!req.user) throw 0; return done(); }
  catch { res.status(401).json({ error: 'غير مصرح' }); }
};
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, apiKey: u.apiKey, sub: subInfo(u) });
const tok = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '30d' });

app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) throw new Error('أكمل البيانات (كلمة المرور 6 أحرف على الأقل)');
  if (db.users.find(u => u.email === email.toLowerCase())) throw new Error('البريد مسجل مسبقاً');
  const u = { id: id(), name, email: email.toLowerCase(), pass: await bcrypt.hash(password, 10), role: (ADMIN_EMAIL ? email.toLowerCase() === ADMIN_EMAIL : !db.users.length) ? 'admin' : 'user', trialEnds: new Date(Date.now() + TRIAL_DAYS * DAY).toISOString(), trialSent: 0, apiKey: newKey(), at: new Date().toISOString() };
  db.users.push(u); save(); res.json({ token: tok(u), user: pub(u) });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const u = db.users.find(u => u.email === (req.body.email || '').toLowerCase());
  if (!u || !(await bcrypt.compare(req.body.password || '', u.pass))) throw new Error('بيانات الدخول غير صحيحة');
  res.json({ token: tok(u), user: pub(u) });
}));
app.get('/api/me', auth, (req, res) => res.json(pub(req.user)));
app.post('/api/key/regen', auth, (req, res) => { req.user.apiKey = newKey(); save(); res.json({ apiKey: req.user.apiKey }); });

// ربط واتساب
app.post('/api/wa/connect', auth, wrap(async (req, res) => { await startWA(req.user.id); res.json({ ok: true }); }));
app.get('/api/wa/status', auth, (req, res) => { const s = sessions[req.user.id] || {}; res.json({ status: s.status || 'idle', qr: s.qr || null, phone: s.phone || null }); });
app.post('/api/wa/logout', auth, wrap(async (req, res) => {
  const s = sessions[req.user.id]; if (s?.sock) { try { await s.sock.logout(); } catch {} }
  fs.rmSync(path.join(DIR, 'sessions', req.user.id), { recursive: true, force: true }); delete sessions[req.user.id]; res.json({ ok: true });
}));

// إرسال
app.post('/api/send', auth, wrap(async (req, res) => {
  const { to, message } = req.body; if (!to || !message) throw new Error('to و message مطلوبان');
  const l = await sendWA(req.user, to, message); res.json({ success: true, id: l.id });
}));
// OTP
app.post('/api/otp/send', auth, wrap(async (req, res) => {
  const { to, message } = req.body; if (!to) throw new Error('to مطلوب');
  const code = String(crypto.randomInt(100000, 999999));
  const tpl = message || (db.templates.find(t => t.uid === req.user.id && t.isDefault)?.body) || 'رمز التحقق الخاص بك: {OTP} هذا الرمز سينتهي خلال 5 دقائق.';
  if (!tpl.includes('{OTP}')) throw new Error('يجب أن تتضمن الرسالة {OTP}');
  otps[req.user.id + ':' + String(to).replace(/\D/g, '')] = { code, exp: Date.now() + 5 * 60e3 };
  await sendWA(req.user, to, tpl.replace('{OTP}', code), 'otp'); res.json({ success: true, expires_in: 300 });
}));
app.post('/api/otp/verify', auth, (req, res) => {
  const k = req.user.id + ':' + String(req.body.to || '').replace(/\D/g, ''), o = otps[k];
  if (!o || o.exp < Date.now()) return res.json({ valid: false, reason: 'expired' });
  if (o.code !== String(req.body.code)) return res.json({ valid: false, reason: 'wrong_code' });
  delete otps[k]; res.json({ valid: true });
});

// CRUD بسيط: قوالب + جهات اتصال
for (const [name, col] of [['templates', 'templates'], ['contacts', 'contacts']]) {
  app.get('/api/' + name, auth, (req, res) => res.json(db[col].filter(x => x.uid === req.user.id)));
  app.post('/api/' + name, auth, (req, res) => {
    const it = { id: id(), uid: req.user.id, ...req.body }; delete it.uid; it.uid = req.user.id;
    if (col === 'templates' && it.isDefault) db.templates.forEach(t => t.uid === req.user.id && (t.isDefault = false));
    db[col].push(it); save(); res.json(it);
  });
  app.delete('/api/' + name + '/:id', auth, (req, res) => { db[col] = db[col].filter(x => !(x.id === req.params.id && x.uid === req.user.id)); save(); res.json({ ok: true }); });
}

// الحملات
app.post('/api/campaigns', auth, wrap(async (req, res) => {
  const { name, message, numbers, delay = 4 } = req.body;
  const list = [...new Set((numbers || []).map(n => String(n).replace(/\D/g, '')).filter(n => n.length > 7))];
  if (!message || !list.length) throw new Error('الرسالة والأرقام مطلوبة');
  const c = { id: id(), uid: req.user.id, name: name || 'حملة', total: list.length, sent: 0, failed: 0, status: 'running', at: new Date().toISOString() };
  db.campaigns.push(c); save(); res.json(c);
  (async () => {
    for (const n of list) {
      try { await sendWA(req.user, n, message, 'campaign'); c.sent++; } catch { c.failed++; }
      save(); await new Promise(r => setTimeout(r, Math.max(2, delay) * 1000 + Math.random() * 2000));
    }
    c.status = 'done'; save();
  })();
}));
app.get('/api/campaigns', auth, (req, res) => res.json(db.campaigns.filter(c => c.uid === req.user.id).reverse()));
app.get('/api/logs', auth, (req, res) => res.json(db.logs.filter(l => l.uid === req.user.id).slice(-200).reverse()));
app.get('/api/stats', auth, (req, res) => {
  const L = db.logs.filter(l => l.uid === req.user.id), today = new Date().toISOString().slice(0, 10);
  res.json({ total: L.length, today: L.filter(l => l.at.startsWith(today)).length, failed: L.filter(l => !l.ok).length, otp: L.filter(l => l.type === 'otp').length, contacts: db.contacts.filter(c => c.uid === req.user.id).length, sub: subInfo(req.user) });
});

// الباقات وطلبات الاشتراك
app.get('/api/plans', (req, res) => res.json({ plans: db.plans, support: SUPPORT_WA, trial: { days: TRIAL_DAYS, msgs: TRIAL_MSGS } }));
app.post('/api/request', auth, (req, res) => { db.requests.push({ id: id(), uid: req.user.id, name: req.user.name, email: req.user.email, planId: req.body.planId, note: (req.body.note || '').slice(0, 300), status: 'pending', at: new Date().toISOString() }); save(); res.json({ ok: true }); });

// لوحة الإدارة
const adm = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'للمدير فقط' });
const A = '/api/admin';
app.get(A + '/overview', auth, adm, (req, res) => { const t = todayStr(); res.json({ users: db.users.length, paid: db.users.filter(u => subInfo(u).type === 'paid').length, trial: db.users.filter(u => subInfo(u).type === 'trial').length, expired: db.users.filter(u => subInfo(u).type === 'expired').length, msgsToday: db.logs.filter(l => l.ok && l.at.startsWith(t)).length, msgsTotal: db.logs.length, pending: db.requests.filter(r => r.status === 'pending').length, online: Object.values(sessions).filter(s => s.status === 'connected').length }); });
app.get(A + '/users', auth, adm, (req, res) => res.json(db.users.map(u => ({ ...pub(u), banned: !!u.banned, at: u.at, wa: sessions[u.id]?.status || 'idle', total: db.logs.filter(l => l.uid === u.id).length })).reverse()));
app.post(A + '/users/:id/activate', auth, adm, wrap(async (req, res) => {
  const u = db.users.find(u => u.id === req.params.id), p = db.plans.find(p => p.id === req.body.planId); if (!u || !p) throw new Error('غير موجود');
  const days = +req.body.days || p.days, base = u.sub && new Date(u.sub.expires) > Date.now() ? new Date(u.sub.expires).getTime() : Date.now();
  u.sub = { plan: p.id, daily: p.daily, expires: new Date(base + days * DAY).toISOString() };
  db.requests.forEach(r => r.uid === u.id && r.status === 'pending' && (r.status = 'done')); save(); res.json(pub(u));
}));
app.post(A + '/users/:id/deactivate', auth, adm, (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (u) { u.sub = { plan: 'none', daily: 0, expires: new Date(0).toISOString() }; save(); } res.json({ ok: true }); });
app.post(A + '/users/:id/trial', auth, adm, (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (u) { u.sub = null; u.trialSent = 0; u.trialEnds = new Date(Date.now() + (+req.body.days || TRIAL_DAYS) * DAY).toISOString(); save(); } res.json({ ok: true }); });
app.post(A + '/users/:id/ban', auth, adm, (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (u && u.role !== 'admin') { u.banned = !u.banned; save(); } res.json({ ok: true }); });
app.delete(A + '/users/:id', auth, adm, (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (u && u.role !== 'admin') { sessions[u.id]?.sock?.end?.(); fs.rmSync(path.join(DIR, 'sessions', u.id), { recursive: true, force: true }); db.users = db.users.filter(x => x.id !== u.id); save(); } res.json({ ok: true }); });
app.get(A + '/requests', auth, adm, (req, res) => res.json(db.requests.slice().reverse()));
app.post(A + '/requests/:id/reject', auth, adm, (req, res) => { const r = db.requests.find(r => r.id === req.params.id); if (r) r.status = 'rejected'; save(); res.json({ ok: true }); });
app.post(A + '/plans', auth, adm, wrap(async (req, res) => { db.plans = (req.body.plans || []).map(p => ({ id: p.id || id(), name: String(p.name), price: String(p.price), days: +p.days || 30, daily: +p.daily || 100 })); save(); res.json(db.plans); }));

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
  db.users.forEach(u => fs.existsSync(path.join(DIR, 'sessions', u.id)) && startWA(u.id).catch(() => {}));
});
