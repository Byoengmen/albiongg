const HOSTS = {
  west:   'gameinfo.albiononline.com',
  east:   'gameinfo-sgp.albiononline.com',
  europe: 'gameinfo-ams.albiononline.com',
};

function extractPlayerData(event, playerId) {
  const victim    = event.Victim;
  const killers   = event.Participants || event.GroupMembers || [];
  const isKill    = victim && victim.Id !== playerId;
  const isDeath   = victim && victim.Id === playerId;

  let equipment = null;
  let itemPower = null;

  if (isDeath && victim.Equipment) {
    equipment = victim.Equipment;
    itemPower = victim.AverageItemPower;
  } else {
    for (const p of killers) {
      if (p.Id === playerId) {
        equipment = p.Equipment;
        itemPower = p.AverageItemPower;
        break;
      }
    }
  }

  return {
    eventId:     event.EventId,
    time:        event.TimeStamp,
    type:        isDeath ? 'death' : 'kill',
    killFame:    event.TotalVictimKillFame,
    opponent:    isKill ? victim?.Name : (killers.find(p => p.Id !== playerId)?.Name ?? null),
    equipment,
    itemPower,
  };
}

function equipFingerprint(equipment) {
  if (!equipment) return '';
  const slots = ['MainHand','OffHand','Head','Armor','Shoes','Bag','Cape','Mount','Potion','Food'];
  return slots.map(s => {
    const item = equipment[s];
    return item?.Type ?? '';
  }).join('|');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, server = 'east', limit = '20' } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const host = HOSTS[server] ?? HOSTS.east;
  const base = `https://${host}/api/gameinfo`;
  const n    = Math.min(parseInt(limit) || 20, 51);

  try {
    const [killsRes, deathsRes] = await Promise.all([
      fetch(`${base}/players/${encodeURIComponent(id)}/kills?limit=${n}`),
      fetch(`${base}/players/${encodeURIComponent(id)}/deaths?limit=${n}`),
    ]);

    const kills  = killsRes.ok  ? await killsRes.json()  : [];
    const deaths = deathsRes.ok ? await deathsRes.json() : [];

    // 합산 후 시간 내림차순 정렬
    const all = [
      ...(Array.isArray(kills)  ? kills  : []),
      ...(Array.isArray(deaths) ? deaths : []),
    ]
      .map(ev => extractPlayerData(ev, id))
      .filter(ev => ev.equipment)
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    // 장비 핑거프린트 기준으로 연속 그룹핑
    const groups = [];
    for (const ev of all) {
      const fp = equipFingerprint(ev.equipment);
      if (!fp) continue;

      const last = groups[groups.length - 1];
      if (last && last.fingerprint === fp) {
        last.events.push(ev);
      } else {
        groups.push({
          fingerprint: fp,
          equipment:   ev.equipment,
          itemPower:   ev.itemPower,
          events:      [ev],
        });
      }
    }

    res.status(200).json({ groups });
  } catch (err) {
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
