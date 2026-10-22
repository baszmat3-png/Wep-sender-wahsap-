const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), QR = require('qrcode'), pino = require('pino');
let _bz; const baileys = async () => { if (!_bz) { const m = require('@whiskeysockets/baileys'); _bz = { ...m, default: m.default?.default || m.default || m.makeWASocket }; } return _bz; };   // تحميل كسول: فشل المكتبة لا يوقف الخادم
process.on('uncaughtException', e => console.error('uncaughtException:', e));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));

let DIR = process.env.DATA_DIR || __dirname;           // على Render اربطه بـ Persistent Disk
try { fs.mkdirSync(DIR, { recursive: true }); fs.accessSync(DIR, fs.constants.W_OK); }
catch (e) { console.error('DATA_DIR غير قابل للكتابة (' + DIR + ') — سيتم استخدام مجلد المشروع. أضف Disk على Render:', e.message); DIR = __dirname; }
const DB_FILE = path.join(DIR, 'data.json');
const SECRET = process.env.JWT_SECRET || 'change-me-in-render-env';
const TRIAL_DAYS = +process.env.TRIAL_DAYS || 2, TRIAL_MSGS = +process.env.TRIAL_MSGS || 30;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase(), SUPPORT_WA = process.env.SUPPORT_WA || '';
const DAY = 864e5, LOG_DAYS = 3;
let db = { users: [], logs: [], templates: [], contacts: [], campaigns: [], requests: [], sessions: [], autoreplies: [], txns: [], plans: [
  { id: 'basic', name: 'الأساسية', price: '15,000 د.ع', days: 30, daily: 300, sessions: 1 },
  { id: 'pro', name: 'الاحترافية', price: '37,500 د.ع', days: 30, daily: 1500, sessions: 3 },
  { id: 'biz', name: 'الأعمال', price: '90,000 د.ع', days: 30, daily: 10000, sessions: 10 }] };
for (const f of [DB_FILE, DB_FILE + '.tmp']) { try { db = { ...db, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; break; } catch {} }
for (const p of db.plans) if (/\$/.test(String(p.price))) p.price = (Math.round(parseFloat(String(p.price).replace(/[^\d.]/g, '')) * 1500 / 500) * 500).toLocaleString('en-US') + ' د.ع';   // ترحيل الأسعار من الدولار إلى الدينار
/* تخزين دائم اختياري في PostgreSQL (DATABASE_URL) — يحفظ كل البيانات كمستند واحد */
const PG_URL = process.env.DATABASE_URL || '';
let pool = null;
if (PG_URL) { const { Pool } = require('pg'); pool = new Pool({ connectionString: PG_URL, ssl: /localhost|127\.0\.0\.1/.test(PG_URL) ? false : { rejectUnauthorized: false }, max: 3 }); pool.on('error', e => console.error('pg:', e.message)); }
const pgLoad = async () => { if (!pool) return; await pool.query('CREATE TABLE IF NOT EXISTS kv (k text PRIMARY KEY, v jsonb NOT NULL, at timestamptz DEFAULT now())'); const r = await pool.query("SELECT v FROM kv WHERE k='db'"); if (r.rows[0]) db = { ...db, ...r.rows[0].v }; else if (db.users.length) await pgSave(); };
let pgBusy = Promise.resolve(); const pgSave = () => pgBusy = pgBusy.then(() => pool.query("INSERT INTO kv(k,v,at) VALUES('db',$1::jsonb,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()", [JSON.stringify(db)])).catch(e => console.error('pg save failed:', e.message));
let t; const flush = () => { clearTimeout(t); try { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); } catch (e) { console.error('save failed:', e.message); } if (pool) return pgSave(); };
const save = () => { clearTimeout(t); t = setTimeout(flush, 300); };
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { try { await flush(); } catch {} process.exit(0); });   // Render يرسل SIGTERM عند كل نشر: نحفظ فوراً
const PERSISTENT = DIR !== __dirname || !!pool;
const id = () => crypto.randomBytes(8).toString('hex');
const newKey = () => 'wps_' + crypto.randomBytes(20).toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const digits = n => String(n || '').replace(/\D/g, '');
// تطبيع الأرقام للعراق: 0770... أو 770... → 964770... ؛ الأرقام الدولية الصريحة (+ أو 00 أو 964) تبقى كما هي
const norm = n => { const raw = String(n || '').trim(); let d = digits(raw); if (!d) return ''; if (raw.startsWith('+')) return d; if (d.startsWith('00')) return d.slice(2); if (d.startsWith('964')) return d; if (d.startsWith('0')) return '964' + d.replace(/^0+/, ''); if (d.length === 10 && d[0] === '7') return '964' + d; return d; };
const otps = {};          // `${uid}:${phone}` -> {code, exp}
const wa = {};            // sessionId -> runtime {sock,status,qr,phone,starting,stopped,contacts}
const fatal = m => Object.assign(new Error(m), { fatal: true });

/* ---------- المستخدمون والاشتراكات ---------- */
const ownerOf = u => u.parent ? db.users.find(x => x.id === u.parent) : u;
const todayStr = () => new Date().toISOString().slice(0, 10), monthStr = () => new Date().toISOString().slice(0, 7);
const planOf = p => p && ({ ...p, sessions: p.sessions || ({ basic: 1, pro: 3, biz: 10 }[p.id] || 1) });
function subInfo(u) {
  const now = Date.now(), used = db.logs.filter(l => l.uid === u.id && l.ok && l.at.startsWith(todayStr())).length;
  if (u.banned) return { active: false, type: 'banned', name: 'موقوف', reason: 'الحساب موقوف' };
  if (u.role === 'admin') return { active: true, type: 'admin', name: 'مدير', used, limit: 1e9 };
  if (u.sub && new Date(u.sub.expires) > now) return { active: true, type: 'paid', name: db.plans.find(p => p.id === u.sub.plan)?.name || u.sub.plan, expires: u.sub.expires, used, limit: u.ovr?.daily > 0 ? u.ovr.daily : u.sub.daily, left: Math.ceil((new Date(u.sub.expires) - now) / DAY) };
  const ts = u.trialSent || 0, tl = new Date(u.trialEnds) > now;
  if (!u.sub && tl && ts < TRIAL_MSGS) return { active: true, type: 'trial', name: 'تجريبي', expires: u.trialEnds, used: ts, limit: TRIAL_MSGS, left: Math.ceil((new Date(u.trialEnds) - now) / DAY) };
  return { active: false, type: 'expired', name: 'منتهي', used: ts, limit: TRIAL_MSGS, reason: u.sub ? 'انتهى اشتراكك. جدّد الاشتراك للمتابعة' : (ts >= TRIAL_MSGS ? 'استهلكت رسائل الفترة التجريبية' : 'انتهت الفترة التجريبية') + '. فعّل اشتراكاً للمتابعة' };
}
function checkAccess(u) {
  const i = subInfo(u);
  if (!i.active) throw fatal(i.reason);
  if (i.type === 'paid' && i.used >= i.limit) throw fatal('تم تجاوز الحد اليومي لباقتك');
}
const maxSessions = o => { const i = subInfo(o); if (i.type === 'admin') return 50; if (o.ovr?.sessions > 0) return o.ovr.sessions; if (i.type === 'paid') return planOf(db.plans.find(p => p.id === o.sub.plan))?.sessions || 1; return 1; };
const maxContacts = o => { const i = subInfo(o); if (i.type === 'admin') return 1e6; if (o.ovr?.contacts > 0) return o.ovr.contacts; return i.type === 'paid' ? 20000 : 1000; };
/* الصلاحيات: مميزات الباقة + تجاوزات المدير لكل مشترك */
const FEATS = { api: 'الربط البرمجي (API)', otp: 'رموز التحقق OTP', campaigns: 'الحملات الجماعية', ai: 'الذكاء الاصطناعي', auto: 'الردود الآلية', extract: 'استخراج البيانات', subs: 'الحسابات الفرعية', webhook: 'Webhook' };
const allFeats = () => Object.fromEntries(Object.keys(FEATS).map(k => [k, true]));
const permsOf = o => { if (o.role === 'admin') return allFeats(); const i = subInfo(o); const p = i.type === 'paid' ? db.plans.find(p => p.id === o.sub.plan) : null; return { ...allFeats(), ...(p?.features || {}), ...(o.perms || {}) }; };
const can = (o, f) => !!permsOf(o)[f];
const need = f => (req, res, next) => can(req.owner, f) ? next() : res.status(403).json({ error: 'هذه الميزة غير متاحة في باقتك: ' + FEATS[f] });
const usageOf = u => { const m = monthStr(); if (!u.usage || u.usage.m !== m) u.usage = { m, msgs: 0, otp: 0 }; return u.usage; };

