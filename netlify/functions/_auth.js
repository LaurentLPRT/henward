// Utilitaires partagés (le préfixe _ évite que Netlify le traite comme une fonction publique)
const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest('base64url');

// Comparaison à temps constant (évite de deviner un mot de passe par le temps de réponse)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeToken(secret, ttlSeconds) {
  const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return payload + '.' + sign(payload, secret);
}

function checkToken(token, secret) {
  if (!token || !secret || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!safeEqual(sig, sign(payload, secret))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  } catch (e) { return false; }
}

module.exports = { makeToken, checkToken, safeEqual };
