const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { occursOnDate } = require('../routes/plans');

test('occursOnDate accurately checks repeat frequencies', () => {
  const dailyPlan = { date: '2026-10-01', repeat: 'daily' };
  assert.equal(occursOnDate(dailyPlan, '2026-10-27'), true);
  assert.equal(occursOnDate(dailyPlan, '2026-10-28'), true);

  const oncePlan = { date: '2026-10-27', repeat: 'once' };
  assert.equal(occursOnDate(oncePlan, '2026-10-27'), true);
  assert.equal(occursOnDate(oncePlan, '2026-10-28'), false);

  // 2026-10-27 is Tuesday (weekday), 2026-10-31 is Saturday (weekend)
  const weekdaysPlan = { date: '2026-10-01', repeat: 'weekdays' };
  assert.equal(occursOnDate(weekdaysPlan, '2026-10-27'), true); // Tuesday
  assert.equal(occursOnDate(weekdaysPlan, '2026-10-31'), false); // Saturday

  const weekendsPlan = { date: '2026-10-01', repeat: 'weekends' };
  assert.equal(occursOnDate(weekendsPlan, '2026-10-27'), false);
  assert.equal(occursOnDate(weekendsPlan, '2026-10-31'), true);

  // Weekly plan base is Tuesday 2026-10-20
  const weeklyPlan = { date: '2026-10-20', repeat: 'weekly' };
  assert.equal(occursOnDate(weeklyPlan, '2026-10-27'), true); // Next Tuesday
  assert.equal(occursOnDate(weeklyPlan, '2026-10-28'), false); // Wednesday
});

test('skip day protects consistency score and streaks', () => {
  // If date is a skip day, score is 100% adherence (rest is part of the routine)
  function calculateDayScore(scheduledTotal, completedCount, skippedCount, isSkipDay) {
    if (isSkipDay) return 100;
    if (scheduledTotal === 0) return 100;
    return Math.min(100, Math.round(((completedCount + skippedCount * 0.5) / scheduledTotal) * 100));
  }

  assert.equal(calculateDayScore(4, 0, 0, true), 100); // 100% on Rest Day
  assert.equal(calculateDayScore(4, 4, 0, false), 100);
  assert.equal(calculateDayScore(4, 2, 0, false), 50);
  assert.equal(calculateDayScore(4, 2, 2, false), 75);
});

test('skip_days table supports dynamic creation and deletion', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.run(sql, p, function (err) {
        err ? reject(err) : resolve({ id: this.lastID, changes: this.changes });
      })
    );
  const all = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.all(sql, p, (err, rows) => (err ? reject(err) : resolve(rows)))
    );

  await run(`CREATE TABLE skip_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    reason TEXT DEFAULT 'Rest Day',
    UNIQUE(user_id, date)
  )`);

  // Insert a skip day
  await run('INSERT INTO skip_days(user_id, date, reason) VALUES(?, ?, ?)', [
    1,
    '2026-10-28',
    'Rest & Recovery'
  ]);
  let rows = await all('SELECT * FROM skip_days WHERE user_id=?', [1]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-28');
  assert.equal(rows[0].reason, 'Rest & Recovery');

  // Upsert/update reason
  await run(
    `INSERT INTO skip_days(user_id, date, reason) VALUES(?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET reason=excluded.reason`,
    [1, '2026-10-28', 'Vacation']
  );
  rows = await all('SELECT * FROM skip_days WHERE user_id=?', [1]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, 'Vacation');

  // Delete the skip day
  const delRes = await run('DELETE FROM skip_days WHERE user_id=? AND date=?', [1, '2026-10-28']);
  assert.equal(delRes.changes, 1);
  rows = await all('SELECT * FROM skip_days WHERE user_id=?', [1]);
  assert.equal(rows.length, 0);
});

test('plans table supports task_id foreign link', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.run(sql, p, function (err) {
        err ? reject(err) : resolve({ id: this.lastID, changes: this.changes });
      })
    );
  const get = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.get(sql, p, (err, row) => (err ? reject(err) : resolve(row)))
    );

  await run(`CREATE TABLE plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notes TEXT DEFAULT '',
    repeat TEXT NOT NULL DEFAULT 'daily',
    reminder INTEGER NOT NULL DEFAULT 1,
    category TEXT DEFAULT 'General',
    task_id INTEGER
  )`);

  const res = await run(
    `INSERT INTO plans(user_id, name, date, start_time, end_time, task_id)
     VALUES(?, ?, ?, ?, ?, ?)`,
    [1, 'Complete Project Report', '2026-10-27', '14:00', '15:30', 42]
  );
  assert.equal(res.id, 1);

  const plan = await get('SELECT * FROM plans WHERE id=?', [1]);
  assert.equal(plan.task_id, 42);
  assert.equal(plan.name, 'Complete Project Report');
});
