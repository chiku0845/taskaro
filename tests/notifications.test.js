const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');

test('Deadline notifications correctly detect overdue and upcoming tasks', () => {
  const tasks = [
    { id: 1, title: 'Finish Final Project', due_date: '2026-11-01', due_time: '15:00', status: 'Pending' },
    { id: 2, title: 'Exam Revision', due_date: '2026-11-06', due_time: '10:00', status: 'In Progress' },
    { id: 3, title: 'Submit Assignment', due_date: '2026-11-20', due_time: '18:00', status: 'Pending' },
    { id: 4, title: 'Completed Essay', due_date: '2026-11-01', status: 'Completed' }
  ];

  const simulatedNow = new Date('2026-11-05T12:00:00Z');

  const isOverdue = (t) => {
    if (!t.due_date || t.status === 'Completed') return false;
    const deadline = new Date(`${t.due_date}T${t.due_time || '23:59:59'}Z`);
    return deadline < simulatedNow;
  };

  const isUpcomingSoon = (t) => {
    if (!t.due_date || t.status === 'Completed') return false;
    const deadline = new Date(`${t.due_date}T${t.due_time || '23:59:59'}Z`);
    const diffMs = deadline - simulatedNow;
    return diffMs >= 0 && diffMs <= 3 * 86400000;
  };

  const overdue = tasks.filter(isOverdue);
  const upcoming = tasks.filter(isUpcomingSoon);

  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].title, 'Finish Final Project');

  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].title, 'Exam Revision');
});

test('Notification dismissal marks stored notifications as read', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) => db.run(sql, p, function (err) { err ? reject(err) : resolve(this); }));
  const get = (sql, p = []) =>
    new Promise((resolve, reject) => db.get(sql, p, (err, r) => (err ? reject(err) : resolve(r))));

  await run(`CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert notification
  await run(
    `INSERT INTO notifications (user_id, title, message) VALUES (1, 'Deadline Alert', 'Exam starts tomorrow!')`
  );
  let notice = await get('SELECT * FROM notifications WHERE id=1');
  assert.equal(notice.title, 'Deadline Alert');
  assert.equal(notice.read_at, null);

  // Dismiss / Mark read
  await run(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=1`);
  notice = await get('SELECT * FROM notifications WHERE id=1');
  assert.ok(notice.read_at);
});
