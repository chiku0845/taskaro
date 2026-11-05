const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const run = (sql, p = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, p, function (e) {
      e ? reject(e) : resolve({ id: this.lastID, changes: this.changes });
    })
  );

const all = (sql, p = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, p, (e, r) => (e ? reject(e) : resolve(r)))
  );

const get = (sql, p = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, p, (e, r) => (e ? reject(e) : resolve(r)))
  );

const validRepeats = ['once', 'daily', 'weekdays', 'weekends', 'weekly'];

function validate(b) {
  const name = String(b.name || '').trim();
  const date = String(b.date || '');
  const start = String(b.start_time || '');
  const end = String(b.end_time || '');
  const repeat = b.repeat || 'daily';
  const category = String(b.category || 'General').trim().slice(0, 100);
  const taskId = b.task_id ? Number(b.task_id) : null;

  if (!name || name.length > 180) {
    throw Error('Plan name is required (maximum 180 characters).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00'))) {
    throw Error('Choose a valid date.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || end <= start) {
    throw Error('End time must be later than start time.');
  }
  if (!validRepeats.includes(repeat)) {
    throw Error('Invalid repeat option. Choose once, daily, weekdays, weekends, or weekly.');
  }

  return {
    name,
    date,
    start_time: start,
    end_time: end,
    notes: String(b.notes || '').slice(0, 3010),
    repeat,
    category: category || 'General',
    reminder: b.reminder === false ? 0 : 1,
    task_id: Number.isFinite(taskId) ? taskId : null
  };
}

function occursOnDate(p, targetDateStr) {
  const base = new Date(p.date + 'T12:00:00');
  const target = new Date(targetDateStr + 'T12:00:00');
  const daysDiff = Math.round((target - base) / 86400000);
  if (daysDiff < 0 && p.repeat !== 'once') return false;

  const dayOfWeek = target.getDay(); // 0 = Sun, 6 = Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isWeekday = !isWeekend;

  if (p.repeat === 'once') return p.date === targetDateStr;
  if (p.repeat === 'daily') return true;
  if (p.repeat === 'weekdays') return isWeekday;
  if (p.repeat === 'weekends') return isWeekend;
  if (p.repeat === 'weekly') return dayOfWeek === base.getDay();
  return false;
}

