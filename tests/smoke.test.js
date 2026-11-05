const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');

test('task status and overdue rules preserve late-completion history', () => {
  const isOverdue = (task, now = new Date('2026-10-26T12:00:00Z')) => {
    if (!task.due_date) return false;
    const deadline = new Date(task.due_date + 'T23:59:59Z');
    if (deadline >= now) return false;
    return task.status !== 'Completed' || Boolean(task.completed_at && new Date(task.completed_at) > deadline);
  };
  assert.equal(isOverdue({ status: 'Pending', due_date: '2026-10-20' }), true);
  assert.equal(isOverdue({ status: 'In Progress', due_date: '2026-10-30' }), false);
  assert.equal(
    isOverdue({ status: 'Completed', due_date: '2026-10-20', completed_at: '2026-10-21T12:00:00Z' }),
    true
  );
  assert.equal(
    isOverdue({ status: 'Completed', due_date: '2026-10-20', completed_at: '2026-10-19T12:00:00Z' }),
    false
  );
  assert.equal(isOverdue({ status: 'Pending', due_date: '' }), false);
});

test('completion percentage handles zero tasks', () => {
  const percent = (completed, total) => (total ? Math.round((completed / total) * 100) : 0);
  assert.equal(percent(0, 0), 0);
  assert.equal(percent(2, 4), 50);
  assert.equal(percent(3, 3), 100);
});

test('overdue task SQL filter query parses and executes without syntax error', async () => {
  const db = new sqlite3.Database(':memory:');
  const sql = `
    SELECT * FROM (
      SELECT 'Test' as title, '2026-10-01' as due_date, 'Pending' as status, '' as completed_at
    )
    WHERE due_date IS NOT NULL AND due_date!='' AND (
      (status!='Completed' AND due_date < date('now','localtime')) OR
      (status='Completed' AND completed_at IS NOT NULL AND datetime(completed_at) > datetime(due_date || ' 23:59:59'))
    )
  `;
  await new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) return reject(err);
      assert.equal(Array.isArray(rows), true);
      resolve();
    });
  });
});

test('durationText helper formats hour and minute intervals correctly', () => {
  function durationText(start, end) {
    if (!start || !end || end <= start) return 'End time must be later than start time';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let m = eh * 60 + em - (sh * 60 + sm);
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    return `${hours ? hours + ' hour' + (hours === 1 ? '' : 's') : ''}${
      hours && mins ? ' ' : ''
    }${mins ? mins + ' minutes' : ''}`.trim();
  }

  assert.equal(durationText('09:00', '10:30'), '1 hour 30 minutes');
  assert.equal(durationText('09:00', '10:00'), '1 hour');
  assert.equal(durationText('09:00', '09:45'), '45 minutes');
  assert.equal(durationText('10:00', '09:00'), 'End time must be later than start time');
});