/* ---------- الذكاء الاصطناعي (OpenRouter) ---------- */
async function aiChat(ai, messages, temperature = 0.7) {
  if (!ai?.key) throw new Error('أدخل مفتاح OpenRouter في الإعدادات أولاً');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + ai.key, 'Content-Type': 'application/json', 'X-Title': 'WP Sender' },
    body: JSON.stringify({ model: ai.model || 'meta-llama/llama-3.1-8b-instruct:free', messages, temperature }), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || 'فشل الاتصال بالذكاء الاصطناعي (' + r.status + ')');
  const txt = (j.choices?.[0]?.message?.content || '').trim();
  if (!txt) throw new Error('رد فارغ من النموذج');
  return txt;
}
const aiRewrite = (o, text, strength = 50) => aiChat(o.ai, [
  { role: 'system', content: 'أنت مساعد يعيد صياغة رسائل واتساب لتجنب تشابه الرسائل. حافظ على نفس المعنى واللغة وأي روابط أو أرقام أو أسماء. قوة التغيير: ' + strength + '% (0 تغيير طفيف جداً، 100 إعادة صياغة كاملة). أعد النص المعاد صياغته فقط بدون أي شرح أو علامات اقتباس.' },
  { role: 'user', content: text }], 0.4 + strength / 150);

/* ---------- WhatsApp (Baileys) ---------- */
const wr = sid => (wa[sid] ||= { status: 'idle', qr: null, sock: null, phone: null, contacts: new Map() });
const lastReply = {}, convo = {};
function fireWebhook(o, payload) {
  const w = o.webhook; if (!w?.url || !can(o, 'webhook')) return;
  fetch(w.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': w.secret || '' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) }).catch(() => {});
}
async function onIncoming(rec, sock, m) {
  const jid = m.key?.remoteJid; if (!jid || m.key.fromMe || !m.message || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast')) return;
  const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || '';
  const o = db.users.find(u => u.id === rec.uid); if (!o) return;
  const phone = digits((m.key.remoteJidAlt || jid).split('@')[0].split(':')[0]);
  fireWebhook(o, { event: 'message', session: rec.id, from: phone, name: m.pushName || '', text, at: new Date().toISOString() });
  if (!text.trim()) return;
  const now = Date.now(); if (now - (lastReply[jid] || 0) < 3000) return; lastReply[jid] = now;
  let reply = null;
  const low = text.trim().toLowerCase();
  for (const r of can(o, 'auto') ? db.autoreplies : []) {
    if (r.uid !== o.id || !r.active || (r.sid && r.sid !== rec.id)) continue;
    if (r.keywords.some(k => r.match === 'exact' ? low === k.toLowerCase() : low.includes(k.toLowerCase()))) { reply = r.reply.replace(/\{name\}/g, m.pushName || ''); break; }
  }
  if (!reply && o.bot?.enabled && o.ai?.key && can(o, 'ai') && (!o.bot.sid || o.bot.sid === rec.id)) {
    const h = (convo[jid] ||= []); h.push({ role: 'user', content: text }); if (h.length > 8) h.splice(0, h.length - 8);
    try { reply = await aiChat(o.ai, [{ role: 'system', content: o.bot.prompt || 'أنت مساعد خدمة عملاء ودود. أجب باختصار وبنفس لغة العميل.' }, ...h]); h.push({ role: 'assistant', content: reply }); }
    catch (e) { console.error('bot:', e.message); }
  }
  if (!reply) return;
  try { checkAccess(o); await sock.sendMessage(jid, { text: reply }); logSend(o, o, rec, phone, reply, 'auto', true); } catch (e) { console.error('auto reply:', e.message); }
}
async function startWA(sid) {
  const rec = db.sessions.find(s => s.id === sid); if (!rec) throw new Error('الجلسة غير موجودة');
  const s = wr(sid);
  if (s.sock || s.starting) return;
  s.starting = true; s.stopped = false;
  try {
    const dir = path.join(DIR, 'sessions', sid);
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = await baileys();
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    let version; try { ({ version } = await fetchLatestBaileysVersion()); } catch {}
    const sock = makeWASocket({ ...(version ? { version } : {}), auth: state, logger: pino({ level: 'silent' }), browser: ['WP Sender', 'Chrome', '1.0'], syncFullHistory: false });
    s.sock = sock; s.status = 'connecting';
    sock.ev.on('creds.update', saveCreds);
    const addC = list => (list || []).forEach(c => { if (c.id && c.id.endsWith('@s.whatsapp.net')) s.contacts.set(c.id, c.name || c.notify || c.verifiedName || s.contacts.get(c.id) || ''); });
    sock.ev.on('contacts.upsert', addC); sock.ev.on('contacts.update', addC);
    sock.ev.on('messaging-history.set', h => addC(h.contacts));
    sock.ev.on('messages.upsert', async ({ messages, type }) => { if (type !== 'notify') return; for (const m of messages) { try { await onIncoming(rec, sock, m); } catch (e) { console.error('incoming:', e.message); } } });
    sock.ev.on('connection.update', async u => {
      if (u.qr) { s.qr = await QR.toDataURL(u.qr); s.status = 'qr'; }
      if (u.connection === 'open') { s.status = 'connected'; s.qr = null; s.phone = sock.user.id.split(':')[0]; rec.phone = s.phone; save(); }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode, was = s.status === 'connected';
        s.sock = null; s.status = 'idle'; s.qr = null;
        if (s.stopped) return;
        if (code === DisconnectReason.loggedOut) { fs.rmSync(dir, { recursive: true, force: true }); s.phone = null; rec.phone = null; save(); notifyDown(rec, 'تم تسجيل الخروج من الجلسة'); }
        else { if (was) notifyDown(rec, 'انقطع اتصال الجلسة وجارٍ إعادة الاتصال'); setTimeout(() => startWA(sid).catch(() => {}), 3000); }
      }
    });
  } finally { s.starting = false; }
}
async function stopWA(sid, logout) {
  const s = wr(sid); s.stopped = true;
  if (s.sock) { try { logout ? await s.sock.logout() : s.sock.end(undefined); } catch {} }
  s.sock = null; s.status = 'idle'; s.qr = null; if (logout) s.phone = null;
}
function notifyDown(rec, msg) {
  const o = db.users.find(u => u.id === rec.uid); if (!o?.notifyPhone) return;
  const other = db.sessions.find(x => x.uid === o.id && x.id !== rec.id && wa[x.id]?.status === 'connected'); if (!other) return;
  wa[other.id].sock.sendMessage(norm(o.notifyPhone) + '@s.whatsapp.net', { text: `⚠️ WP Sender: ${msg} (${rec.name}${rec.phone ? ' • ' + rec.phone : ''})` }).catch(() => {});
}
function pickSession(o, sid) {
  const mine = db.sessions.filter(s => s.uid === o.id);
  let rec = sid && mine.find(s => s.id === sid);
  if (sid && !rec) throw fatal('الجلسة المحددة غير موجودة');
  if (rec && wa[rec.id]?.status !== 'connected') throw fatal('الجلسة المحددة غير متصلة');
  rec ||= mine.filter(s => wa[s.id]?.status === 'connected').sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))[0];
  if (!rec) throw fatal('واتساب غير مربوط. اربط رقماً عبر QR أولاً');
  return rec;
}
const jidOf = n => norm(n) + '@s.whatsapp.net';
function logSend(o, by, rec, to, text, type, ok, err) {
  const log = { id: id(), uid: o.id, by: by.id, sid: rec.id, sname: rec.name, to: norm(to), text, type, at: new Date().toISOString(), ok, err };
  db.logs.push(log); if (db.logs.length > 20000) db.logs.shift();
  if (ok) { rec.sent = (rec.sent || 0) + 1; rec.lastAt = log.at; if (subInfo(o).type === 'trial') o.trialSent = (o.trialSent || 0) + 1; } else rec.failed = (rec.failed || 0) + 1;
  save(); return log;
}
async function sendWA(o, by, to, text, { type = 'api', sid } = {}) {
  checkAccess(o);
  if (by.parent) {                       // حساب فرعي: حدود شهرية
    const u = usageOf(by), L = by.limits || {};
    if (by.disabled) throw fatal('الحساب الفرعي موقوف');
    if (type === 'otp' ? (L.otp > 0 && u.otp >= L.otp) : (L.msgs > 0 && u.msgs >= L.msgs)) throw fatal('تم تجاوز الحد الشهري للحساب الفرعي');
    if (type === 'otp' ? !(L.otp > 0) : !(L.msgs > 0)) throw fatal('هذه الميزة غير مسموحة لهذا الحساب الفرعي');
  }
  const rec = pickSession(o, sid), s = wa[rec.id];
  let ok = true, err; try { await s.sock.sendMessage(jidOf(to), { text }); } catch (e) { ok = false; err = e.message; }
  const log = logSend(o, by, rec, to, text, type, ok, err);
  if (ok && by.parent) { const u = usageOf(by); type === 'otp' ? u.otp++ : u.msgs++; }
  if (!ok) throw new Error(err);
  return log;
}

