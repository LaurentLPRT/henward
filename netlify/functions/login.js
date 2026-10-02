// Vérifie identifiant + mot de passe CÔTÉ SERVEUR et renvoie un jeton temporaire.
// Variables Netlify requises : APP_USER, APP_PASSWORD, SESSION_SECRET
const { makeToken, safeEqual } = require('./_auth');

const TOKEN_TTL = 12 * 60 * 60; // 12 heures
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(obj),
});

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'méthode non autorisée' });

  const { APP_USER, APP_PASSWORD, SESSION_SECRET } = process.env;
  if (!APP_USER || !APP_PASSWORD || !SESSION_SECRET) {
    return json(500, { error: 'configuration serveur incomplète' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'requête invalide' }); }

  // Les deux comparaisons sont toujours faites (pas de sortie anticipée)
  const okUser = safeEqual(body.user || '', APP_USER);
  const okPass = safeEqual(body.password || '', APP_PASSWORD);

  if (okUser && okPass) return json(200, { token: makeToken(SESSION_SECRET, TOKEN_TTL) });

  await new Promise(r => setTimeout(r, 800)); // ralentit les essais en rafale
  return json(401, { error: 'identifiants incorrects' });
};
