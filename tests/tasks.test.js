const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { normalize, row } = require('../routes/tasks');

test('normalize validates effort_estimate, due_time, and prerequisites', () => {
  const valid = normalize({
    title: 'Design TaskMind Architecture',
    due_date: '2026-11-15',
    due_time: '14:30',
    priority: 'High',
    status: 'In Progress',
    category: 'Architecture',
    effort_estimate: 4,
    prerequisites: [1, 2]
  });

  assert.equal(valid.title, 'Design TaskMind Architecture');
  assert.equal(valid.due_time, '14:30');
  assert.equal(valid.effort_estimate, 4);
  assert.equal(valid.prerequisites, '[1,2]');

  assert.throws(() => normalize({ title: '' }), /Title is required/);
  assert.throws(() => normalize({ title: 'A', due_time: '99:99' }), /Due time must be in HH:MM format/);
  assert.throws(() => normalize({ title: 'A', effort_estimate: 10 }), /Effort estimate must be between 1 and 5/);
});

test('Task CRUD, reopen, and Clear All operations in SQLite', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) => db.run(sql, p, function (err) { err ? reject(err) : resolve(this); }));
  const all = (sql, p = []) =>
    new Promise((resolve, reject) => db.all(sql, p, (err, rows) => (err ? reject(err) : resolve(rows))));
  const get = (sql, p = []) =>
    new Promise((resolve, reject) => db.get(sql, p, (err, r) => (err ? reject(err) : resolve(r))));

  await run(`CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    due_date TEXT,
    due_time TEXT,
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Pending',
    category TEXT DEFAULT 'General',
    estimated_minutes INTEGER,
    effort_estimate INTEGER DEFAULT 3,
    prerequisites TEXT DEFAULT '[]',
    subtasks TEXT DEFAULT '[]',
    completed_at TEXT
  )`);

  // 1. Create task
  await run(
    `INSERT INTO tasks(user_id, title, due_date, due_time, priority, status, effort_estimate, prerequisites)
     VALUES(1, 'Task Alpha', '2026-11-20', '10:00', 'High', 'Pending', 4, '[2]')`
  );
  let task = await get('SELECT * FROM tasks WHERE id=1');
  assert.equal(task.title, 'Task Alpha');
  assert.equal(task.due_time, '10:00');
  assert.equal(task.effort_estimate, 4);

  // 2. Complete task
  await run("UPDATE tasks SET status='Completed', completed_at=CURRENT_TIMESTAMP WHERE id=1");
  task = await get('SELECT * FROM tasks WHERE id=1');
  assert.equal(task.status, 'Completed');
  assert.ok(task.completed_at);

  // 3. Reopen completed task
  await run("UPDATE tasks SET status='Pending', completed_at=NULL WHERE id=1");
  task = await get('SELECT * FROM tasks WHERE id=1');
  assert.equal(task.status, 'Pending');
  assert.equal(task.completed_at, null);

  // 4. Insert second task & test Clear All
  await run(
    `INSERT INTO tasks(user_id, title, status) VALUES(1, 'Task Beta', 'Pending')`
  );
  let list = await all('SELECT * FROM tasks WHERE user_id=1');
  assert.equal(list.length, 2);

  // Clear All Tasks
  const clearResult = await run('DELETE FROM tasks WHERE user_id=1');
  assert.equal(clearResult.changes, 2);

  list = await all('SELECT * FROM tasks WHERE user_id=1');
  assert.equal(list.length, 0);
});
