// examples/termux-server.js
// Minimal Termux server example with REST and WebSocket
// Usage: TERMUX_API_SECRET=your_secret node termux-server.js

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const { exec } = require('child_process');
const fs = require('fs');

const SECRET = process.env.TERMUX_API_SECRET || 'change-me';
const PORT = process.env.TERMUX_API_PORT || 3000;
const KV_DIR = process.env.TERMUX_KV_DIR || './termux_kv';
if (!fs.existsSync(KV_DIR)) fs.mkdirSync(KV_DIR, { recursive: true });

const app = express();
app.use(bodyParser.json());

// simple localhost guard (best effort)
app.use((req,res,next)=>{
  const ip = req.ip || req.connection.remoteAddress;
  // allow ::1 and 127.0.0.1
  if (!(ip && (ip.includes('127.0.0.1') || ip.includes('::1') || ip === '::ffff:127.0.0.1'))) {
    // do not strictly forbid in dev, but log
    console.warn('Warning: remote request from', ip);
  }
  next();
});

function checkAuth(req,res,next){
  const token = req.headers['x-termux-token'] || req.query.token;
  if (!token || token !== SECRET) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.post('/kv', checkAuth, (req,res)=>{
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key required' });
  fs.writeFileSync(`${KV_DIR}/${encodeURIComponent(key)}.json`, JSON.stringify({ value, updatedAt: Date.now() }));
  res.json({ ok:true });
});

app.get('/kv', checkAuth, (req,res)=>{
  const key = req.query.key; if (!key) return res.status(400).json({ error: 'key required' });
  try { const raw = fs.readFileSync(`${KV_DIR}/${encodeURIComponent(key)}.json`, 'utf8'); return res.json(JSON.parse(raw)); } catch(e){ return res.status(404).json({ error: 'not found' }); }
});

const ALLOWED = ['termux-tts-speak','termux-open','termux-toast'];
app.post('/exec', checkAuth, (req,res)=>{
  const { cmd, args = [] } = req.body || {};
  if (!cmd) return res.status(400).json({ error: 'cmd required' });
  const base = cmd.split(' ')[0];
  if (!ALLOWED.includes(base)) return res.status(403).json({ error: 'cmd not allowed' });
  const full = [cmd, ...args].join(' ');
  exec(full, { timeout: 10000, maxBuffer: 200*1024 }, (err, stdout, stderr)=>{
    if (err) return res.status(500).json({ error: err.message, stderr });
    res.json({ stdout });
  });
});

app.get('/health',(req,res)=>res.json({ ok:true }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('ws connected', req.socket.remoteAddress);
  ws.on('message', (msg)=>{
    // expect JSON { action, payload }
    try {
      const data = JSON.parse(msg.toString());
      if (data.action === 'exec'){
        const { cmd, args } = data.payload || {};
        const base = cmd.split(' ')[0];
        if (!ALLOWED.includes(base)) return ws.send(JSON.stringify({ ok:false, error:'cmd not allowed' }));
        exec([cmd, ...(args||[])].join(' '), { timeout: 10000 }, (err, stdout, stderr)=>{
          if (err) ws.send(JSON.stringify({ ok:false, error: err.message })); else ws.send(JSON.stringify({ ok:true, stdout }));
        });
      }
    } catch(e) { ws.send(JSON.stringify({ ok:false, error: 'bad message' })); }
  });
});

server.listen(PORT, '127.0.0.1', ()=>{
  console.log(`Termux server listening on http://127.0.0.1:${PORT} (secret via TERMUX_API_SECRET)`);
});
