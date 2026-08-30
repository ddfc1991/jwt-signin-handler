// examples/broker-server.js
// Simple broker that accepts WebSocket connections from devices (termux clients) and from agents (controllers)
// For demo only: no production grade auth. Use JWT/SSL in prod.

const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const PORT = process.env.BROKER_PORT || 4000;

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

// maps
const devices = new Map(); // deviceId => ws
const agents = new Set();

wss.on('connection', (ws, req, role, id) => {
  ws.on('message', (msg) => {
    try {
      const m = JSON.parse(msg.toString());
      // device registration handled on connect
      if (m.type === 'register' && m.role === 'device' && m.deviceId) {
        ws.role = 'device'; ws.deviceId = m.deviceId; devices.set(m.deviceId, ws); ws.send(JSON.stringify({ ok:true, registered:true }));
        return;
      }
      // agent sends { type:'command', deviceId, cmd }
      if (m.type === 'command' && m.deviceId && devices.has(m.deviceId)) {
        const target = devices.get(m.deviceId);
        target.send(JSON.stringify({ type:'command', id: m.id || Date.now(), cmd: m.cmd }));
        return;
      }
      // device sends back result
      if (m.type === 'result' && m.deviceId) {
        // forward to all agents for demo
        for (const a of agents) { try { a.send(JSON.stringify(m)); } catch(e){} }
        return;
      }
    } catch(e) { ws.send(JSON.stringify({ ok:false, error:'bad message' })); }
  });

  ws.on('close', () => {
    if (ws.role === 'device' && ws.deviceId) devices.delete(ws.deviceId);
    if (ws.role === 'agent') agents.delete(ws);
  });
});

server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  wss.handleUpgrade(request, socket, head, function done(ws) {
    // simple role detection query
    const q = url.parse(request.url, true).query;
    if (q && q.role === 'agent') { ws.role = 'agent'; agents.add(ws); }
    wss.emit('connection', ws, request);
  });
});

server.listen(PORT, () => console.log('Broker listening on', PORT));
