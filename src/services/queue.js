// src/services/queue.js
// Simple in-memory job queue with a worker that sends commands to agents via agentAdapter

const EventEmitter = require('events');

module.exports = function createQueue({ agentAdapter, io, db }) {
  const q = [];
  const ev = new EventEmitter();
  const running = new Map();

  function enqueue(task) {
    const id = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    q.push(Object.assign({ id, status: 'queued', createdAt: Date.now() }, task));
    ev.emit('enqueue');
    return id;
  }

  async function workerLoop() {
    while (true) {
      if (q.length === 0) {
        await new Promise((res) => ev.once('enqueue', res));
      }
      const task = q.shift();
      if (!task) continue;
      running.set(task.id, task);
      task.status = 'running';
      io.emit(`task:${task.id}`, { status: 'running' });
      try {
        // send command to agent
        const res = await agentAdapter.sendCommand(task.deviceId, { action: task.type, payload: task.payload || {} });
        task.status = 'success';
        task.result = res;
        io.emit(`task:${task.id}`, { status: 'success', result: res });
      } catch (e) {
        task.status = 'failed';
        task.error = e.message;
        io.emit(`task:${task.id}`, { status: 'failed', error: e.message });
      }
      running.delete(task.id);
    }
  }

  // start worker
  workerLoop();

  function getStatus(taskId) {
    return running.get(taskId) || q.find(t => t.id === taskId);
  }

  return { enqueue, getStatus };
};
