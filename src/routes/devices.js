// src/routes/devices.js
// REST endpoints to list devices and create tasks

module.exports = function({ db, agentAdapter, queue, io }) {
  const express = require('express');
  const router = express.Router();

  // list connected agents
  router.get('/', async (req, res) => {
    const agents = agentAdapter.listAgents();
    res.json(agents);
  });

  // send a task to a device (tap, swipe, input, screencap, install)
  router.post('/:deviceId/tasks', async (req, res) => {
    const deviceId = req.params.deviceId;
    const { type, payload } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });
    // enqueue
    const taskId = queue.enqueue({ deviceId, type, payload });
    res.status(202).json({ taskId });
  });

  // get task status (best-effort)
  router.get('/tasks/:taskId', async (req, res) => {
    const task = queue.getStatus(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });
    res.json(task);
  });

  return router;
};