/* ---------- الحملات ---------- */
const running = new Set();
const pickMsg = c => c.messages[Math.floor(Math.random() * c.messages.length)];
const fill = (t, r) => t.replace(/\{name\}/g, r.name || '');
async function runCampaign(c) {
  if (running.has(c.id)) return; running.add(c.id);
  try {
    const o = db.users.find(u => u.id === c.uid), by = db.users.find(u => u.id === c.by) || o;
    while (c.status === 'running' && c.idx < c.recipients.length) {
      const r = c.recipients[c.idx]; let msg = fill(pickMsg(c), r);
      if (c.ai && o.ai?.key && can(o, 'ai')) { try { msg = await aiRewrite(o, msg, o.ai.strength ?? 50); } catch {} }
      try { await sendWA(o, by, r.phone, msg, { type: 'campaign', sid: c.sid }); c.sent++; }
      catch (e) { if (e.fatal) { c.status = 'paused'; c.err = e.message; save(); break; } c.failed++; c.err = e.message; }
      c.idx++; save();
      if (c.batch > 0 && c.idx % c.batch === 0 && c.idx < c.recipients.length) await sleep(c.batchPause * 1000);
      await sleep((c.delayMin + Math.random() * Math.max(0, c.delayMax - c.delayMin)) * 1000);
    }
    if (c.status === 'running') { c.status = 'done'; c.doneAt = new Date().toISOString(); }
    save();
  } catch (e) { console.error('campaign:', e); c.status = 'paused'; c.err = e.message; save(); }
  finally { running.delete(c.id); }
}
setInterval(() => { for (const c of db.campaigns) if (c.status === 'scheduled' && new Date(c.scheduledAt) <= Date.now()) { c.status = 'running'; save(); runCampaign(c); } }, 15000);
setInterval(() => { const lim = Date.now() - LOG_DAYS * DAY; const n = db.logs.length; db.logs = db.logs.filter(l => new Date(l.at).getTime() > lim); if (db.logs.length !== n) save(); }, 36e5);

/* ---------- Express ---------- */
const app = express();
app.use(express.json({ limit: '8mb' }));
app.get('/healthz', (req, res) => res.json({ ok: true, users: db.users.length, dir: DIR }));
app.get(['/admin', '/admin/', '/panel', '/dashboard'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public')));
const wrap = f => (req, res) => Promise.resolve(f(req, res)).catch(e => res.status(400).json({ error: e.message }));

const auth = (req, res, next) => {
  const ok = u => {
    if (!u) return false; req.user = u; req.owner = ownerOf(u); if (!req.owner) return false; return true;
  };
  const key = req.headers['x-api-key'];
  if (key) { if (ok(db.users.find(u => u.apiKey === key))) return chk(); return res.status(401).json({ error: 'مفتاح API غير صالح' }); }
  try { const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); if (!ok(db.users.find(u => u.id === p.id))) throw 0; return chk(); }
  catch { return res.status(401).json({ error: 'غير مصرح' }); }
  function chk() {
    if ((req.owner.banned && req.owner.role !== 'admin' && req.path !== '/api/me') || req.user.disabled) return res.status(403).json({ error: req.user.disabled ? 'الحساب الفرعي موقوف' : 'الحساب موقوف' });
    next();
  }
};
const mainOnly = (req, res, next) => req.user.parent ? res.status(403).json({ error: 'غير متاح للحسابات الفرعية' }) : next();
const apiGate = (req, res, next) => (!req.headers['x-api-key'] || can(req.owner, 'api')) ? next() : res.status(403).json({ error: 'الربط البرمجي (API) غير متاح في باقتك' });
const pub = u => { const o = ownerOf(u) || u; return { id: u.id, name: u.name, email: u.email, phone: u.phone || '', role: u.role, isSub: !!u.parent, apiKey: u.apiKey, wallet: u.parent ? 0 : Math.round(u.wallet || 0), sub: subInfo(o), perms: permsOf(o), limits: u.limits || null }; };
const tok = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '30d' });

