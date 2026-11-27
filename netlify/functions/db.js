// Relais vers Supabase. La clé secrète reste ici (variables Netlify), jamais dans la page.
// Variables Netlify requises : SESSION_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY
// Appel : /.netlify/functions/db/<table>?<filtres PostgREST>   (tables autorisées : stocks, lists)
const { checkToken } = require('./_auth');

const ALLOWED_TABLES = ['stocks', 'lists'];
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(obj),
});

exports.handler = async function (event) {
  const { SESSION_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SESSION_SECRET || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return json(500, { error: 'configuration serveur incomplète' });
  }

  const h = event.headers || {};
  const token = h['x-henward-token'] || h['X-Henward-Token'];
  if (!checkToken(token, SESSION_SECRET)) return json(401, { error: 'non autorisé' });

  if (!ALLOWED_METHODS.includes(event.httpMethod)) return json(405, { error: 'méthode non autorisée' });

  // Table = segment après "/db/"
  const m = String(event.path || '').match(/\/db\/([a-z_]+)\/?$/);
  const table = m && m[1];
  if (!table || !ALLOWED_TABLES.includes(table)) return json(403, { error: 'table non autorisée' });

  const qs = event.rawQuery
    ? event.rawQuery
    : new URLSearchParams(event.queryStringParameters || {}).toString();
  const url = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + table + (qs ? '?' + qs : '');

  const headers = { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_SECRET_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + SUPABASE_SECRET_KEY; // ancienne clé service_role (JWT)
  const prefer = h['prefer'] || h['Prefer'];
  if (prefer) headers.Prefer = prefer;

  const opts = { method: event.httpMethod, headers };
  if (event.httpMethod === 'POST' || event.httpMethod === 'PATCH') {
    opts.body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
  }

  // Délai maximal vers Supabase + une ligne de journal par appel (méthode, table, code, durée)
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  opts.signal = ctl.signal;
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    clearTimeout(timer);
    console.log(JSON.stringify({ m: event.httpMethod, t: table, s: res.status, ms: Date.now() - t0 }));
    return { statusCode: res.status, headers: { 'Content-Type': res.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' }, body: text };
  } catch (e) {
    clearTimeout(timer);
    const timeout = !!(e && e.name === 'AbortError');
    console.log(JSON.stringify({ m: event.httpMethod, t: table, err: timeout ? 'timeout' : 'injoignable', ms: Date.now() - t0 }));
    return json(timeout ? 504 : 502, { error: timeout ? 'base de données trop lente' : 'base de données injoignable' });
  }
};
