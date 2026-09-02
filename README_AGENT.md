# OpenMinis Agent Integration

This adds the agent integration pieces to the project. Files added:

- src/adapters/agentAdapter.js — WebSocket /agent endpoint for companion agents to connect and register
- src/services/queue.js — in-memory queue + worker that dispatches tasks to connected agents and emits task progress over socket.io
- src/routes/devices.js — REST endpoints to list connected devices and enqueue tasks (tap, swipe, input, screencap, install)
- src/routes/auth.js — token issuance endpoint for agents (protected by ADMIN_KEY)
- src/services/auth.js — JWT sign/verify utilities
- tools/agent-simulate.js — Node-based agent simulator for quick testing
- README_AGENT.md (you may merge README_QUICKSTART content into project's README)

Integration notes:
- Ensure server's main startup attaches these routes and the agentAdapter; sample integration in openminis-key-pool's src/index.js shows how to mount them.
- Add dependencies to package.json: ws, socket.io, jsonwebtoken, axios

Security:
- Agents must authenticate with JWT tokens issued by POST /api/agent/token protected by ADMIN_KEY.
- For production, use TLS and strong AGENT_JWT_SECRET and do not expose ADMIN_KEY.
