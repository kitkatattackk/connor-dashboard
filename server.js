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
const PizZip       = require('pizzip');
const Docxtemplater = require('docxtemplater');
const crypto = require('crypto');
function b64url(buf){ return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
let pendingOAuth = null;

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

let notionToken  = null;
let anthropicKey = null;

// Restore tokens from disk on startup
try {
  const d = readData();
  if (d.notionToken)  { notionToken  = d.notionToken;  console.log('[notion] token restored'); }
  if (d.anthropicKey) { anthropicKey = d.anthropicKey; console.log('[anthropic] key restored'); }
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

// ── Anthropic helper ─────────────────────────────────────────────────────────
function callClaude(apiKey, transcript, meta) {
  return new Promise((resolve, reject) => {
    const sys = `You are a meeting recap parser for GaugeQuality (GQ). Return ONLY a compact JSON object on a single line. No markdown fences, no pretty-printing, no explanation, nothing outside the JSON.

Schema: {"sections":[{"heading":"string","bullets":["string"]}],"nextSteps":[{"owner":"string","items":["string"]}],"keyTakeaways":["string"]}

STRICT RULES for valid JSON output:
- NO literal newlines anywhere in the response
- NO double-quote characters (") inside string values — use single quotes (') instead
- NO backslashes inside string values
- NO trailing commas
- Response must be one single line of compact JSON, nothing else
- First section must be "Session Overview" with participant info, session description, duration
- Include all topics covered as separate sections
- nextSteps: group by owner (e.g. "Client to:", "GQ team to:")
- End with Key Takeaways
- If no transcript: use "[To be filled]" placeholders`;

    const userMsg = transcript
      ? `Client: ${meta.client}\nSession: ${meta.session_type} ${meta.session_label}\nDate: ${meta.date}\nAttendees: ${meta.attendees || 'Not specified'}\n\nTranscript:\n${transcript.slice(0, 15000)}`
      : `Client: ${meta.client}\nSession: ${meta.session_type} ${meta.session_label}\nDate: ${meta.date}\n\nNo transcript provided.`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: sys,
      messages: [
        { role: 'user', content: userMsg },
      ],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            return reject(new Error(parsed.error?.message || `Anthropic ${res.statusCode}`));
          }
          const text = (parsed.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          console.log('[claude] raw response:', text.slice(0, 600));
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start === -1 || end === -1) return reject(new Error('No JSON found in Claude response'));
          const raw = text.slice(start, end + 1);
          let json;
          try {
            json = JSON.parse(raw);
          } catch (e1) {
            console.log('[claude] parse error at pos', e1.message, '— running sanitizer');
            // Robust char-by-char sanitizer: fix control chars and unescaped quotes inside strings
            const chars = [];
            let inStr = false;
            let i = 0;
            while (i < raw.length) {
              const ch = raw[i];
              if (!inStr) {
                chars.push(ch);
                if (ch === '"') inStr = true;
                i++;
              } else if (ch === '\\') {
                const nx = raw[i + 1] || '';
                if ('"\\/bfnrtu'.includes(nx)) { chars.push(ch, nx); i += 2; }
                else if (nx === '\n') { chars.push('\\', 'n'); i += 2; }
                else if (nx === '\r') { chars.push('\\', 'r'); i += 2; }
                else if (nx === '\t') { chars.push('\\', 't'); i += 2; }
                else { i++; } // drop invalid backslash
              } else if (ch === '"') {
                // Heuristic: if next non-space char is a JSON structural char, this ends the string
                let j = i + 1;
                while (j < raw.length && raw[j] === ' ') j++;
                const nxt = raw[j] || '';
                if (!nxt || ',]}'.includes(nxt) || nxt === ':' || nxt === '"') {
                  chars.push('"'); inStr = false;
                } else {
                  chars.push('\\', '"'); // escape embedded quote
                }
                i++;
              } else if (ch === '\n') { chars.push('\\', 'n'); i++; }
              else if (ch === '\r') { chars.push('\\', 'r'); i++; }
              else if (ch === '\t') { chars.push('\\', 't'); i++; }
              else if (ch.charCodeAt(0) < 0x20) { i++; } // drop other control chars
              else { chars.push(ch); i++; }
            }
            json = JSON.parse(chars.join(''));
          }
          resolve(json);
        } catch(e) { reject(new Error('Failed to parse Claude response: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
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

  if (req.method === 'GET') {
    if (req.url === '/load-data') return send(200, readData());

    if (req.url === '/outlook-status') {
      const d = readData();
      return send(200, { connected: !!(d.outlookTokens) });
    }

    if (req.url.startsWith('/outlook-events')) {
      (async () => {
        const d = readData();
        if (!d.outlookTokens) return send(401, { ok: false, error: 'Not connected' });
        let { accessToken, refreshToken, expiresAt, clientId } = d.outlookTokens;
        if (Date.now() > expiresAt - 300000) {
          const rb = new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://graph.microsoft.com/Calendars.Read offline_access' });
          const tr = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: rb.toString() });
          const tj = await tr.json();
          if (tj.error) return send(401, { ok: false, error: 'Token refresh failed' });
          accessToken = tj.access_token;
          d.outlookTokens = { ...d.outlookTokens, accessToken, expiresAt: Date.now() + tj.expires_in * 1000, ...(tj.refresh_token ? { refreshToken: tj.refresh_token } : {}) };
          writeData(d);
        }
        const u = new URL(req.url, 'http://localhost');
        const start = u.searchParams.get('start');
        const end = u.searchParams.get('end');
        const er = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$select=subject,start,end,isAllDay&$top=200&$orderby=start/dateTime`, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Prefer': 'outlook.timezone="UTC"' } });
        const ej = await er.json();
        if (ej.error) return send(400, { ok: false, error: ej.error.message });
        return send(200, { ok: true, events: ej.value || [] });
      })().catch(e => send(500, { ok: false, error: e.message }));
      return;
    }

    if (req.url.startsWith('/oauth/callback')) {
      (async () => {
        const u = new URL(req.url, 'http://localhost:3847');
        const code = u.searchParams.get('code');
        const state = u.searchParams.get('state');
        const err = u.searchParams.get('error');
        const html = (body) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(body); };
        if (err) return html(`<html><body style="font-family:sans-serif;padding:40px;background:#07101a;color:#fff"><h2>Sign-in error</h2><p>${err}</p></body></html>`);
        if (!pendingOAuth || state !== pendingOAuth.state) return html('<html><body style="font-family:sans-serif;padding:40px;background:#07101a;color:#fff"><h2>Invalid state — please try again.</h2></body></html>');
        const tb = new URLSearchParams({ client_id: pendingOAuth.clientId, code, redirect_uri: 'http://localhost:3847/oauth/callback', grant_type: 'authorization_code', code_verifier: pendingOAuth.verifier });
        const tr = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tb.toString() });
        const tokens = await tr.json();
        if (tokens.error) return html(`<html><body style="font-family:sans-serif;padding:40px;background:#07101a;color:#fff"><h2>Error</h2><p>${tokens.error_description}</p></body></html>`);
        const d = readData();
        d.outlookTokens = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000, clientId: pendingOAuth.clientId };
        writeData(d);
        pendingOAuth = null;
        console.log('[outlook] connected');
        html('<html><body style="font-family:sans-serif;padding:40px;background:#07101a;color:#00c4a7;text-align:center"><h2>&#10003; Connected to Outlook!</h2><p style="color:#aaa">You can close this window and return to Meridian.</p></body></html>');
      })().catch(e => { res.writeHead(500, { 'Content-Type': 'text/html' }); res.end(`<html><body><h2>${e.message}</h2></body></html>`); });
      return;
    }

    return send(404, { ok: false, error: 'Not found' });
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

      if (req.url === '/set-anthropic-key') {
        anthropicKey = payload.key || null;
        const d = readData(); d.anthropicKey = payload.key || null; writeData(d);
        return send(200, { ok: true });
      }

      if (req.url === '/generate-recap') {
        if (!anthropicKey) throw new Error('No Anthropic API key — go to ⚙ Settings.');
        const { client, date, session_type, session_label, attendees, transcript } = payload;
        const meta = { client, date, session_type, session_label, attendees };

        // Call Claude to extract structured JSON
        const recapData = await callClaude(anthropicKey, transcript || '', meta);

        // Attach metadata for template rendering
        recapData.session_type  = session_type  || 'Onboarding';
        recapData.session_label = session_label || 'Session One';
        recapData.client        = client        || '';
        recapData.date          = date          || '';

        // Load template
        const templatePath = path.join(__dirname, 'assets', 'recap-template.docx');
        const templateBuf  = fs.readFileSync(templatePath);
        const zip          = new PizZip(templateBuf);
        const doc          = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks:    true,
        });

        doc.render(recapData);
        const outBuf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        return send(200, { ok: true, docx: outBuf.toString('base64') });
      }

      if (req.url === '/save-data') {
        const d = readData();
        if (payload.tasks          !== undefined) d.tasks          = payload.tasks;
        if (payload.wBlocks        !== undefined) d.wBlocks        = payload.wBlocks;
        if (payload.pomoState      !== undefined) d.pomoState      = payload.pomoState;
        if (payload.weatherLocation!== undefined) d.weatherLocation= payload.weatherLocation;
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

      if (req.url === '/oauth/start') {
        const { clientId } = payload;
        if (!clientId) return send(400, { ok: false, error: 'clientId required' });
        const verifier = b64url(crypto.randomBytes(32));
        const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
        const state = b64url(crypto.randomBytes(16));
        pendingOAuth = { verifier, clientId, state };
        const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: 'http://localhost:3847/oauth/callback', scope: 'https://graph.microsoft.com/Calendars.Read offline_access', code_challenge: challenge, code_challenge_method: 'S256', state, response_mode: 'query', prompt: 'select_account' });
        return send(200, { ok: true, authUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}` });
      }

      if (req.url === '/outlook-disconnect') {
        const d = readData();
        delete d.outlookTokens;
        writeData(d);
        return send(200, { ok: true });
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
