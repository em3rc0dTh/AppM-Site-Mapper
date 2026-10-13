import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import pg from 'pg';
import { IndependentLiveReader } from './live.mjs';

const allowKinds = new Set([
  'NETWORK',
  'LEVEL',
  'POSITION',
  'CONTAINER_RACK',
  'DEVICE',
  'EQUIPMENT',
]);
const views = new Set(['inventory', 'access-ports', 'power', 'telemetry', 'bindings']);
const sessions = new Map();
const maxRows = 5000;
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'appm_site_mapper';
const appUrl = process.env.SITE_MAPPER_API_URL || 'http://127.0.0.1:3000';
const host = process.env.CONSOLE_HOST || '127.0.0.1';
const port = Number(process.env.CONSOLE_PORT || 3100);
const timescale = process.env.TIMESCALE_DSN
  ? new pg.Pool({
      connectionString: process.env.TIMESCALE_DSN,
      max: 3,
      connectionTimeoutMillis: 3000,
    })
  : null;
const client = mongoUri ? new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 }) : null;
const encode = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x],
  );
const csvValue = (x) => {
  let s = typeof x === 'object' ? JSON.stringify(x ?? '') : String(x ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
function session(req) {
  const key = (req.headers.cookie || '').match(/(?:^|;\s*)oc_session=([a-f0-9]{48})/)?.[1];
  const value = key && sessions.get(key);
  if (!value || Date.now() > value.expire) return null;
  return value;
}
function respond(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || new URL(origin).host === req.headers.host;
}
function dashboard() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site Mapper — Operational Console</title>
<style>
:root{font:14px system-ui,sans-serif;color:#e5eaf3;background:#0b1220}*{box-sizing:border-box}
body{margin:0}.shell{max-width:1500px;margin:auto;padding:24px}h1{font-size:24px;margin:8px 0}p{color:#a2b1c7}
nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}button,input,select{background:#1a293e;color:#f5f7fd;border:1px solid #35465e;border-radius:7px;padding:9px}button{cursor:pointer}button:hover{border-color:#83ceb5}.active{border-color:#63dbad;color:#63dbad}
.panel{border:1px solid #26354b;border-radius:12px;padding:16px;margin:12px 0;background:#121d2d}
#table{overflow:auto;max-height:65vh}.guide{color:#a2b1c7;margin:6px 0 12px}.status-pill{display:inline-block;border:1px solid #466176;border-radius:14px;padding:3px 7px}.row-link{color:#80dfca;text-decoration:underline;text-underline-offset:3px}.details{margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}.filters{display:flex;gap:10px;align-items:end;flex-wrap:wrap}table{border-collapse:collapse;width:100%;white-space:nowrap}td,th{border-bottom:1px solid #2b3b53;padding:9px 12px;text-align:left}th{position:sticky;top:0;background:#17273a;color:#9cc6e7}td{font:12px ui-monospace,monospace}
.form{display:flex;flex-wrap:wrap;gap:10px;align-items:center}label{display:grid;gap:6px;color:#bdc8d7}#status{color:#75d8b7}
</style>
<div class="shell"><header><h1>Site Mapper / Operational Console</h1><p>Independent operational tables and audited mutations — no Blueprint dependency</p></header>
<section id="login" class="panel"><b>Authenticate with your Site Mapper account</b><form id="loginform" class="form"><label>Email<input name="email" type="email" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button>Log in</button></form></section>
<section id="workspace" hidden><nav id="tabs"></nav><div class="panel form">
<label>Search<input id="search" placeholder="ID, serial, name, location…"></label>
<label id="portfilterlabel" hidden>Connection<select id="portfilter"><option value="all">All ports</option><option value="connected">Connected</option><option value="unconnected">No recorded path</option></select></label><button id="reload">Refresh</button><button id="export">Export CSV</button><button id="logout">Log out</button><span id="status"></span>
</div><p id="guide" class="guide"></p><div id="table" class="panel"></div><div id="details" class="panel details" hidden></div>
<div class="panel"><b>Verified creation / connection</b><p>Spatial polygons (Site, Structure, Room, Bay) cannot be authored here. Level uses its existing parent; Position uses discrete row/column.</p>
<form id="createform" class="form"><label>Operation<select name="operation" id="operation"><option value="topology">Create inventory</option><option value="port">Create AccessPort</option><option value="power">Connect PowerPath</option><option value="commission">Commission telemetry</option></select></label>
<label>Entity kind<select name="kind"><option>NETWORK</option><option>LEVEL</option><option>POSITION</option><option>CONTAINER_RACK</option><option>DEVICE</option><option>EQUIPMENT</option></select></label>
<label>Parent / Equipment ID<input name="parentId" placeholder="Parent ID"></label>
<label>Name<input name="name" placeholder="New name"></label>
<label>Type / Variant<input name="type" placeholder="BDFB / PANEL / RACK"></label>
<label>More fields (JSON)<input name="extra" placeholder='{"sourceAccessPortId":"…"}'></label>
<button>Submit</button></form><p id="mutation"></p></div></section>
<script>
let current='inventory',columns=[],rows=[];
const qs=x=>document.querySelector(x);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function call(url,opt){let r=await fetch(url,{credentials:'same-origin',...opt});let j=await r.json();if(!r.ok)throw Error(j.error||j.status||r.status);return j;}
async function load(){qs('#status').textContent='Loading';qs('#details').hidden=true;qs('#portfilterlabel').hidden=current!=='access-ports';qs('#guide').textContent=current==='access-ports'?'Recorded Access Ports belong to Equipment. Connected means a recorded active Power Path; it does not prove electrical energization. Select a port for full physical context.':'';try{let data=await call('/api/table?view='+current);columns=data.columns;rows=data.rows;render();qs('#status').textContent=rows.length+' rows · '+new Date().toLocaleTimeString();}catch(e){qs('#status').textContent=e.message;}}
function render(){let query=qs('#search').value.toLowerCase();let filter=qs('#portfilter').value;let filtered=rows.filter(r=>(!query||Object.values(r).some(v=>String(v??'').toLowerCase().includes(query)))&&(current!=='access-ports'||filter==='all'||(filter==='connected'?r.connection==='CONNECTED':r.connection==='NO_RECORDED_PATH')));qs('#table').innerHTML='<table><thead><tr>'+columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+filtered.map((r,i)=>'<tr>'+columns.map(c=>'<td>'+(current==='access-ports'&&c==='name'?'<button type="button" data-row="'+i+'" class="row-link">'+esc(r[c])+'</button>':esc(typeof r[c]==='object'?JSON.stringify(r[c]):r[c]))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';qs('#table').querySelectorAll('[data-row]').forEach((b)=>b.onclick=()=>{let r=filtered[Number(b.dataset.row)];qs('#details').hidden=false;qs('#details').textContent='ACCESS PORT · '+r.name+'\nEquipment: '+r.equipment+'\nLocation: '+r.path+'\nPort ID: '+r.id+'\nEquipment ID: '+r.equipmentId+'\nType: '+r.portType+' / '+r.direction+' / '+r.exposure+'\nPower path: '+r.connection+'\nFeed: '+(r.feed||'Not recorded')+'\nNote: connected means recorded Power Path, not electrically energized.';};}
async function init(){try{await call('/api/me');qs('#login').hidden=true;qs('#workspace').hidden=false;load();}catch{qs('#login').hidden=false;qs('#workspace').hidden=true;}}
qs('#tabs').innerHTML=['inventory','access-ports','power','telemetry','bindings'].map(t=>'<button data-view="'+t+'">'+t.toUpperCase()+'</button>').join('');
qs('#tabs').addEventListener('click',e=>{let v=e.target.dataset.view;if(v){current=v;load();}});
qs('#search').addEventListener('input',render);qs('#portfilter').addEventListener('change',render);
qs('#reload').onclick=load;qs('#export').onclick=()=>{location.href='/api/export?view='+current;};
qs('#loginform').onsubmit=async e=>{e.preventDefault();let a=Object.fromEntries(new FormData(e.target));try{await call('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)});e.target.reset();init();}catch(x){alert(x.message);}};
qs('#logout').onclick=async()=>{await call('/api/logout',{method:'POST'});init();};
qs('#createform').onsubmit=async e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));try{let extra=f.extra.trim()?JSON.parse(f.extra):{};let payload={operation:f.operation,kind:f.kind,parentId:f.parentId,name:f.name,type:f.type,extra};let r=await call('/api/mutate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});qs('#mutation').textContent='Created: '+JSON.stringify(r);load();}catch(x){qs('#mutation').textContent='Error: '+x.message;}};
init();setInterval(()=>{if(!qs('#workspace').hidden)load()},15000);
</script></div></html>`;
}
function flatten(node, map) {
  const ancestors = [];
  let p = node,
    seen = new Set();
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    ancestors.unshift(p.name);
    p = map.get(p.parentId);
  }
  const children = [...map.values()].filter((x) => x.parentId === node.id);
  const find = (kind) => {
    let x = node,
      visited = new Set();
    while (x && !visited.has(x.id)) {
      visited.add(x.id);
      if (x.kind === kind) return x.name;
      x = map.get(x.parentId);
    }
    return '';
  };
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId,
    parent: map.get(node.parentId)?.name || '',
    children: children.length,
    network: find('NETWORK'),
    site: find('SITE'),
    rack: find('CONTAINER_RACK'),
    deviceId: node.deviceId || '',
    serial: node.serialNumber || '',
    type: node.equipmentType || node.deviceType || node.variant || '',
    level: find('LEVEL'),
    path: ancestors.join(' / '),
    state: node.lifecycle,
    ports: node.accessPorts?.length || 0,
  };
}
async function table(view, db, live) {
  if (view === 'inventory') {
    const nodes = await db.collection('topology_nodes').find({}).limit(maxRows).toArray();
    const map = new Map(nodes.map((n) => [n.id, n]));
    return nodes.map((n) => flatten(n, map));
  }
  if (view === 'access-ports') {
    const [nodes, paths] = await Promise.all([
      db.collection('topology_nodes').find({}).limit(maxRows).toArray(),
      db.collection('power_paths').find({ lifecycle: 'ACTIVE' }).limit(maxRows).toArray(),
    ]);
    const map = new Map(nodes.map((n) => [n.id, n]));
    const connected = new Set(paths.flatMap((p) => [p.sourceAccessPortId, p.targetAccessPortId]));
    return nodes.filter((n) => n.kind === 'EQUIPMENT').flatMap((equipment) =>
      (equipment.accessPorts || []).map((port) => ({
        id: port.id, name: port.name, equipmentId: equipment.id,
        equipment: equipment.name, path: flatten(equipment, map).path,
        rack: flatten(equipment, map).rack, site: flatten(equipment, map).site,
        portType: port.portType, direction: port.direction, exposure: port.exposure,
        feed: port.feed || '', lifecycle: port.lifecycle,
        connection: connected.has(port.id) ? 'CONNECTED' : 'NO_RECORDED_PATH',
      })),
    );
  }
  if (view === 'power') {
    const [paths, nodes] = await Promise.all([
      db.collection('power_paths').find({ lifecycle: 'ACTIVE' }).limit(maxRows).toArray(),
      db.collection('topology_nodes').find({ kind: 'EQUIPMENT' }).limit(maxRows).toArray(),
    ]);
    const ports = new Map(
      nodes.flatMap((n) =>
        (n.accessPorts || []).map((p) => [p.id, { name: n.name, equipmentId: n.id, port: p }]),
      ),
    );
    return paths.map((p) => ({
      id: p.id,
      feed: p.feed || '',
      sourcePortId: p.sourceAccessPortId,
      sourceEquipment: ports.get(p.sourceAccessPortId)?.name || '',
      targetPortId: p.targetAccessPortId,
      targetEquipment: ports.get(p.targetAccessPortId)?.name || '',
      state: p.lifecycle,
      createdAt: p.createdAt,
    }));
  }
  if (view === 'bindings') {
    return db
      .collection('telemetry_bindings')
      .find({ lifecycle: 'ACTIVE' })
      .limit(maxRows)
      .toArray()
      .then((rows) =>
        rows.map((x) => ({
          id: x.id,
          source: x.sourceIdentity,
          rawPoint: x.sourcePointId || '',
          metric: x.metric,
          target: x.targetId,
          targetType: x.targetType,
          state: x.lifecycle,
        })),
      );
  }
  const liveRows = live?.rows() ?? [];
  if (liveRows.length) return liveRows;
  // Independent durable telemetry: latest received historian sample per physical breaker.
  // Distinguish historical readings from LIVE status; never manufacture freshness.
  if (!timescale) return [{ status: 'UNCONFIGURED', note: 'TIMESCALE_DSN not configured' }];
  const { rows } = await timescale.query(`
    SELECT DISTINCT ON (source_identity,raw_point_id,breaker_id)
      source_identity AS source,raw_point_id AS "rawPoint",device_id AS "deviceId",
      breaker_id AS "breakerId",panel_id AS "panelId",voltage_v AS "voltageV",
      current_a AS "currentA",power_w AS "powerW",energy_kwh AS "energyKwh",
      received_at AS "receivedAt"
    FROM telemetry_samples
    WHERE received_at >= NOW() - INTERVAL '30 days'
    ORDER BY source_identity,raw_point_id,breaker_id,received_at DESC LIMIT 5000
  `);
  return rows.map((row) => ({
    ...row,
    status:
      Date.now() - Date.parse(row.receivedAt) < 30000 ? 'RECENT_HISTORICAL' : 'STALE_HISTORICAL',
  }));
}
function columnsFor(view) {
  return {
    inventory: [
      'id',
      'kind',
      'name',
      'parentId',
      'parent',
      'children',
      'network',
      'site',
      'rack',
      'deviceId',
      'serial',
      'type',
      'level',
      'path',
      'state',
      'ports',
    ],
    'access-ports': ['name', 'equipment', 'rack', 'site', 'portType', 'direction', 'exposure', 'feed', 'connection', 'lifecycle', 'id', 'equipmentId', 'path'],
    power: [
      'id',
      'feed',
      'sourcePortId',
      'sourceEquipment',
      'targetPortId',
      'targetEquipment',
      'state',
      'createdAt',
    ],
    bindings: ['id', 'source', 'rawPoint', 'metric', 'target', 'targetType', 'state'],
    telemetry: [
      'source',
      'rawPoint',
      'deviceId',
      'breakerId',
      'panelId',
      'voltageV',
      'currentA',
      'powerW',
      'energyKwh',
      'receivedAt',
      'status',
    ],
  }[view];
}
async function upstream(session, path, payload, origin) {
  const result = await fetch(new URL(path, appUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie, origin: origin },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  return {
    status: result.status,
    body: await result.json().catch(() => ({ error: 'UPSTREAM_FAILURE' })),
  };
}
function operation(input) {
  const extra =
    input.extra && typeof input.extra === 'object' && !Array.isArray(input.extra)
      ? input.extra
      : {};
  if (input.operation === 'topology') {
    if (!allowKinds.has(input.kind)) throw Error('SPATIAL_CREATION_FORBIDDEN');
    if (typeof input.name !== 'string' || !input.name.trim()) throw Error('NAME_REQUIRED');
    const data = {
      kind: input.kind,
      name: input.name.trim(),
      parentId: input.kind === 'NETWORK' ? null : input.parentId,
      ...extra,
    };
    if (
      ['SITE', 'STRUCTURE', 'ROOM_SUBSTRUCTURE', 'CONTAINER_CLUSTER_BAY'].includes(data.kind) ||
      'polygon' in data
    )
      throw Error('SPATIAL_CREATION_FORBIDDEN');
    if (input.kind === 'DEVICE') data.deviceType = input.type || 'CUSTOM';
    if (input.kind === 'EQUIPMENT') data.equipmentType = input.type || 'CUSTOM';
    if (input.kind === 'CONTAINER_RACK') data.containerVariant = input.type || 'RACK';
    return ['/api/topology', data];
  }
  if (input.operation === 'port') {
    if (!input.parentId) throw Error('EQUIPMENT_ID_REQUIRED');
    return [
      '/api/equipment/' + encodeURIComponent(input.parentId) + '/access-ports',
      {
        port: {
          name: input.name,
          portType: extra.portType || 'POWER',
          direction: extra.direction || 'INPUT',
          exposure: extra.exposure || 'EXTERNAL',
          ...(extra.feed ? { feed: extra.feed } : {}),
        },
      },
    ];
  }
  if (input.operation === 'power') return ['/api/power-paths', extra];
  if (input.operation === 'commission') return ['/api/telemetry/panel-commissioning', extra];
  throw Error('UNSUPPORTED_OPERATION');
}
export async function createServer({ database, login = globalThis.fetch } = {}) {
  const db = database || (client ? await client.connect().then((c) => c.db(dbName)) : null);
  if (!db) throw Error('MONGODB_URI is required');
  const live = new IndependentLiveReader(db);
  if (!database && process.env.MQTT_BROKER_URL) {
    live.start(process.env.MQTT_BROKER_URL, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      topicFilter: process.env.MQTT_TOPIC_FILTER || 'data/dev/#',
    });
  }
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://console.local');
      if (url.pathname === '/health') {
        respond(res, 200, { status: 'ok' });
        return;
      }
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy':
            "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
          'x-frame-options': 'DENY',
        });
        res.end(dashboard());
        return;
      }
      if (req.method === 'POST' && !sameOrigin(req)) {
        respond(res, 403, { error: 'ORIGIN_DENIED' });
        return;
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const credentials = await body(req);
        const x = await login(new URL('/api/auth/login', appUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(credentials),
          signal: AbortSignal.timeout(5000),
        });
        if (!x.ok) {
          respond(res, 401, { error: 'INVALID_CREDENTIALS' });
          return;
        }
        const profile = await x.json().catch(() => ({}));
        const role = profile?.user?.role;
        if (
          !['SUPERADMIN', 'ADMIN', 'STANDARD'].includes(role) ||
          profile.user.mustChangePassword
        ) {
          respond(res, 403, { error: 'ROLE_NOT_AUTHORIZED_OR_PASSWORD_CHANGE_REQUIRED' });
          return;
        }
        const cookie = x.headers.get('set-cookie')?.split(';')[0];
        if (!cookie?.startsWith('appm_session=')) {
          respond(res, 502, { error: 'SESSION_UNAVAILABLE' });
          return;
        }
        const key = randomBytes(24).toString('hex');
        sessions.set(key, { cookie, role, expire: Date.now() + 3600000 });
        respond(
          res,
          200,
          { status: 'authenticated' },
          {
            'set-cookie': 'oc_session=' + key + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600',
          },
        );
        return;
      }
      const user = session(req);
      if (!user) {
        respond(res, 401, { error: 'AUTHENTICATION_REQUIRED' });
        return;
      }
      if (url.pathname === '/api/me') {
        respond(res, 200, { authenticated: true });
        return;
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        const k = (req.headers.cookie || '').match(/oc_session=([a-f0-9]{48})/)?.[1];
        if (k) sessions.delete(k);
        respond(
          res,
          200,
          { status: 'logged_out' },
          { 'set-cookie': 'oc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' },
        );
        return;
      }
      if (
        (url.pathname === '/api/table' || url.pathname === '/api/export') &&
        req.method === 'GET'
      ) {
        const view = url.searchParams.get('view') || 'inventory';
        if (!views.has(view)) {
          respond(res, 400, { error: 'UNKNOWN_VIEW' });
          return;
        }
        const rows = await table(view, db, live);
        const columns = columnsFor(view);
        if (url.pathname === '/api/export') {
          res.writeHead(200, {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="' + view + '.csv"',
            'cache-control': 'no-store',
          });
          res.end(
            [
              columns.map(csvValue).join(','),
              ...rows.map((row) => columns.map((c) => csvValue(row[c])).join(',')),
            ].join('\r\n'),
          );
          return;
        }
        respond(res, 200, { columns, rows });
        return;
      }
      if (url.pathname === '/api/mutate' && req.method === 'POST') {
        if (user.role === 'STANDARD') {
          respond(res, 403, { error: 'WRITE_PERMISSION_REQUIRED' });
          return;
        }
        const [path, payload] = operation(await body(req));
        const result = await upstream(user, path, payload, new URL(appUrl).origin);
        respond(res, result.status, result.body);
        return;
      }
      respond(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      respond(res, error.message === 'BODY_TOO_LARGE' ? 413 : 400, {
        error: error.message || 'FAILED',
      });
    }
  });
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const server = await createServer();
  server.listen(port, host, () =>
    console.log('Operational Console listening on ' + host + ':' + port),
  );
}
