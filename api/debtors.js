// Qarzdorlar daftari (faqat do‘kon egasi uchun, parol bilan himoyalangan)
// GET /api/debtors | POST (yangi) | PATCH {id, action:"pay"|"add", amount} | DELETE {id}
const crypto = require('crypto');
const { cmd, body } = require('./_lib');
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const wait = ms => new Promise(r => setTimeout(r, ms));

const hex = s => crypto.createHash('sha256').update('bz|' + String(s)).digest('hex');

// Parol: avval Vercel'dagi ADMIN_PASSWORD, bo‘lmasa — birinchi kirishda o‘zingiz o‘rnatgan parol (bazada, shifrlangan holda)
async function check(req) {
  const key = String(req.headers['x-admin-key'] || '');
  const env = process.env.ADMIN_PASSWORD;
  if (env) return crypto.timingSafeEqual(sha(key), sha(env)) ? 'ok' : 'bad';
  const r = await cmd(['GET', 'admin:pw']);
  if (r.unavailable) return 'nodb';
  if (!r.result) return 'setup';
  return crypto.timingSafeEqual(Buffer.from(hex(key)), Buffer.from(String(r.result))) ? 'ok' : 'bad';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Birinchi marta parol o‘rnatish
    if (!process.env.ADMIN_PASSWORD && req.method === 'POST') {
      const sb = body(req);
      if (sb.action === 'setup') {
        const pw = String(sb.password || '');
        if (pw.length < 4 || pw.length > 100) return res.status(400).json({ error: 'Parol kamida 4 belgidan iborat bo‘lsin.' });
        const r = await cmd(['SET', 'admin:pw', hex(pw), 'NX']);
        if (r.unavailable) return res.status(503).json({ error: 'Ma’lumotlar bazasi ulanmagan (Vercel > Storage > Upstash Redis).' });
        if (!r.result) return res.status(409).json({ error: 'Parol allaqachon o‘rnatilgan.' });
        return res.status(200).json({ ok: true });
      }
    }
    const st = await check(req);
    if (st === 'nodb') return res.status(503).json({ error: 'Ma’lumotlar bazasi ulanmagan (Vercel > Storage > Upstash Redis).' });
    if (st === 'setup') return res.status(409).json({ setup: true, error: 'Parol hali o‘rnatilmagan.' });
    if (st !== 'ok') { await wait(600); return res.status(401).json({ error: 'Parol noto‘g‘ri.' }); }
  } catch (e) { return res.status(500).json({ error: 'Server xatosi.' }); }
  try {
    if (req.method === 'GET') {
      const r = await cmd(['HGETALL', 'debtors']);
      if (r.unavailable) return res.status(503).json({ error: 'Ma’lumotlar bazasi ulanmagan.' });
      const a = r.result || [], list = [];
      for (let i = 1; i < a.length; i += 2) { try { list.push(JSON.parse(a[i])); } catch {} }
      return res.status(200).json(list);
    }
    const b = body(req);
    if (req.method === 'POST') {
      const name = String(b.name || '').trim().slice(0, 60);
      let phone = String(b.phone || '').replace(/\D/g, ''); if (phone.length === 9) phone = '998' + phone;
      const amount = Math.round(+b.amount);
      if (name.length < 2) return res.status(400).json({ error: 'Ismni kiriting.' });
      if (!/^998\d{9}$/.test(phone)) return res.status(400).json({ error: 'Telefon raqami noto‘g‘ri.' });
      if (!(amount > 0 && amount <= 1e12)) return res.status(400).json({ error: 'Summa noto‘g‘ri.' });
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const d = { id, name, phone, balance: amount, note: String(b.note || '').trim().slice(0, 120), created: new Date().toISOString(), history: [{ at: new Date().toISOString(), delta: amount }] };
      const r = await cmd(['HSET', 'debtors', id, JSON.stringify(d)]);
      if (r.unavailable) return res.status(503).json({ error: 'Ma’lumotlar bazasi ulanmagan.' });
      return res.status(200).json(d);
    }
    const id = String(b.id || '');
    if (!/^[a-z0-9]{6,30}$/.test(id)) return res.status(400).json({ error: 'ID noto‘g‘ri.' });
    if (req.method === 'DELETE') { await cmd(['HDEL', 'debtors', id]); return res.status(200).json({ ok: true }); }
    if (req.method === 'PATCH') {
      if (!['pay', 'add', 'paid'].includes(b.action)) return res.status(400).json({ error: 'So‘rov noto‘g‘ri.' });
      const amount = Math.round(+b.amount);
      if (b.action !== 'paid' && !(amount > 0 && amount <= 1e12)) return res.status(400).json({ error: 'Summa noto‘g‘ri.' });
      const g = await cmd(['HGET', 'debtors', id]);
      if (!g.result) return res.status(404).json({ error: 'Topilmadi.' });
      const d = JSON.parse(g.result), now = new Date().toISOString();
      // "paid" — butun qarzni to‘lagan deb belgilash
      const delta = b.action === 'paid' ? -d.balance : b.action === 'pay' ? -amount : amount;
      d.balance = Math.max(0, d.balance + delta);
      if (d.balance === 0) d.paidAt = now; else delete d.paidAt;
      if (delta !== 0) d.history = (d.history || []).concat({ at: now, delta }).slice(-30);
      await cmd(['HSET', 'debtors', id, JSON.stringify(d)]);
      return res.status(200).json(d);
    }
    res.status(405).json({ error: 'Metod qo‘llab-quvvatlanmaydi.' });
  } catch (e) { res.status(500).json({ error: 'Server xatosi.' }); }
};
