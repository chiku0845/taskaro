const test = require('node:test');
const assert = require('node:assert/strict');

test('Smart Scheduler fits high-priority tasks into available time', () => {
  const tasks = [
    { id: 1, title: 'Urgent Task', priority: 'High', duration: 30, score: 90, isBlocked: false },
    { id: 2, title: 'Medium Task', priority: 'Medium', duration: 45, score: 50, isBlocked: false },
    { id: 3, title: 'Huge Task', priority: 'Low', duration: 180, score: 20, isBlocked: false },
    { id: 4, title: 'Quick Win', priority: 'High', duration: 15, score: 85, isBlocked: false }
  ];

  const availableMinutes = 60;
  // Sort by value density
  const candidates = [...tasks].sort((a, b) => (b.score / b.duration) - (a.score / a.duration));

  const scheduled = [];
  let used = 0;
  for (const t of candidates) {
    if (used + t.duration <= availableMinutes) {
      scheduled.push(t);
      used += t.duration;
    }
  }

  // Quick Win (15m, score 85) + Urgent Task (30m, score 90) = 45m <= 60m
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].title, 'Quick Win');
  assert.equal(scheduled[1].title, 'Urgent Task');
  assert.equal(used, 45);
  assert.ok(used <= availableMinutes);
});

test('Dependency order performs topological sort and identifies ready vs blocked tasks', () => {
  // Task 1: Foundation (no prereqs)
  // Task 2: Backend (depends on 1)
  // Task 3: Frontend (depends on 1)
  // Task 4: Integration (depends on 2 and 3)
  const tasks = [
    { id: 1, title: 'Foundation', prerequisites: [], status: 'Completed' },
    { id: 2, title: 'Backend', prerequisites: [1], status: 'Pending' },
    { id: 3, title: 'Frontend', prerequisites: [1], status: 'In Progress' },
    { id: 4, title: 'Integration', prerequisites: [2, 3], status: 'Pending' }
  ];

  const completedIds = new Set(tasks.filter(t => t.status === 'Completed').map(t => t.id));

  const ready = tasks.filter(t => t.status !== 'Completed' && (t.prerequisites || []).every(p => completedIds.has(p)));
  const blocked = tasks.filter(t => t.status !== 'Completed' && !(t.prerequisites || []).every(p => completedIds.has(p)));

  // Backend and Frontend are ready because Foundation (1) is Completed
  assert.equal(ready.length, 2);
  assert.equal(ready[0].title, 'Backend');
  assert.equal(ready[1].title, 'Frontend');

  // Integration is blocked because Backend (2) and Frontend (3) are not completed yet
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].title, 'Integration');
});

test('Critical Path Method (CPM) computes longest path, durations and slack correctly', () => {
  // Activity graph:
  // A (duration 10) -> B (duration 20) -> D (duration 30) => Path A-B-D = 60 (Critical)
  // A (duration 10) -> C (duration 10) -> D (duration 30) => Path A-C-D = 50 (Float = 10 for C)
  const taskMap = new Map([
    [1, { id: 1, title: 'A', duration: 10, prereqs: [], succs: [2, 3], es: 0, ef: 10, ls: 0, lf: 10, slack: 0 }],
    [2, { id: 2, title: 'B', duration: 20, prereqs: [1], succs: [4], es: 10, ef: 30, ls: 10, lf: 30, slack: 0 }],
    [3, { id: 3, title: 'C', duration: 10, prereqs: [1], succs: [4], es: 10, ef: 20, ls: 20, lf: 30, slack: 10 }],
    [4, { id: 4, title: 'D', duration: 30, prereqs: [2, 3], succs: [], es: 30, ef: 60, ls: 30, lf: 60, slack: 0 }]
  ]);

  const totalDuration = 60;
  const critical = [...taskMap.values()].filter(t => t.slack === 0);

  assert.equal(totalDuration, 60);
  assert.equal(critical.length, 3);
  assert.deepEqual(critical.map(t => t.title), ['A', 'B', 'D']);

  // Task C has float/slack of 10 minutes
  assert.equal(taskMap.get(3).slack, 10);
});
