// examples/termux-client-broker.js
// A simple Termux client that connects to the broker and listens for commands
// Usage: node termux-client-broker.js --deviceId=mydevice --broker=wss://broker:4000

const WebSocket = require('ws');
const argv = require('minimist')(process.argv.slice(2));
const deviceId = argv.deviceId || 'termux-1';
const broker = argv.broker || 'ws://127.0.0.1:4000';

const ws = new WebSocket(broker + '?role=device');
ws.on('open', () => {
  console.log('connected to broker, registering');
  ws.send(JSON.stringify({ type:'register', role:'device', deviceId }));
});

ws.on('message', (msg) => {
  try {
    const m = JSON.parse(msg.toString());
    if (m.type === 'command' && m.cmd) {
      console.log('execute', m.cmd);
      const { exec } = require('child_process');
      exec(m.cmd, { timeout: 10000 }, (err, stdout, stderr) => {
        ws.send(JSON.stringify({ type:'result', deviceId, id: m.id, ok: !err, stdout: stdout && stdout.toString(), stderr: stderr && stderr.toString() }));
      });
    }
  } catch(e) { console.error(e); }
});