app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body, phone = norm(req.body.phone);
  if (!name || !email || !password || password.length < 6) throw new Error('أكمل البيانات (كلمة المرور 6 أحرف على الأقل)');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('البريد الإلكتروني غير صالح');
  if (db.users.find(u => u.email === email.trim().toLowerCase())) throw new Error('البريد مسجل مسبقاً');
  const u = { id: id(), name: String(name).trim().slice(0, 80), email: email.trim().toLowerCase(), phone: phone ? '+' + phone : '', pass: await bcrypt.hash(password, 10), role: (ADMIN_EMAIL ? email.trim().toLowerCase() === ADMIN_EMAIL : !db.users.length) ? 'admin' : 'user', trialEnds: new Date(Date.now() + TRIAL_DAYS * DAY).toISOString(), trialSent: 0, apiKey: newKey(), at: new Date().toISOString(), wallet: 0 };
  db.users.push(u); save(); res.json({ token: tok(u), user: pub(u) });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const u = db.users.find(u => u.email === (req.body.email || '').trim().toLowerCase());
  if (!u || !(await bcrypt.compare(req.body.password || '', u.pass))) throw new Error('بيانات الدخول غير صحيحة');
  if (req.body.kind === 'sub' && !u.parent) throw new Error('هذا حساب رئيسي. اختر تبويب "الحساب الرئيسي"');
  if (req.body.kind === 'main' && u.parent) throw new Error('هذا حساب فرعي. اختر تبويب "حساب فرعي"');
  if (u.disabled) throw new Error('الحساب الفرعي موقوف');
  res.json({ token: tok(u), user: pub(u) });
}));
const resets = {};
app.post('/api/auth/forgot', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), u = db.users.find(x => x.email === email), msg = 'إذا كان الحساب موجوداً ومسجّلاً برقم هاتف فسيصله رمز عبر واتساب خلال لحظات. إن لم يصلك، تواصل مع الدعم.';
  if (resets[email] && Date.now() - resets[email].at < 60e3) throw new Error('انتظر دقيقة قبل طلب رمز جديد');
  if (u && u.phone) {
    resets[email] = { code: String(crypto.randomInt(100000, 999999)), exp: Date.now() + 10 * 60e3, tries: 0, at: Date.now() };
    let rec; for (const a of db.users.filter(x => x.role === 'admin')) { rec = db.sessions.find(s => s.uid === a.id && wa[s.id]?.status === 'connected'); if (rec) break; }
    if (rec) wa[rec.id].sock.sendMessage(jidOf(u.phone), { text: `🔐 رمز استعادة كلمة المرور: ${resets[email].code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.` }).catch(() => {});
  }
  res.json({ ok: true, message: msg });
}));
app.post('/api/auth/reset', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), r = resets[email], u = db.users.find(x => x.email === email);
  if (!r || !u || r.exp < Date.now()) throw new Error('الرمز غير صالح أو منتهي');
  if (++r.tries > 5) { delete resets[email]; throw new Error('محاولات كثيرة. اطلب رمزاً جديداً'); }
  if (String(req.body.code) !== r.code) throw new Error('الرمز غير صحيح');
  if (!req.body.password || req.body.password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
  u.pass = await bcrypt.hash(req.body.password, 10); delete resets[email]; save(); res.json({ token: tok(u), user: pub(u) });
}));
app.get('/api/me', auth, (req, res) => res.json(pub(req.user)));
app.post('/api/key/regen', auth, (req, res) => { req.user.apiKey = newKey(); save(); res.json({ apiKey: req.user.apiKey }); });
app.post('/api/me/password', auth, wrap(async (req, res) => {
  const { old, next } = req.body; if (!next || next.length < 6) throw new Error('كلمة المرور الجديدة 6 أحرف على الأقل');
  if (!(await bcrypt.compare(old || '', req.user.pass))) throw new Error('كلمة المرور الحالية غير صحيحة');
  req.user.pass = await bcrypt.hash(next, 10); save(); res.json({ ok: true });
}));

/* ---------- الإعدادات ---------- */
const mask = k => k ? '••••' + k.slice(-4) : '';
const BAN = { delayMin: 4, delayMax: 9, batch: 20, batchPause: 60 };
const badUrl = u => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return true; const h = x.hostname; return h === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.endsWith('.local') || h === '[::1]'; } catch { return true; } };
app.get('/api/settings', auth, (req, res) => {
  const u = req.user, o = req.owner;
  res.json({ name: u.name, email: u.email, phone: u.phone || '', notifyPhone: o.notifyPhone || '', ai: { provider: 'openrouter', model: o.ai?.model || '', strength: o.ai?.strength ?? 50, hasKey: !!o.ai?.key, keyMask: mask(o.ai?.key) }, ban: { ...BAN, ...(o.ban || {}) }, webhook: o.webhook || { url: '', secret: '' }, bot: { enabled: false, prompt: '', sid: '', ...(o.bot || {}) } });
});
app.post('/api/settings', auth, wrap(async (req, res) => {
  const b = req.body, u = req.user, o = req.owner, main = !u.parent;
  if (typeof b.name === 'string' && b.name.trim()) u.name = b.name.trim().slice(0, 80);
  if (typeof b.phone === 'string') u.phone = b.phone.slice(0, 30);
  if (main) {
    if (typeof b.notifyPhone === 'string') u.notifyPhone = b.notifyPhone.slice(0, 30);
    if (b.ai) { o.ai ||= {}; if (typeof b.ai.model === 'string') o.ai.model = b.ai.model.trim(); if (b.ai.strength != null) o.ai.strength = Math.min(100, Math.max(0, +b.ai.strength || 0)); if (b.ai.key && !String(b.ai.key).startsWith('••••')) o.ai.key = String(b.ai.key).trim(); }
    if (b.ban) { const x = b.ban; o.ban = { delayMin: Math.max(1, +x.delayMin || BAN.delayMin), delayMax: Math.max(+x.delayMin || 1, +x.delayMax || BAN.delayMax), batch: Math.max(0, +x.batch || 0), batchPause: Math.max(0, +x.batchPause || 0) }; }
    if (b.webhook) { if (!can(o, 'webhook')) throw new Error('Webhook غير متاح في باقتك'); const w = b.webhook; if (w.url && badUrl(w.url)) throw new Error('رابط Webhook غير صالح (يجب أن يكون http/https عاماً)'); o.webhook = { url: (w.url || '').trim(), secret: (w.secret || '').slice(0, 100) }; }
    if (b.bot && can(o, 'ai')) o.bot = { enabled: !!b.bot.enabled, prompt: String(b.bot.prompt || '').slice(0, 2000), sid: b.bot.sid || '' };
  }
  save(); res.json({ ok: true });
}));
app.post('/api/ai/test', auth, need('ai'), wrap(async (req, res) => { const t0 = Date.now(); const r = await aiChat(req.owner.ai, [{ role: 'user', content: 'قل: تم الاتصال' }], 0); res.json({ ok: true, reply: r.slice(0, 100), ms: Date.now() - t0 }); }));

