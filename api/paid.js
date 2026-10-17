// POST /api/paid — mijoz "to‘lov qildim" deb xabar beradi (tasdiqlashni do‘kon egasi qiladi)
const { cmd, body, notify } = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Faqat POST.' });
  try {
    const b = body(req), id = String(b.id || ''), last4 = String(b.last4 || '');
    if (!/^A\d{6}$/.test(id)) return res.status(400).json({ error: 'Buyurtma raqami noto‘g‘ri.' });
    if (last4 && !/^\d{4}$/.test(last4)) return res.status(400).json({ error: 'Karta oxirgi 4 raqamini kiriting.' });
    let known = false;
    try {
      const r = await cmd(['GET', 'order:' + id]);
      if (r.result) { known = true; const o = JSON.parse(r.result); o.status = 'paid_reported'; o.last4 = last4; await cmd(['SET', 'order:' + id, JSON.stringify(o), 'EX', 60 * 60 * 24 * 90]); }
    } catch {}
    const sent = await notify(`To‘lov qilinganini aytdi: ${id}${last4 ? ' (jo‘natuvchi karta: ••' + last4 + ')' : ''}\nBank ilovasida tushumni tekshirib tasdiqlang.`);
    if (!known && !sent) return res.status(503).json({ error: 'Server sozlanmagan.' });
    res.status(200).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server xatosi.' }); }
};
