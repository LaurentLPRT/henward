exports.handler = async function(event) {
  const ticker = (event.queryStringParameters?.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ticker requis' }) };
  }
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

  // Reconstruit la clôture de la veille à partir de l'historique réel
  // (dates + prix), indépendamment de tout champ agrégé Yahoo.
  // Sert de "second avis" pour valider (ou invalider) meta.previousClose.
  function historicalPrevClose(result, meta) {
    const ts = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    if (!ts.length || ts.length !== closes.length) return null;
    const tz = meta.gmtoffset || 0;
    const dayKey = t => Math.floor((t + tz) / 86400);
    const lastDay = dayKey(ts[ts.length - 1]);
    for (let i = ts.length - 2; i >= 0; i--) {
      if (closes[i] != null && dayKey(ts[i]) < lastDay) return closes[i];
    }
    return null;
  }

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const meta  = result.meta;
      const price = parseFloat((meta.regularMarketPrice || meta.previousClose || 0).toFixed(3));
      if (!price) continue;

      // --- Deux sources indépendantes pour la clôture de la veille ---
      const prevA = meta.previousClose || null;          // champ Yahoo direct
      const prevB = historicalPrevClose(result, meta);    // reconstruit depuis l'historique

      // On n'affiche une variation QUE si les deux sources sont d'accord
      // (à 1% près). En cas de désaccord ou d'absence de l'une des deux,
      // on préfère ne rien afficher plutôt qu'un chiffre potentiellement faux.
      let prev = null;
      if (prevA && prevB) {
        const ecart = Math.abs(prevA - prevB) / prevB;
        if (ecart <= 0.01) prev = prevA;
      } else if (prevA && !prevB) {
        // Pas de second avis possible (historique insuffisant) : on fait
        // confiance au champ officiel seul, cas rare.
        prev = prevA;
      }

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
