const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');

test('exam_plans and exam_activities tables create and relate correctly', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) => db.run(sql, p, function (err) { err ? reject(err) : resolve(this); }));
  const get = (sql, p = []) =>
    new Promise((resolve, reject) => db.get(sql, p, (err, row) => (err ? reject(err) : resolve(row))));

  await run('PRAGMA foreign_keys = ON');

  await run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  )`);

  await run(`CREATE TABLE exam_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Exam',
    duration_type TEXT NOT NULL DEFAULT '1month',
    start_date TEXT NOT NULL,
    target_date TEXT NOT NULL,
    total_days INTEGER NOT NULL,
    daily_hours REAL DEFAULT 4,
    description TEXT DEFAULT '',
    milestones TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await run(`CREATE TABLE exam_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT DEFAULT '',
    target_minutes INTEGER DEFAULT 60,
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    notes TEXT DEFAULT '',
    FOREIGN KEY(plan_id) REFERENCES exam_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Insert user
  await run('INSERT INTO users(name, email) VALUES(?, ?)', ['Student', 'student@taskaro.com']);

  // Insert 12-month exam plan
  const planResult = await run(
    `INSERT INTO exam_plans(user_id, title, category, duration_type, start_date, target_date, total_days, daily_hours, milestones)
     VALUES(1, 'UPSC CSE 2027', 'Exam', '12months', '2026-11-01', '2027-10-31', 365, 6, '[]')`
  );
  assert.equal(planResult.lastID, 1);

  // Insert daily activities
  await run(
    `INSERT INTO exam_activities(plan_id, user_id, date, title, subject, target_minutes, is_completed)
     VALUES(1, 1, '2026-11-05', 'Polity Fundamental Rights', 'Polity', 90, 1)`
  );
  await run(
    `INSERT INTO exam_activities(plan_id, user_id, date, title, subject, target_minutes, is_completed)
     VALUES(1, 1, '2026-11-05', 'Modern History Chapter 3', 'History', 60, 0)`
  );

  const plan = await get('SELECT * FROM exam_plans WHERE id=1');
  assert.equal(plan.title, 'UPSC CSE 2027');
  assert.equal(plan.total_days, 365);

  const doneCount = await get(
    'SELECT count(*) as count FROM exam_activities WHERE plan_id=1 AND is_completed=1'
  );
  assert.equal(doneCount.count, 1);

  // Test Cascade Deletion
  await run('DELETE FROM exam_plans WHERE id=1');
  const activitiesCount = await get('SELECT count(*) as count FROM exam_activities WHERE plan_id=1');
  assert.equal(activitiesCount.count, 0);
});

test('exam plan countdown and progress calculation logic', () => {
  const calculateMetrics = (startDateStr, targetDateStr, totalDays, totalActs, completedActs, todayStr) => {
    const start = new Date(startDateStr + 'T12:00:00');
    const target = new Date(targetDateStr + 'T12:00:00');
    const today = new Date(todayStr + 'T12:00:00');

    const elapsedDays = Math.max(0, Math.round((today - start) / 86400000) + 1);
    const daysLeft = Math.round((target - today) / 86400000);
    const currentDay = Math.min(totalDays, Math.max(1, elapsedDays));
    const progressPct = totalActs > 0 ? Math.round((completedActs / totalActs) * 100) : 0;

    return { elapsedDays, daysLeft, currentDay, progressPct };
  };

  const m = calculateMetrics('2026-11-01', '2026-11-30', 30, 10, 5, '2026-11-15');
  assert.equal(m.daysLeft, 15);
  assert.equal(m.currentDay, 15);
  assert.equal(m.progressPct, 50);
});

test('backlog shifting updates incomplete tasks to new target date', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) => db.run(sql, p, function (err) { err ? reject(err) : resolve(this); }));
  const all = (sql, p = []) =>
    new Promise((resolve, reject) => db.all(sql, p, (err, rows) => (err ? reject(err) : resolve(rows))));

  await run(`CREATE TABLE exam_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0
  )`);

  // Insert 1 completed and 2 incomplete activities on or before 2026-11-05
  await run('INSERT INTO exam_activities(plan_id, user_id, date, title, is_completed) VALUES(1, 1, "2026-11-04", "Past Task 1", 0)');
  await run('INSERT INTO exam_activities(plan_id, user_id, date, title, is_completed) VALUES(1, 1, "2026-11-05", "Today Task 2", 0)');
  await run('INSERT INTO exam_activities(plan_id, user_id, date, title, is_completed) VALUES(1, 1, "2026-11-05", "Done Task 3", 1)');

  // Shift incomplete activities on or before 2026-11-05 to tomorrow 2026-11-06
  const shiftRes = await run(
    `UPDATE exam_activities
     SET date=?
     WHERE plan_id=? AND user_id=? AND is_completed=0 AND date <= ?`,
    ['2026-11-06', 1, 1, '2026-11-05']
  );

  assert.equal(shiftRes.changes, 2);

  const tomorrowTasks = await all('SELECT * FROM exam_activities WHERE date="2026-11-06"');
  assert.equal(tomorrowTasks.length, 2);

  const doneTask = await all('SELECT * FROM exam_activities WHERE is_completed=1');
  assert.equal(doneTask[0].date, '2026-11-05'); // completed task stays on original date
});