/* ---------- الجلسات (واتساب) ---------- */
const sessView = r => { const s = wa[r.id] || {}; return { id: r.id, name: r.name, isDefault: !!r.isDefault, at: r.at, status: s.status || 'idle', qr: s.qr || null, phone: s.phone || r.phone || null, sent: r.sent || 0, failed: r.failed || 0, lastAt: r.lastAt || null }; };
const mySess = (req, sid) => { const r = db.sessions.find(s => s.id === sid && s.uid === req.owner.id); if (!r) throw new Error('الجلسة غير موجودة'); return r; };
app.get('/api/sessions', auth, (req, res) => res.json({ max: maxSessions(req.owner), items: db.sessions.filter(s => s.uid === req.owner.id).map(sessView) }));
app.post('/api/sessions', auth, mainOnly, wrap(async (req, res) => {
  const mine = db.sessions.filter(s => s.uid === req.owner.id);
  if (mine.length >= maxSessions(req.owner)) throw new Error('وصلت للحد الأقصى للجلسات في باقتك (' + maxSessions(req.owner) + ')');
  const r = { id: id(), uid: req.owner.id, name: String(req.body.name || '').trim().slice(0, 40) || 'جلسة ' + (mine.length + 1), isDefault: !mine.length, at: new Date().toISOString(), sent: 0, failed: 0 };
  db.sessions.push(r); save(); startWA(r.id).catch(e => console.error('startWA:', e.message)); res.json(sessView(r));
}));
app.post('/api/sessions/:sid/connect', auth, mainOnly, wrap(async (req, res) => { const r = mySess(req, req.params.sid); startWA(r.id).catch(e => console.error('startWA:', e.message)); await sleep(300); res.json(sessView(r)); }));
app.post('/api/sessions/:sid/stop', auth, mainOnly, wrap(async (req, res) => { const r = mySess(req, req.params.sid); await stopWA(r.id, false); res.json(sessView(r)); }));
app.post('/api/sessions/:sid/logout', auth, mainOnly, wrap(async (req, res) => { const r = mySess(req, req.params.sid); await stopWA(r.id, true); fs.rmSync(path.join(DIR, 'sessions', r.id), { recursive: true, force: true }); r.phone = null; save(); res.json(sessView(r)); }));
app.post('/api/sessions/:sid/default', auth, mainOnly, wrap(async (req, res) => { const r = mySess(req, req.params.sid); db.sessions.forEach(s => s.uid === r.uid && (s.isDefault = s.id === r.id)); save(); res.json({ ok: true }); }));
app.post('/api/sessions/:sid/rename', auth, mainOnly, wrap(async (req, res) => { const r = mySess(req, req.params.sid); r.name = String(req.body.name || '').trim().slice(0, 40) || r.name; save(); res.json({ ok: true }); }));
app.delete('/api/sessions/:sid', auth, mainOnly, wrap(async (req, res) => {
  const r = mySess(req, req.params.sid); await stopWA(r.id, true); fs.rmSync(path.join(DIR, 'sessions', r.id), { recursive: true, force: true });
  db.sessions = db.sessions.filter(s => s.id !== r.id); delete wa[r.id];
  if (r.isDefault) { const n = db.sessions.find(s => s.uid === r.uid); if (n) n.isDefault = true; }
  save(); res.json({ ok: true });
}));

/* ---------- الإرسال ---------- */
app.post(['/api/send', '/api/messages/send'], auth, apiGate, wrap(async (req, res) => {
  const to = req.body.to || req.body.phone || req.body.number, message = req.body.message || req.body.text; if (!to || !message) throw new Error('to (أو phone) و message مطلوبان');
  const l = await sendWA(req.owner, req.user, to, message, { sid: req.body.session }); res.json({ success: true, id: l.id });
}));
app.post('/api/otp/send', auth, need('otp'), apiGate, wrap(async (req, res) => {
  const to = req.body.to || req.body.phone, { message } = req.body; if (!to) throw new Error('to مطلوب');
  const code = String(crypto.randomInt(100000, 999999));
  const tpl = message || (db.templates.find(t => t.uid === req.owner.id && t.isDefault)?.body) || 'رمز التحقق الخاص بك: {OTP} هذا الرمز سينتهي خلال 5 دقائق.';
  if (!tpl.includes('{OTP}')) throw new Error('يجب أن تتضمن الرسالة {OTP}');
  otps[req.owner.id + ':' + norm(to)] = { code, exp: Date.now() + 5 * 60e3 };
  await sendWA(req.owner, req.user, to, tpl.replace(/\{OTP\}/g, code), { type: 'otp', sid: req.body.session }); res.json({ success: true, expires_in: 300 });
}));
app.post('/api/otp/verify', auth, need('otp'), apiGate, (req, res) => {
  const k = req.owner.id + ':' + norm(req.body.to || req.body.phone || req.body.number), o = otps[k];
  if (!o || o.exp < Date.now()) return res.json({ valid: false, reason: 'expired' });
  if (o.code !== String(req.body.code)) return res.json({ valid: false, reason: 'wrong_code' });
  delete otps[k]; res.json({ valid: true });
});
app.get('/api/otp/template', auth, (req, res) => res.json({ body: db.templates.find(t => t.uid === req.owner.id && t.isDefault)?.body || '' }));
app.post('/api/otp/template', auth, mainOnly, wrap(async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 500);
  db.templates = db.templates.filter(t => t.uid !== req.owner.id);
  if (body) { if (!body.includes('{OTP}')) throw new Error('يجب أن يتضمن القالب {OTP}'); db.templates.push({ id: id(), uid: req.owner.id, name: 'default', body, isDefault: true }); }
  save(); res.json({ ok: true });
}));

/* ---------- جهات الاتصال ---------- */
app.get('/api/contacts', auth, (req, res) => res.json({ max: maxContacts(req.owner), items: db.contacts.filter(x => x.uid === req.owner.id) }));
app.post('/api/contacts', auth, wrap(async (req, res) => {
  const items = (Array.isArray(req.body.items) ? req.body.items : [req.body]).map(x => ({ name: String(x.name || '').slice(0, 80), phone: norm(x.phone), group: String(x.group || '').slice(0, 60) })).filter(x => x.phone.length > 7);
  if (!items.length) throw new Error('لا توجد أرقام صالحة');
  const mine = db.contacts.filter(c => c.uid === req.owner.id), have = new Set(mine.map(c => c.phone)), lim = maxContacts(req.owner);
  let added = 0, skipped = 0;
  for (const x of items) { if (have.has(x.phone)) { skipped++; continue; } if (mine.length + added >= lim) throw new Error('وصلت للحد الأقصى لجهات الاتصال (' + lim + ')' + (added ? ' — أُضيف ' + added : '')); db.contacts.push({ id: id(), uid: req.owner.id, ...x }); have.add(x.phone); added++; }
  save(); res.json({ added, skipped });
}));
app.delete('/api/contacts/:id', auth, (req, res) => { db.contacts = db.contacts.filter(x => !(x.id === req.params.id && x.uid === req.owner.id)); save(); res.json({ ok: true }); });
app.delete('/api/contacts', auth, (req, res) => { db.contacts = db.contacts.filter(x => x.uid !== req.owner.id); save(); res.json({ ok: true }); });

