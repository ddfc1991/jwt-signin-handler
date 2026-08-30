# docs/BROKER_README.md
Broker example and termux client

- examples/broker-server.js: lightweight broker that accepts WebSocket connections from devices (role=device) and agents (role=agent). For demo only.
- examples/termux-client-broker.js: a Termux client that connects to broker and executes received commands.

Usage:
1. Start broker: `node examples/broker-server.js`
2. Start client on device: `node examples/termux-client-broker.js --deviceId=mydevice --broker=ws://broker:4000`
3. Agent can connect as ws://broker:4000?role=agent and send JSON `{ type:'command', deviceId:'mydevice', cmd:'ls /data' }` to execute.

Security note: this demo has minimal auth. For production add JWT/mTLS and ACLs.
