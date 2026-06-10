const HOSTS = {
  west:   'gameinfo.albiononline.com',
  east:   'gameinfo-sgp.albiononline.com',
  europe: 'gameinfo-ams.albiononline.com',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, server = 'east' } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'q parameter required' });
  }

  const host = HOSTS[server] ?? HOSTS.east;

  try {
    const upstream = await fetch(
      `https://${host}/api/gameinfo/search?q=${encodeURIComponent(q)}`
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