/* ---------- الحملات ---------- */
const campView = c => { const { recipients, messages, ...r } = c; return { ...r, total: recipients.length, msgCount: messages.length }; };
app.post('/api/campaigns', auth, need('campaigns'), wrap(async (req, res) => {
  const b = req.body, o = req.owner, bs = { ...BAN, ...(o.ban || {}) };
  const messages = (Array.isArray(b.messages) ? b.messages : [b.message]).map(m => String(m || '').trim()).filter(Boolean).slice(0, 50);
  const seen = new Set(), recipients = [];
  for (const r of (b.recipients || (b.numbers || []).map(n => ({ phone: n })))) { const p = norm(r.phone); if (p.length > 7 && !seen.has(p)) { seen.add(p); recipients.push({ phone: p, name: String(r.name || '').slice(0, 80) }); } }
  if (!messages.length || !recipients.length) throw new Error('الرسالة والأرقام مطلوبة');
  if (b.session) pickSession(o, b.session); else checkAccess(o);
  const sched = b.scheduledAt ? new Date(b.scheduledAt) : null; if (sched && isNaN(sched)) throw new Error('وقت الجدولة غير صالح');
  const c = { id: id(), uid: o.id, by: req.user.id, name: String(b.name || 'حملة').slice(0, 60), messages, recipients, sid: b.session || '', ai: !!b.ai, delayMin: Math.max(1, +b.delayMin || bs.delayMin), delayMax: Math.max(+b.delayMin || bs.delayMin, +b.delayMax || bs.delayMax), batch: +b.batch >= 0 && b.batch != null ? +b.batch : bs.batch, batchPause: +b.batchPause >= 0 && b.batchPause != null ? +b.batchPause : bs.batchPause,
    idx: 0, sent: 0, failed: 0, status: sched && sched > Date.now() ? 'scheduled' : 'running', scheduledAt: sched ? sched.toISOString() : null, at: new Date().toISOString() };
  db.campaigns.push(c); save(); if (c.status === 'running') runCampaign(c); res.json(campView(c));
}));
app.get('/api/campaigns', auth, (req, res) => res.json(db.campaigns.filter(c => c.uid === req.owner.id).map(campView).reverse()));
const myCamp = req => { const c = db.campaigns.find(c => c.id === req.params.id && c.uid === req.owner.id); if (!c) throw new Error('الحملة غير موجودة'); return c; };
app.post('/api/campaigns/:id/pause', auth, wrap(async (req, res) => { const c = myCamp(req); if (c.status === 'running' || c.status === 'scheduled') c.status = 'paused'; save(); res.json(campView(c)); }));
app.post('/api/campaigns/:id/resume', auth, wrap(async (req, res) => { const c = myCamp(req); if (c.status === 'paused') { c.status = 'running'; c.err = ''; save(); runCampaign(c); } res.json(campView(c)); }));
app.post('/api/campaigns/:id/cancel', auth, wrap(async (req, res) => { const c = myCamp(req); if (['running', 'paused', 'scheduled'].includes(c.status)) c.status = 'cancelled'; save(); res.json(campView(c)); }));
app.delete('/api/campaigns/:id', auth, wrap(async (req, res) => { const c = myCamp(req); if (c.status === 'running') throw new Error('أوقف الحملة أولاً'); db.campaigns = db.campaigns.filter(x => x !== c); save(); res.json({ ok: true }); }));

/* ---------- السجلات والإحصائيات ---------- */
app.get('/api/logs', auth, (req, res) => {
  const { kind = 'msg', status = '', type = '', q = '' } = req.query, ql = String(q).toLowerCase();
  const all = db.logs.filter(l => l.uid === req.owner.id && (!req.user.parent || l.by === req.user.id));
  const f = all.filter(l => (kind === 'otp') === (l.type === 'otp') && (!status || (status === 'ok') === l.ok) && (!type || l.type === type) && (!ql || [l.to, l.sname, l.text].some(x => String(x || '').toLowerCase().includes(ql))));
  res.json({ counts: { msg: all.filter(l => l.type !== 'otp').length, otp: all.filter(l => l.type === 'otp').length }, items: f.slice(-300).reverse() });
});
app.get('/api/stats', auth, (req, res) => {
  const o = req.owner, L = db.logs.filter(l => l.uid === o.id), S = db.sessions.filter(s => s.uid === o.id), today = todayStr();
  res.json({ total: S.reduce((a, s) => a + (s.sent || 0) + (s.failed || 0), 0), today: L.filter(l => l.ok && l.at.startsWith(today)).length, failed: S.reduce((a, s) => a + (s.failed || 0), 0), otp: L.filter(l => l.type === 'otp').length, contacts: db.contacts.filter(c => c.uid === o.id).length, sessions: S.length, connected: S.filter(s => wa[s.id]?.status === 'connected').length, sub: subInfo(o) });
});

/* ---------- استخراج البيانات ---------- */
const liveSock = (req, sid) => { const r = mySess(req, sid), s = wa[r.id]; if (!s?.sock || s.status !== 'connected') throw new Error('الجلسة غير متصلة'); return s; };
app.get('/api/extract/:sid/groups', auth, need('extract'), wrap(async (req, res) => {
  const s = liveSock(req, req.params.sid), g = await s.sock.groupFetchAllParticipating();
  res.json(Object.values(g).map(x => ({ id: x.id, name: x.subject || '', size: x.participants?.length || 0, members: (x.participants || []).map(p => { const j = p.phoneNumber || p.id || ''; return { id: j, phone: /@s\.whatsapp\.net$/.test(j) ? digits(j.split('@')[0]) : '', admin: !!p.admin }; }) })));
}));
app.get('/api/extract/:sid/contacts', auth, need('extract'), wrap(async (req, res) => { const s = liveSock(req, req.params.sid); res.json([...s.contacts].map(([j, n]) => ({ phone: digits(j.split('@')[0]), name: n }))); }));
app.post('/api/extract/convert', auth, need('extract'), wrap(async (req, res) => {
  const s = req.body.sid ? liveSock(req, req.body.sid) : null;
  const out = (req.body.ids || []).slice(0, 5000).map(raw => {
    const j = String(raw).trim(); if (!j) return null;
    if (/@s\.whatsapp\.net$/.test(j) || /^\+?\d{6,}$/.test(j)) return { id: j, phone: digits(j.split('@')[0].split(':')[0]) };
    let p = null; try { const m = s?.sock?.signalRepository?.lidMapping; const r = m?.getPNForLID?.(j); if (typeof r === 'string') p = digits(r.split('@')[0].split(':')[0]); } catch {}
    return { id: j, phone: p };
  }).filter(Boolean);
  res.json(out);
}));

/* ---------- الردود الآلية ---------- */
app.get('/api/autoreplies', auth, (req, res) => res.json(db.autoreplies.filter(r => r.uid === req.owner.id)));
app.post('/api/autoreplies', auth, mainOnly, need('auto'), wrap(async (req, res) => {
  const keywords = String(req.body.keywords || '').split(/[,،\n]/).map(x => x.trim()).filter(Boolean), reply = String(req.body.reply || '').trim();
  if (!keywords.length || !reply) throw new Error('الكلمات المفتاحية والرد مطلوبان');
  const r = { id: id(), uid: req.owner.id, keywords, reply: reply.slice(0, 2000), match: req.body.match === 'exact' ? 'exact' : 'contains', sid: req.body.sid || '', active: true };
  db.autoreplies.push(r); save(); res.json(r);
}));
app.post('/api/autoreplies/:id/toggle', auth, mainOnly, (req, res) => { const r = db.autoreplies.find(r => r.id === req.params.id && r.uid === req.owner.id); if (r) { r.active = !r.active; save(); } res.json({ ok: true }); });
app.delete('/api/autoreplies/:id', auth, mainOnly, (req, res) => { db.autoreplies = db.autoreplies.filter(r => !(r.id === req.params.id && r.uid === req.owner.id)); save(); res.json({ ok: true }); });

