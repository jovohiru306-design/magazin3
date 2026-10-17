// Yordamchi funksiyalar: Redis (Upstash REST), JSON body, Telegram xabarnoma
async function cmd(args) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return { unavailable: true };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'Redis xatosi');
  return { result: j.result };
}
const body = req => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
async function notify(text) {
  const T = process.env.TELEGRAM_BOT_TOKEN, C = process.env.TELEGRAM_CHAT_ID;
  if (!T || !C) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: C, text }) });
    return r.ok;
  } catch { return false; }
}
module.exports = { cmd, body, notify };
