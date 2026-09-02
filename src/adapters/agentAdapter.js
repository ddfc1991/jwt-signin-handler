// src/adapters/agentAdapter.js
// Simple WebSocket server for agent connections. Tracks connected agents and allows sending commands.

const WebSocket = require('ws');
const url = require('url');

module.exports = function createAgentAdapter(httpServer) {
  // Attach WS server on same http server under /agent
  const wss = new WebSocket.Server({ noServer: true });

  // Map of deviceId -> { ws, info }
  const agents = new Map();

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;
    if (pathname === '/agent') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    // Expect agent to send a register message { type: 'register', deviceId, info, token }
    let deviceId = null;
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'register') {
          deviceId = data.deviceId || `device_${Date.now()}`;
          agents.set(deviceId, { ws, info: data.info || {} });
          ws.send(JSON.stringify({ type: 'registered', deviceId }));
          console.log('Agent registered', deviceId);
        } else if (data.type === 'heartbeat') {
          // update last seen
          const entry = agents.get(deviceId);
          if (entry) entry.lastSeen = Date.now();
        } else if (data.type === 'result') {
          // forward result to server-side listeners via a simple event emit later
          // for now, attach to ws
          // no-op here
        }
      } catch (e) {
        console.warn('Invalid message from agent', e);
      }
    });

    ws.on('close', () => {
      if (deviceId && agents.has(deviceId)) {
        agents.delete(deviceId);
        console.log('Agent disconnected', deviceId);
      }
    });
  });

  function listAgents() {
    const out = [];
    for (const [id, { info, lastSeen }] of agents.entries()) {
      out.push({ id, info, lastSeen });
    }
    return out;
  }

  async function sendCommand(deviceId, cmd) {
    const entry = agents.get(deviceId);
    if (!entry || !entry.ws || entry.ws.readyState !== WebSocket.OPEN) {
      throw new Error('agent not connected');
    }
    return new Promise((resolve, reject) => {
      const id = 'cmd_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const payload = Object.assign({ id, type: 'command' }, cmd);
      function onMessage(msg) {
        try {
          const data = JSON.parse(msg.toString());
          if (data.type === 'command_result' && data.id === id) {
            entry.ws.removeListener('message', onMessage);
            resolve(data);
          }
        } catch (e) {}
      }
      entry.ws.on('message', onMessage);
      entry.ws.send(JSON.stringify(payload), (err) => {
        if (err) {
          entry.ws.removeListener('message', onMessage);
          reject(err);
        }
      });
      // timeout
      setTimeout(() => {
        entry.ws.removeListener('message', onMessage);
        reject(new Error('agent command timeout'));
      }, 30000);
    });
  }

  return { listAgents, sendCommand, _agents: agents };
};
