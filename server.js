/**
 * Connor Dashboard — Local bridge server
 * Runs on localhost:3847, started by main.js
 * Handles: Notion API, persistent data save/load
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const PORT     = 3847;
const TASKS_DB = '2e79d4f5-f2c7-810b-a0af-e24208cde12b';

// ── Data file path ────────────────────────────────────────────────────────────
function getDataPath() {
  const base = process.env.CDASH_USER_DATA || os.homedir();
  return path.join(base, 'connor-dashboard-data.json');
}

function readData() {
  try { return JSON.parse(fs.readFileSync(getDataPath(), 'utf8')); }
  catch (e) { return { tasks: [], wBlocks: {}, pomoState: null, notionToken: null }; }
}

function writeData(d) {
  try {
    const p = getDataPath();
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  } catch (e) { console.error('[data] write failed:', e.message); }
}

// ── Project IDs ───────────────────────────────────────────────────────────────
const PROJECT_IDS = {
  'Harford Claims':      '3129d4f5-f2c7-8068-965a-c3f2b53b8941',
  'Merchants Claims':    '2e79d4f5-f2c7-8019-9c04-ff64848883b4',
  'IAT':                 '2e79d4f5-f2c7-80a5-b8b6-feef5ec479c6',
  'Branch':              '30c9d4f5-f2c7-8003-a26a-d67ac23b0224',
  'Reporting/Dashboard': '2e79d4f5-f2c7-8102-9387-f31e04a73897',
  'IPG':                 '2e79d4f5-f2c7-800d-b2fe-cf348e14fe11',
  'MSI':                 null,
  'Markel Claims':       '3269d4f5-f2c7-810f-a94f-fe77d63aed1c',
  'Client = N/A':        '2e79d4f5-f2c7-809e-bac9-ea41462a8fcf',
};

let notionToken = null;

// Restore token from disk on startup
try {
  const d = readData();
  if (d.notionToken) { notionToken = d.notionToken; console.log('[notion] token restored'); }
} catch(e){}

// ── Notion helpers ────────────────────────────────────────────────────────────
function notionRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.notion.com', path: urlPath, method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(parsed.message || `Notion ${res.statusCode}`));
          else resolve(parsed);
        } catch (e) { reject(new Error('Invalid JSON from Notion')); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildProperties(p) {
  const props = {
    'Task name': { title: [{ text: { content: p.taskName } }] },
    'Status':    { status: { name: p.status || 'Not Started' } },
  };
  if (p.priority)     props['Priority']  = { select: { name: p.priority } };
  if (p.tags?.length) props['Tags']      = { multi_select: p.tags.map(t => ({ name: t })) };
  if (p.due)          props['Due']       = { date: { start: p.due } };
  if (p.jiraTicket)   props['Jira Ticket'] = { rich_text: [{ text: { content: p.jiraTicket } }] };
  if (p.devPoints)    props['Dev Points (If Ready for Dev)'] = { rich_text: [{ text: { content: String(p.devPoints) } }] };
  if (p.notes)        props['Notes']     = { rich_text: [{ text: { content: p.notes.slice(0, 2000) } }] };
  const pid = PROJECT_IDS[p.project];
  if (pid) props['Project'] = { relation: [{ id: pid }] };
  return props;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const send = (code, obj) => {
    const s = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(s);
  };

  if (req.method === 'GET' && req.url === '/load-data') {
    return send(200, readData());
  }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};

      if (req.url === '/set-token') {
        notionToken = payload.token;
        const d = readData(); d.notionToken = payload.token; writeData(d);
        return send(200, { ok: true });
      }

      if (req.url === '/save-data') {
        const d = readData();
        if (payload.tasks    !== undefined) d.tasks     = payload.tasks;
        if (payload.wBlocks  !== undefined) d.wBlocks   = payload.wBlocks;
        if (payload.pomoState!== undefined) d.pomoState = payload.pomoState;
        writeData(d);
        return send(200, { ok: true });
      }

      if (req.url === '/load-data') {
        return send(200, readData());
      }

      if (req.url === '/create-task') {
        if (!notionToken) throw new Error('No token — go to ⚙ Settings.');
        const page = await notionRequest('POST', '/v1/pages', {
          parent: { database_id: TASKS_DB },
          properties: buildProperties(payload),
        }, notionToken);
        return send(200, { ok: true, url: page.url, id: page.id });
      }

      send(404, { ok: false, error: 'Unknown route' });
    } catch (e) {
      console.error('[bridge]', e.message);
      send(500, { ok: false, error: e.message });
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] ready on :${PORT} — data: ${getDataPath()}`);
});
server.on('error', e => console.error('[bridge] failed:', e.message));
