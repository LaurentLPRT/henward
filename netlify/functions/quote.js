exports.handler = async function(event) {
  const ticker = (event.queryStringParameters?.ticker || '').trim().toUpperCase();

  if (!ticker) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ticker requis' }) };
  }

  // Headers imitant un vrai navigateur pour éviter le blocage Yahoo
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const meta    = result.meta;
      const price   = parseFloat((meta.regularMarketPrice || meta.previousClose || 0).toFixed(3));
      if (!price) continue;
      const prev    = meta.chartPreviousClose || meta.previousClose || null;
      const change  = prev ? parseFloat((price - prev).toFixed(3)) : null;
      const changeP = prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : null;
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ price, change, changeP }),
      };
    } catch (e) { /* essai URL suivante */ }
  }

  return {
    statusCode: 502,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Cours non disponible pour ' + ticker }),
  };
};