/* ---------- الحسابات الفرعية ---------- */
const subView = u => { const x = usageOf(u); return { id: u.id, name: u.name, email: u.email, apiKey: u.apiKey, disabled: !!u.disabled, limits: u.limits || {}, usage: { msgs: x.msgs, otp: x.otp }, at: u.at }; };
app.get('/api/subs', auth, mainOnly, (req, res) => res.json(db.users.filter(u => u.parent === req.user.id).map(subView)));
app.post('/api/subs', auth, mainOnly, need('subs'), wrap(async (req, res) => {
  const { name, email, password, msgs, otp } = req.body;
  if (!name || !email || !password || password.length < 6) throw new Error('الاسم والبريد وكلمة مرور (6 أحرف) مطلوبة');
  if (db.users.find(u => u.email === email.toLowerCase())) throw new Error('البريد مسجل مسبقاً');
  if (db.users.filter(u => u.parent === req.user.id).length >= 50) throw new Error('الحد الأقصى 50 حساباً فرعياً');
  const u = { id: id(), name: String(name).slice(0, 80), email: email.toLowerCase(), pass: await bcrypt.hash(password, 10), role: 'sub', parent: req.user.id, limits: { msgs: Math.max(0, +msgs || 0), otp: Math.max(0, +otp || 0) }, apiKey: newKey(), at: new Date().toISOString() };
  db.users.push(u); save(); res.json(subView(u));
}));
const mySub = req => { const u = db.users.find(u => u.id === req.params.id && u.parent === req.user.id); if (!u) throw new Error('غير موجود'); return u; };
app.post('/api/subs/:id/toggle', auth, mainOnly, wrap(async (req, res) => { const u = mySub(req); u.disabled = !u.disabled; save(); res.json(subView(u)); }));
app.delete('/api/subs/:id', auth, mainOnly, wrap(async (req, res) => { const u = mySub(req); db.users = db.users.filter(x => x !== u); save(); res.json({ ok: true }); }));

/* ---------- الباقات والمحفظة ---------- */
app.get('/api/plans', (req, res) => res.json({ plans: db.plans.map(planOf), support: SUPPORT_WA, trial: { days: TRIAL_DAYS, msgs: TRIAL_MSGS } }));
app.post('/api/request', auth, mainOnly, (req, res) => { db.requests.push({ id: id(), uid: req.user.id, name: req.user.name, email: req.user.email, planId: req.body.planId, note: (req.body.note || '').slice(0, 300), status: 'pending', at: new Date().toISOString() }); save(); res.json({ ok: true }); });
const priceNum = p => parseFloat(String(p.price).replace(/[^\d.]/g, '')) || 0;   // الأسعار بالدينار العراقي
app.get('/api/wallet', auth, mainOnly, (req, res) => res.json({ balance: Math.round(req.user.wallet || 0), txns: db.txns.filter(x => x.uid === req.user.id).slice(-50).reverse(), pending: db.requests.filter(r => r.uid === req.user.id && r.status === 'pending' && String(r.planId).startsWith('wallet:')).length }));
app.post('/api/wallet/topup', auth, mainOnly, wrap(async (req, res) => {
  const amt = +req.body.amount; if (!(amt >= 1000 && amt <= 1e9)) throw new Error('أدخل مبلغاً صحيحاً (1,000 د.ع على الأقل)');
  db.requests.push({ id: id(), uid: req.user.id, name: req.user.name, email: req.user.email, planId: 'wallet:' + amt, note: String(req.body.note || '').slice(0, 300), status: 'pending', at: new Date().toISOString() }); save(); res.json({ ok: true });
}));
app.post('/api/wallet/buy', auth, mainOnly, wrap(async (req, res) => {
  const u = req.user, p = db.plans.find(p => p.id === req.body.planId); if (!p) throw new Error('الباقة غير موجودة');
  const yearly = req.body.period === 'yearly', cost = Math.round(priceNum(p) * (yearly ? 12 * 0.8 : 1)), days = p.days * (yearly ? 12 : 1);
  if (!cost) throw new Error('سعر الباقة غير محدد'); if ((u.wallet || 0) < cost) throw new Error('الرصيد غير كافٍ. تحتاج ' + cost.toLocaleString('en-US') + ' د.ع ورصيدك ' + Math.round(u.wallet || 0).toLocaleString('en-US') + ' د.ع');
  u.wallet = Math.round((u.wallet || 0) - cost); const base = u.sub && new Date(u.sub.expires) > Date.now() ? new Date(u.sub.expires).getTime() : Date.now();
  u.sub = { plan: p.id, daily: p.daily, expires: new Date(base + days * DAY).toISOString() };
  db.txns.push({ id: id(), uid: u.id, type: 'purchase', amount: -cost, note: p.name + (yearly ? ' (سنوي)' : ' (شهري)'), at: new Date().toISOString() }); save(); res.json(pub(u));
}));

