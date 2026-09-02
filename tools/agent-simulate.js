// tools/agent-simulate.js
// Simple agent simulator for quick testing without installing APK.
// Usage:
//   SERVER=http://localhost:3000 ADMIN_KEY=your_admin_key DEVICE_ID=device-test-1 node tools/agent-simulate.js

const WebSocket = require('ws');
const axios = require('axios');

const SERVER = process.env.SERVER || 'http://localhost:3000';
const WS_URL = SERVER.replace(/^http/, 'ws') + '/agent';
const ADMIN_KEY = process.env.ADMIN_KEY; // optional, used to fetch token
const DEVICE_ID = process.env.DEVICE_ID || 'device-sim-1';

async function getToken() {
  if (!ADMIN_KEY) return null;
  try {
    const res = await axios.post(`${SERVER}/api/agent/token`, { deviceId: DEVICE_ID }, { headers: { 'X-ADMIN-KEY': ADMIN_KEY } });
    return res.data.token;
  } catch (e) {
    console.error('failed to get token', e.response ? e.response.data : e.message);
    return null;
  }
}

(async () => {
  const token = await getToken();
  console.log('connecting to', WS_URL, 'deviceId=', DEVICE_ID, 'token=', !!token);
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    const register = { type: 'register', deviceId: DEVICE_ID, token, info: { model: 'sim-node' } };
    ws.send(JSON.stringify(register));
    console.log('registered');
  });

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log('recv', data);
      if (data.type === 'command') {
        // Simulate performing the command and reply with command_result
        const id = data.id;
        const action = data.action;
        const payload = data.payload || {};
        console.log(`Executing command ${action}`, payload);
        // Simulate a small delay
        await new Promise(r => setTimeout(r, 500));
        const result = { type: 'command_result', id, status: 'ok', result: { ack: true, action, payload } };
        ws.send(JSON.stringify(result));
        console.log('sent command_result', id);
      }
    } catch (e) {
      console.error('msg parse err', e);
    }
  });

  ws.on('close', () => console.log('ws closed'));
  ws.on('error', (e) => console.error('ws error', e));
})();