function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// GET /api/plans - list all plans with routine log status for a date
router.get('/', async (req, res) => {
  try {
    const targetDate = String(req.query.date || toLocalISO(new Date()));
    const rawPlans = await all('SELECT * FROM plans WHERE user_id=? ORDER BY start_time ASC', [
      req.user.id
    ]);

    // Check if targetDate is a marked skip day
    const skipRecord = await get('SELECT reason FROM skip_days WHERE user_id=? AND date=?', [
      req.user.id,
      targetDate
    ]);

    // Fetch routine logs for targetDate
    const logs = await all(
      'SELECT plan_id, status FROM routine_logs WHERE user_id=? AND date=?',
      [req.user.id, targetDate]
    );
    const logMap = new Map();
    for (const log of logs) {
      logMap.set(log.plan_id, log.status);
    }

    const plans = rawPlans.map((p) => {
      const occurs = occursOnDate(p, targetDate);
      const logStatus = logMap.get(p.id) || 'pending';
      return {
        ...p,
        occurs,
        log_status: logStatus,
        is_completed: logStatus === 'completed',
        is_skipped: logStatus === 'skipped'
      };
    });

    res.json({
      plans,
      date: targetDate,
      is_skip_day: Boolean(skipRecord),
      skip_reason: skipRecord?.reason || null
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not load plans.' });
  }
});

// GET /api/plans/performance - 7-day trend, streak, consistency score & today's progress
router.get('/performance', async (req, res) => {
  try {
    const rawPlans = await all('SELECT * FROM plans WHERE user_id=?', [req.user.id]);
    const skipDays = await all('SELECT date, reason FROM skip_days WHERE user_id=?', [req.user.id]);
    const skipMap = new Map(skipDays.map((s) => [s.date, s.reason]));

    const routineLogs = await all(
      'SELECT plan_id, date, status FROM routine_logs WHERE user_id=?',
      [req.user.id]
    );
    const logMap = new Map(); // key: `${planId}:${date}` -> status
    for (const l of routineLogs) {
      logMap.set(`${l.plan_id}:${l.date}`, l.status);
    }

    const todayObj = new Date();
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Generate last 7 days ending with today
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayObj);
      d.setDate(d.getDate() - i);
      const iso = toLocalISO(d);
      const dayName = dayNames[d.getDay()];

      const scheduled = rawPlans.filter((p) => occursOnDate(p, iso));
      const isSkipDay = skipMap.has(iso);
      const skipReason = skipMap.get(iso) || null;

      let completedCount = 0;
      let skippedCount = 0;

      for (const p of scheduled) {
        const st = logMap.get(`${p.id}:${iso}`);
        if (st === 'completed') completedCount++;
        else if (st === 'skipped') skippedCount++;
      }

      let score = 0;
      if (isSkipDay) {
        score = 100; // Rest days count as 100% adherence (rest is part of the routine)
      } else if (scheduled.length === 0) {
        score = 100; // No scheduled routines
      } else {
        score = Math.round(((completedCount + skippedCount * 0.5) / scheduled.length) * 100);
      }

      days.push({
        date: iso,
        dayName,
        total: scheduled.length,
        completed: completedCount,
        skipped: skippedCount,
        pending: Math.max(0, scheduled.length - completedCount - skippedCount),
        score: Math.min(100, score),
        is_skip_day: isSkipDay,
        skip_reason: skipReason
      });
    }

    // Calculate current streak (consecutive days with score >= 75% or is_skip_day)
    let streak = 0;
    // Check backwards from today (or yesterday if today has not completed tasks yet)
    const todayISO = toLocalISO(todayObj);
    const todaySummary = days[days.length - 1];

    let startIdx = days.length - 1;
    // If today is incomplete with 0 completed tasks and not a skip day, start checking streak from yesterday
    if (todaySummary.completed === 0 && !todaySummary.is_skip_day && todaySummary.total > 0) {
      startIdx = days.length - 2;
    }

    for (let j = startIdx; j >= 0; j--) {
      const d = days[j];
      if (d.is_skip_day || d.score >= 60 || d.total === 0) {
        streak++;
      } else {
        break;
      }
    }

    // Weekly consistency score
    const weeklyScore = Math.round(days.reduce((acc, d) => acc + d.score, 0) / days.length);

    // Total lifetime completed routines
    const totalCompleted = routineLogs.filter((l) => l.status === 'completed').length;

    res.json({
      days,
      streak,
      weekly_score: weeklyScore,
      total_completed: totalCompleted,
      today: todaySummary
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not calculate performance metrics.' });
  }
});

// POST /api/plans/:id/log - tick mark (complete), skip, or reset routine
router.post('/:id/log', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const date = String(req.body.date || toLocalISO(new Date())).trim();
    const status = String(req.body.status || 'completed').toLowerCase();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required.' });
    }
    if (!['completed', 'skipped', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Status must be completed, skipped, or pending.' });
    }

    const plan = await get('SELECT id, name, task_id FROM plans WHERE id=? AND user_id=?', [
      planId,
      req.user.id
    ]);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    if (status === 'pending') {
      await run('DELETE FROM routine_logs WHERE user_id=? AND plan_id=? AND date=?', [
        req.user.id,
        planId,
        date
      ]);
    } else {
      await run(
        `INSERT INTO routine_logs(user_id, plan_id, date, status, updated_at)
         VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, plan_id, date) DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP`,
        [req.user.id, planId, date, status]
      );

      // If routine is linked to a task and completed, sync completion with the task
      if (status === 'completed' && plan.task_id && req.body.sync_task !== false) {
        await run(
          `UPDATE tasks SET status='Completed', completed_at=COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`,
          [plan.task_id, req.user.id]
        );
      }
    }

    res.json({ ok: true, plan_id: planId, date, status, plan_name: plan.name, task_id: plan.task_id });
  } catch (e) {
    res.status(500).json({ error: 'Could not update routine completion status.' });
  }
});