/* ---------- لوحة الإدارة ---------- */
const adm = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'للمدير فقط' });
const A = '/api/admin', connected = () => Object.values(wa).filter(s => s.status === 'connected').length;
const userWa = uid => db.sessions.some(s => s.uid === uid && wa[s.id]?.status === 'connected') ? 'connected' : 'idle';
const mains = () => db.users.filter(u => !u.parent);
app.get(A + '/overview', auth, adm, (req, res) => { const t = todayStr(); res.json({ users: mains().length, paid: mains().filter(u => subInfo(u).type === 'paid').length, trial: mains().filter(u => subInfo(u).type === 'trial').length, expired: mains().filter(u => subInfo(u).type === 'expired').length, msgsToday: db.logs.filter(l => l.ok && l.at.startsWith(t)).length, msgsTotal: db.sessions.reduce((a, s) => a + (s.sent || 0) + (s.failed || 0), 0), pending: db.requests.filter(r => r.status === 'pending').length, online: connected(), persistent: PERSISTENT, sessions: db.sessions.length }); });
app.get(A + '/users', auth, adm, (req, res) => res.json(mains().map(u => ({ ...pub(u), banned: !!u.banned, at: u.at, wa: userWa(u.id), total: db.sessions.filter(s => s.uid === u.id).reduce((a, s) => a + (s.sent || 0) + (s.failed || 0), 0), userPerms: u.perms || {}, ovr: u.ovr || {}, nSessions: db.sessions.filter(s => s.uid === u.id).length, nContacts: db.contacts.filter(c => c.uid === u.id).length, nSubs: db.users.filter(x => x.parent === u.id).length, plan: u.sub?.plan || null })).reverse()));
app.get(A + '/feats', auth, adm, (req, res) => res.json(FEATS));
app.post(A + '/users/:id/activate', auth, adm, wrap(async (req, res) => {
  const u = db.users.find(u => u.id === req.params.id); if (!u) throw new Error('غير موجود');
  if (String(req.body.planId).startsWith('wallet:')) {          // شحن محفظة
    const amt = +String(req.body.planId).slice(7); if (!(amt > 0)) throw new Error('مبلغ غير صالح');
    u.wallet = Math.round((u.wallet || 0) + amt); db.txns.push({ id: id(), uid: u.id, type: 'topup', amount: amt, note: 'شحن بواسطة الإدارة', at: new Date().toISOString() });
    db.requests.forEach(r => r.uid === u.id && r.planId === req.body.planId && r.status === 'pending' && (r.status = 'done')); save(); return res.json(pub(u));
  }
  const p = db.plans.find(p => p.id === req.body.planId); if (!p) throw new Error('غير موجود');
  const days = +req.body.days || p.days, base = u.sub && new Date(u.sub.expires) > Date.now() ? new Date(u.sub.expires).getTime() : Date.now();
  u.sub = { plan: p.id, daily: p.daily, expires: new Date(base + days * DAY).toISOString() };
  db.requests.forEach(r => r.uid === u.id && r.status === 'pending' && !String(r.planId).startsWith('wallet:') && (r.status = 'done')); save(); res.json(pub(u));
}));
app.post(A + '/users/:id/credit', auth, adm, wrap(async (req, res) => { const u = db.users.find(u => u.id === req.params.id), amt = +req.body.amount; if (!u || !amt) throw new Error('بيانات غير صالحة'); u.wallet = Math.round((u.wallet || 0) + amt); db.txns.push({ id: id(), uid: u.id, type: amt > 0 ? 'topup' : 'adjust', amount: amt, note: 'تعديل من الإدارة', at: new Date().toISOString() }); save(); res.json(pub(u)); }));
app.post(A + '/users/:id/deactivate', auth, adm, (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (u) { u.sub = { plan: 'none', daily: 0, expires: new Date(0).toISOString() }; save(); } res.json({ ok: true }); });
app.post(A + '/users/:id/trial', auth, adm, (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (u) { u.sub = null; u.trialSent = 0; u.trialEnds = new Date(Date.now() + (+req.body.days || TRIAL_DAYS) * DAY).toISOString(); save(); } res.json({ ok: true }); });
app.post(A + '/users/:id/ban', auth, adm, (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (u && u.role !== 'admin') { u.banned = !u.banned; save(); } res.json({ ok: true }); });
app.delete(A + '/users/:id', auth, adm, wrap(async (req, res) => {
  const u = db.users.find(u => u.id === req.params.id);
  if (u && u.role !== 'admin') {
    for (const s of db.sessions.filter(s => s.uid === u.id)) { await stopWA(s.id, false); fs.rmSync(path.join(DIR, 'sessions', s.id), { recursive: true, force: true }); delete wa[s.id]; }
    db.sessions = db.sessions.filter(s => s.uid !== u.id); db.users = db.users.filter(x => x.id !== u.id && x.parent !== u.id);
    ['contacts', 'campaigns', 'autoreplies', 'templates'].forEach(k => db[k] = db[k].filter(x => x.uid !== u.id)); save();
  }
  res.json({ ok: true });
}));
app.get(A + '/requests', auth, adm, (req, res) => res.json(db.requests.slice().reverse()));
app.post(A + '/requests/:id/reject', auth, adm, (req, res) => { const r = db.requests.find(r => r.id === req.params.id); if (r) r.status = 'rejected'; save(); res.json({ ok: true }); });
app.post(A + '/plans', auth, adm, wrap(async (req, res) => {
  db.plans = (req.body.plans || []).map(p => ({ id: p.id || id(), name: String(p.name).slice(0, 40), price: String(p.price).slice(0, 30), days: +p.days || 30, daily: +p.daily || 100, sessions: +p.sessions || 1,
    features: Object.fromEntries(Object.keys(FEATS).map(k => [k, p.features ? p.features[k] !== false : true])) }));
  save(); res.json(db.plans.map(planOf));
}));
app.post(A + '/users', auth, adm, wrap(async (req, res) => {
  const { name, email, password, planId } = req.body, phone = norm(req.body.phone);
  if (!name || !email || !password || password.length < 6) throw new Error('الاسم والبريد وكلمة مرور (6 أحرف) مطلوبة');
  if (db.users.find(u => u.email === String(email).trim().toLowerCase())) throw new Error('البريد مسجل مسبقاً');
  const u = { id: id(), name: String(name).slice(0, 80), email: String(email).trim().toLowerCase(), phone: phone ? '+' + phone : '', pass: await bcrypt.hash(password, 10), role: req.body.role === 'admin' ? 'admin' : 'user', trialEnds: new Date(Date.now() + TRIAL_DAYS * DAY).toISOString(), trialSent: 0, apiKey: newKey(), at: new Date().toISOString(), wallet: 0 };
  const p = db.plans.find(p => p.id === planId); if (p) u.sub = { plan: p.id, daily: p.daily, expires: new Date(Date.now() + (+req.body.days || p.days) * DAY).toISOString() };
  db.users.push(u); save(); res.json(pub(u));
}));
app.post(A + '/users/:id/settings', auth, adm, wrap(async (req, res) => {
  const u = db.users.find(u => u.id === req.params.id && !u.parent); if (!u) throw new Error('غير موجود');
  const b = req.body;
  if (typeof b.name === 'string' && b.name.trim()) u.name = b.name.trim().slice(0, 80);
  if (typeof b.phone === 'string') { const p = norm(b.phone); u.phone = p ? '+' + p : ''; }
  if (b.perms) { u.perms = {}; for (const k of Object.keys(FEATS)) if (b.perms[k] === true || b.perms[k] === false) u.perms[k] = b.perms[k]; }
  if (b.ovr) u.ovr = { daily: Math.max(0, +b.ovr.daily || 0), sessions: Math.max(0, +b.ovr.sessions || 0), contacts: Math.max(0, +b.ovr.contacts || 0) };
  if (b.expires) { const d = new Date(b.expires); if (isNaN(d)) throw new Error('تاريخ غير صالح'); if (!u.sub) u.sub = { plan: b.plan || db.plans[0]?.id || 'none', daily: db.plans.find(p => p.id === b.plan)?.daily || 100, expires: d.toISOString() }; else u.sub.expires = d.toISOString(); }
  save(); res.json(pub(u));
}));
app.post(A + '/users/:id/password', auth, adm, wrap(async (req, res) => { const u = db.users.find(u => u.id === req.params.id); if (!u || !req.body.password || req.body.password.length < 6) throw new Error('كلمة مرور (6 أحرف على الأقل) مطلوبة'); u.pass = await bcrypt.hash(req.body.password, 10); save(); res.json({ ok: true }); }));
app.post(A + '/users/:id/role', auth, adm, wrap(async (req, res) => {
  const u = db.users.find(u => u.id === req.params.id && !u.parent); if (!u) throw new Error('غير موجود');
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (u.id === req.user.id && role !== 'admin') throw new Error('لا يمكنك إزالة صلاحية المدير عن نفسك');
  u.role = role; save(); res.json(pub(u));
}));
app.get(A + '/sessions', auth, adm, (req, res) => res.json(db.sessions.map(s => ({ ...sessView(s), owner: db.users.find(u => u.id === s.uid)?.email || '—' }))));
app.post(A + '/sessions/:sid/stop', auth, adm, wrap(async (req, res) => { const r = db.sessions.find(s => s.id === req.params.sid); if (!r) throw new Error('غير موجودة'); await stopWA(r.id, false); res.json({ ok: true }); }));

app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ error: err.status === 400 ? 'بيانات غير صالحة' : 'خطأ في الخادم: ' + err.message }); });

/* ---------- الإقلاع ---------- */
(async () => {
if (pool) { try { await pgLoad(); console.log('PostgreSQL ready, users:', db.users.length); } catch (e) { console.error('PostgreSQL load failed — التخزين في القاعدة معطّل لحماية البيانات:', e.message); pool = null; } }
for (const u of db.users) {   // ترحيل: جلسة قديمة بلا سجل
  if (!u.parent && !db.sessions.some(s => s.uid === u.id) && fs.existsSync(path.join(DIR, 'sessions', u.id))) db.sessions.push({ id: u.id, uid: u.id, name: 'الجلسة الرئيسية', isDefault: true, at: u.at, sent: 0, failed: 0 });
}
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('Server running');
  db.sessions.forEach(s => fs.existsSync(path.join(DIR, 'sessions', s.id)) && startWA(s.id).catch(e => console.error('startWA:', e.message)));
  db.campaigns.forEach(c => c.status === 'running' && runCampaign(c));
});
})();
