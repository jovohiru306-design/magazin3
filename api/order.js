// POST /api/order — buyurtma yaratish. Narx serverda qayta hisoblanadi.
const { cmd, body, notify } = require('./_lib');
const products = require('./_products');
const byId = Object.fromEntries(products.map(p => [p.id, p]));
const so = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Faqat POST.' });
  try {
    const b = body(req);
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) return res.status(400).json({ error: 'Savat bo‘sh.' });
    const lines = [];
    for (const it of b.items) {
      const p = byId[it.id], q = Math.floor(+it.qty);
      if (!p || !(q >= 1 && q <= 20)) return res.status(400).json({ error: 'Mahsulot ma’lumoti noto‘g‘ri.' });
      lines.push({ id: p.id, name: p.name, price: p.price, qty: q });
    }
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const c = b.customer || {};
    const name = String(c.name || '').trim(), address = String(c.address || '').trim();
    let phone = String(c.phone || '').replace(/\D/g, ''); if (phone.length === 9) phone = '998' + phone;
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Ismingizni kiriting.' });
    if (!/^998\d{9}$/.test(phone)) return res.status(400).json({ error: 'Telefon raqami noto‘g‘ri (masalan, 90 123 45 67).' });
    if (address.length < 5 || address.length > 200) return res.status(400).json({ error: 'Manzilni to‘liq kiriting.' });
    const pay = b.pay === 'card' ? 'card' : 'cash';
    const comment = String(c.comment || '').trim().slice(0, 200);

    const id = 'A' + String(Math.floor(100000 + Math.random() * 900000));
    const order = { id, lines, total, name, phone, address, comment, pay, status: 'new', at: new Date().toISOString() };
    let saved = false;
    try {
      const r = await cmd(['SET', 'order:' + id, JSON.stringify(order), 'EX', 60 * 60 * 24 * 90]);
      if (!r.unavailable) { saved = true; await cmd(['LPUSH', 'orders', id]); await cmd(['LTRIM', 'orders', 0, 499]); }
    } catch {}
    const text = `Yangi buyurtma ${id}\n${lines.map(l => `${l.name} × ${l.qty}`).join('\n')}\nJami: ${so(total)}\nTo‘lov: ${pay === 'card' ? 'kartaga o‘tkazma' : 'naqd'}\n${name}, +${phone}\n${address}${comment ? '\nIzoh: ' + comment : ''}`;
    const sent = await notify(text);
    if (!saved && !sent) return res.status(503).json({ error: 'Buyurtmani qabul qilib bo‘lmadi: server sozlanmagan.' });

    const number = process.env.SHOP_CARD_NUMBER || '';
    res.status(200).json({
      id, total, pay,
      card: pay === 'card' && number ? { number, holder: process.env.SHOP_CARD_HOLDER || '' } : null
    });
  } catch (e) { res.status(500).json({ error: 'Server xatosi.' }); }
};