// GET /api/plans/skip-days - get all configured dynamic rest/skip days
router.get('/skip-days', async (req, res) => {
  try {
    const list = await all('SELECT * FROM skip_days WHERE user_id=? ORDER BY date ASC', [req.user.id]);
    res.json({ skip_days: list });
  } catch (e) {
    res.status(500).json({ error: 'Could not load skip days.' });
  }
});

// DELETE /api/plans/skip-days/:date - delete a specific dynamic rest/skip day
router.delete('/skip-days/:date', async (req, res) => {
  try {
    const date = String(req.params.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required.' });
    }
    const r = await run('DELETE FROM skip_days WHERE user_id=? AND date=?', [req.user.id, date]);
    res.json({ ok: true, deleted: Boolean(r.changes), date });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete skip day.' });
  }
});

// POST /api/plans/skip-day - dynamic setup to mark/unmark a rest or skip day
router.post('/skip-day', async (req, res) => {
  try {
    const date = String(req.body.date || toLocalISO(new Date())).trim();
    const reason = String(req.body.reason || 'Rest Day').trim().slice(0, 100);
    const active = req.body.active !== false;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required.' });
    }

    if (active) {
      await run(
        `INSERT INTO skip_days(user_id, date, reason)
         VALUES(?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET reason=excluded.reason`,
        [req.user.id, date, reason]
      );
    } else {
      await run('DELETE FROM skip_days WHERE user_id=? AND date=?', [req.user.id, date]);
    }

    res.json({ ok: true, is_skip_day: active, date, reason: active ? reason : null });
  } catch (e) {
    res.status(500).json({ error: 'Could not update skip day.' });
  }
});

// POST /api/plans - create new plan / routine slot
router.post('/', async (req, res) => {
  try {
    const p = validate(req.body);
    const overlap = await get(
      "SELECT id, name FROM plans WHERE user_id=? AND date=? AND start_time < ? AND end_time > ? AND repeat='once'",
      [req.user.id, p.date, p.end_time, p.start_time]
    );

    const r = await run(
      'INSERT INTO plans(user_id, name, date, start_time, end_time, notes, repeat, reminder, category, task_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, p.name, p.date, p.start_time, p.end_time, p.notes, p.repeat, p.reminder, p.category, p.task_id]
    );

    res.status(201).json({
      plan: { id: r.id, user_id: req.user.id, ...p },
      overlap: overlap ? `This time overlaps with “${overlap.name}”.` : null
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/plans/:id - update existing plan / routine
router.put('/:id', async (req, res) => {
  try {
    const p = validate(req.body);
    const r = await run(
      'UPDATE plans SET name=?, date=?, start_time=?, end_time=?, notes=?, repeat=?, reminder=?, category=?, task_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',
      [
        p.name,
        p.date,
        p.start_time,
        p.end_time,
        p.notes,
        p.repeat,
        p.reminder,
        p.category,
        p.task_id,
        req.params.id,
        req.user.id
      ]
    );
    if (!r.changes) return res.status(404).json({ error: 'Plan not found.' });
    res.json({ plan: { id: Number(req.params.id), user_id: req.user.id, ...p } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/plans/:id - delete plan / routine
router.delete('/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM plans WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!r.changes) return res.status(404).json({ error: 'Plan not found.' });
    // Also clean up routine logs
    await run('DELETE FROM routine_logs WHERE plan_id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ ok: true, message: 'Plan deleted.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete plan.' });
  }
});

module.exports = router;
module.exports.occursOnDate = occursOnDate;
