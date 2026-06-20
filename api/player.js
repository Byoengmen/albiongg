const HOSTS = {
  west:   'gameinfo.albiononline.com',
  east:   'gameinfo-sgp.albiononline.com',
  europe: 'gameinfo-ams.albiononline.com',
};

function equipmentIsEmpty(eq) {
  if (!eq) return true;
  return Object.values(eq).every(v => v == null || !v.Type);
}

function extractEquipmentFromEvent(event, playerId) {
  if (!event) return null;
  const victim   = event.Victim;
  const killers  = event.Participants || event.GroupMembers || [];

  // 데스 이벤트에서 본인 장비
  if (victim && victim.Id === playerId && victim.Equipment) {
    if (!equipmentIsEmpty(victim.Equipment)) return victim.Equipment;
  }
  // 킬 이벤트에서 본인 장비
  for (const p of killers) {
    if (p.Id === playerId && p.Equipment && !equipmentIsEmpty(p.Equipment)) {
      return p.Equipment;
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id, server = 'east' } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id parameter required' });
  }

  const host = HOSTS[server] ?? HOSTS.east;
  const base = `https://${host}/api/gameinfo`;

  try {
    // 기본 플레이어 정보 + 킬/데스 이벤트 병렬 요청
    const [playerRes, killsRes, deathsRes] = await Promise.all([
      fetch(`${base}/players/${encodeURIComponent(id)}`),
      fetch(`${base}/players/${encodeURIComponent(id)}/kills?limit=5`),
      fetch(`${base}/players/${encodeURIComponent(id)}/deaths?limit=5`),
    ]);

    const data = await playerRes.json();

    // Equipment가 비어있으면 킬/데스 이벤트에서 장비 추출
    if (equipmentIsEmpty(data.Equipment)) {
      const kills  = killsRes.ok  ? await killsRes.json()  : [];
      const deaths = deathsRes.ok ? await deathsRes.json() : [];

      // 가장 최신 이벤트 우선 탐색
      const events = [...(Array.isArray(deaths) ? deaths : []), ...(Array.isArray(kills) ? kills : [])];
      for (const ev of events) {
        const eq = extractEquipmentFromEvent(ev, id);
        if (eq) {
          data.Equipment = eq;
          data._equipmentSource = 'event';
          break;
        }
      }
    }

    res.status(playerRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
