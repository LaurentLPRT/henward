// ============================================================
// Henward — Fonction Netlify : quote.js
// Rôle : proxy serveur vers Yahoo Finance, sans CORS
// Endpoint : /.netlify/functions/quote?ticker=MC.PA
// ============================================================

exports.handler = async function (event) {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Pré-vol CORS (OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const ticker = (event.queryStringParameters?.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticker manquant' }) };
  }

  // URLs Yahoo Finance à essayer dans l'ordre
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,currency`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,currency`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`,
  ];

  const fetchOpts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com',
    },
  };

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) continue;
      const data = await res.json();

      // Format v7
      const v7 = data?.quoteResponse?.result?.[0];
      if (v7 && v7.regularMarketPrice) {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({
  price:    parseFloat(v7.regularMarketPrice.toFixed(4)),
  change:   v7.regularMarketPreviousClose != null ? parseFloat((v7.regularMarketPrice - v7.regularMarketPreviousClose).toFixed(4)) : null,
  changeP:  v7.regularMarketPreviousClose != null ? parseFloat(((v7.regularMarketPrice - v7.regularMarketPreviousClose) / v7.regularMarketPreviousClose * 100).toFixed(2)) : null,
  currency: v7.currency || null,
  source: 'v7',
          }),
        };
      }

      // Format v8
      const v8 = data?.chart?.result?.[0];
      if (v8) {
        const meta  = v8.meta;
        const price = parseFloat((meta.regularMarketPrice || meta.previousClose || 0).toFixed(4));
        if (price > 0) {
          const prev = meta.regularMarketPreviousClose || meta.chartPreviousClose || meta.previousClose || null;
          const change  = prev ? parseFloat((price - prev).toFixed(4)) : null;
          const changeP = prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : null;
          return {
            statusCode: 200, headers,
            body: JSON.stringify({ price, change, changeP, currency: meta.currency || null, source: 'v8' }),
          };
        }
      }

    } catch (e) {
      // Essai URL suivante
    }
  }

  return {
    statusCode: 502, headers,
    body: JSON.stringify({ error: 'Impossible de récupérer le cours pour ' + ticker }),
  };
};
