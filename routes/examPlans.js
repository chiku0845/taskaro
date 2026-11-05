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

function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function computeDaysBetween(startStr, endStr) {
  const start = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

function generateDefaultMilestones(durationType, totalDays) {
  if (totalDays <= 45) {
    return [
      { id: 1, title: 'Week 1: Core Fundamentals & Concept Review', targetDay: Math.round(totalDays * 0.25), status: 'in_progress' },
      { id: 2, title: 'Week 2: Deep Dive Practice & Problem Solving', targetDay: Math.round(totalDays * 0.50), status: 'pending' },
      { id: 3, title: 'Week 3: Advanced Topics & Weak Areas', targetDay: Math.round(totalDays * 0.75), status: 'pending' },
      { id: 4, title: 'Week 4: Mock Tests & Final Revision', targetDay: totalDays, status: 'pending' }
    ];
  } else if (totalDays <= 120) {
    return [
      { id: 1, title: 'Month 1: Syllabus Coverage (Phase 1)', targetDay: Math.round(totalDays * 0.33), status: 'in_progress' },
      { id: 2, title: 'Month 2: In-Depth Practice & Second Revision', targetDay: Math.round(totalDays * 0.66), status: 'pending' },
      { id: 3, title: 'Month 3: Full-Length Mocks & Performance Analysis', targetDay: totalDays, status: 'pending' }
    ];
  } else if (totalDays <= 220) {
    return [
      { id: 1, title: 'Phase 1 (Months 1-2): Comprehensive Foundation & Theory', targetDay: Math.round(totalDays * 0.33), status: 'in_progress' },
      { id: 2, title: 'Phase 2 (Months 3-4): Problem Solving & Sectional Tests', targetDay: Math.round(totalDays * 0.66), status: 'pending' },
      { id: 3, title: 'Phase 3 (Months 5-6): Complete Revision, Speed & Mock Papers', targetDay: totalDays, status: 'pending' }
    ];
  } else {
    return [
      { id: 1, title: 'Quarter 1 (Months 1-3): Foundation & Core Syllabus Building', targetDay: Math.round(totalDays * 0.25), status: 'in_progress' },
      { id: 2, title: 'Quarter 2 (Months 4-6): Intermediate Mastery & Topic Tests', targetDay: Math.round(totalDays * 0.50), status: 'pending' },
      { id: 3, title: 'Quarter 3 (Months 7-9): Advanced Application & Integrated Practice', targetDay: Math.round(totalDays * 0.75), status: 'pending' },
      { id: 4, title: 'Quarter 4 (Months 10-12): Intensive Mock Drills, PYQs & Peak Readiness', targetDay: totalDays, status: 'pending' }
    ];
  }
}

// GET /api/exam-plans - list all exam / long-term plans with summary metrics
router.get('/', async (req, res) => {
  try {
    const plans = await all(
      'SELECT * FROM exam_plans WHERE user_id=? ORDER BY status ASC, target_date ASC',
      [req.user.id]
    );

    const todayISO = toLocalISO(new Date());

    const result = await Promise.all(
      plans.map(async (p) => {
        let milestones = [];
        try {
          milestones = JSON.parse(p.milestones || '[]');
        } catch {
          milestones = [];
        }

        // Calculate days elapsed and remaining
        const startDate = new Date(p.start_date + 'T12:00:00');
        const targetDate = new Date(p.target_date + 'T12:00:00');
        const todayDate = new Date(todayISO + 'T12:00:00');

        const elapsedDays = Math.max(0, Math.round((todayDate - startDate) / 86400000) + 1);
        const daysLeft = Math.round((targetDate - todayDate) / 86400000);
        const currentDayNumber = Math.min(p.total_days, Math.max(1, elapsedDays));

        // Aggregate activities
        const activities = await all(
          'SELECT date, is_completed, target_minutes FROM exam_activities WHERE plan_id=? AND user_id=?',
          [p.id, req.user.id]
        );

        const totalActivities = activities.length;
        const completedActivities = activities.filter((a) => a.is_completed === 1).length;
        const todayActivities = activities.filter((a) => a.date === todayISO);
        const todayCompleted = todayActivities.filter((a) => a.is_completed === 1).length;

        const totalMinutesLogged = activities
          .filter((a) => a.is_completed === 1)
          .reduce((sum, a) => sum + (a.target_minutes || 0), 0);

        const progressPct =
          totalActivities > 0
            ? Math.round((completedActivities / totalActivities) * 100)
            : Math.min(100, Math.round((currentDayNumber / p.total_days) * 100));

        return {
          ...p,
          milestones,
          current_day_number: currentDayNumber,
          days_left: daysLeft,
          is_exam_today: daysLeft === 0,
          is_past_exam: daysLeft < 0,
          total_activities: totalActivities,
          completed_activities: completedActivities,
          today_total: todayActivities.length,
          today_completed: todayCompleted,
          total_hours_logged: (totalMinutesLogged / 60).toFixed(1),
          progress_pct: progressPct
        };
      })
    );

    res.json({ plans: result, today: todayISO });
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch exam plans: ' + e.message });
  }
});

// POST /api/exam-plans - create a new exam / long-term plan
router.post('/', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const category = String(req.body.category || 'Exam').trim().slice(0, 50);
    const durationType = String(req.body.duration_type || '1month').trim();
    let startDate = String(req.body.start_date || toLocalISO(new Date())).trim();
    let targetDate = String(req.body.target_date || '').trim();
    const dailyHours = Math.max(0.5, Math.min(18, Number(req.body.daily_hours || 4)));
    const description = String(req.body.description || '').trim().slice(0, 3000);

    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'Plan title is required (maximum 200 characters).' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({ error: 'Valid start date (YYYY-MM-DD) is required.' });
    }

    // Auto-calculate target date if preset duration is chosen and targetDate is empty
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      const s = new Date(startDate + 'T12:00:00');
      let addDays = 30;
      if (durationType === '1month') addDays = 30;
      else if (durationType === '3months') addDays = 90;
      else if (durationType === '6months') addDays = 180;
      else if (durationType === '12months') addDays = 365;
      s.setDate(s.getDate() + addDays);
      targetDate = toLocalISO(s);
    }

    const totalDays = computeDaysBetween(startDate, targetDate);
    if (totalDays < 1) {
      return res.status(400).json({ error: 'Target / Exam date must be on or after start date.' });
    }

    let milestones = [];
    if (req.body.milestones && Array.isArray(req.body.milestones) && req.body.milestones.length > 0) {
      milestones = req.body.milestones;
    } else {
      milestones = generateDefaultMilestones(durationType, totalDays);
    }

    const milestonesJson = JSON.stringify(milestones);

    const r = await run(
      `INSERT INTO exam_plans(user_id, title, category, duration_type, start_date, target_date, total_days, daily_hours, description, milestones, status)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [req.user.id, title, category, durationType, startDate, targetDate, totalDays, dailyHours, description, milestonesJson]
    );

    res.status(201).json({
      ok: true,
      plan: {
        id: r.id,
        user_id: req.user.id,
        title,
        category,
        duration_type: durationType,
        start_date: startDate,
        target_date: targetDate,
        total_days: totalDays,
        daily_hours: dailyHours,
        description,
        milestones,
        status: 'active'
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not create exam plan: ' + e.message });
  }
});

// GET /api/exam-plans/:id - get single plan details with activities & heatmap
router.get('/:id', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const plan = await get('SELECT * FROM exam_plans WHERE id=? AND user_id=?', [planId, req.user.id]);
    if (!plan) return res.status(404).json({ error: 'Exam plan not found.' });

    let milestones = [];
    try {
      milestones = JSON.parse(plan.milestones || '[]');
    } catch {
      milestones = [];
    }

    const todayISO = toLocalISO(new Date());
    const targetDateQuery = String(req.query.date || todayISO);

    // Fetch activities for requested date
    const activitiesForDate = await all(
      'SELECT * FROM exam_activities WHERE plan_id=? AND user_id=? AND date=? ORDER BY is_completed ASC, id ASC',
      [planId, req.user.id, targetDateQuery]
    );

    // Fetch all activities for overview / heatmap
    const allActivities = await all(
      'SELECT id, date, is_completed, target_minutes, subject FROM exam_activities WHERE plan_id=? AND user_id=?',
      [planId, req.user.id]
    );

    // Heatmap aggregation map: date -> { total, completed, minutes }
    const heatmap = {};
    for (const a of allActivities) {
      if (!heatmap[a.date]) heatmap[a.date] = { total: 0, completed: 0, minutes: 0 };
      heatmap[a.date].total++;
      if (a.is_completed) {
        heatmap[a.date].completed++;
        heatmap[a.date].minutes += a.target_minutes || 0;
      }
    }

    const startDate = new Date(plan.start_date + 'T12:00:00');
    const targetDate = new Date(plan.target_date + 'T12:00:00');
    const todayDate = new Date(todayISO + 'T12:00:00');

    const elapsedDays = Math.max(0, Math.round((todayDate - startDate) / 86400000) + 1);
    const daysLeft = Math.round((targetDate - todayDate) / 86400000);
    const currentDayNumber = Math.min(plan.total_days, Math.max(1, elapsedDays));

    const totalActivities = allActivities.length;
    const completedActivities = allActivities.filter((a) => a.is_completed === 1).length;
    const progressPct =
      totalActivities > 0
        ? Math.round((completedActivities / totalActivities) * 100)
        : Math.min(100, Math.round((currentDayNumber / plan.total_days) * 100));

    res.json({
      plan: {
        ...plan,
        milestones,
        current_day_number: currentDayNumber,
        days_left: daysLeft,
        is_exam_today: daysLeft === 0,
        is_past_exam: daysLeft < 0,
        total_activities: totalActivities,
        completed_activities: completedActivities,
        progress_pct: progressPct
      },
      selected_date: targetDateQuery,
      activities: activitiesForDate,
      heatmap
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch plan details: ' + e.message });
  }
});

// PUT /api/exam-plans/:id - update plan details & milestones
router.put('/:id', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const plan = await get('SELECT * FROM exam_plans WHERE id=? AND user_id=?', [planId, req.user.id]);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const title = req.body.title !== undefined ? String(req.body.title).trim() : plan.title;
    const category = req.body.category !== undefined ? String(req.body.category).trim() : plan.category;
    const targetDate = req.body.target_date !== undefined ? String(req.body.target_date).trim() : plan.target_date;
    const dailyHours = req.body.daily_hours !== undefined ? Number(req.body.daily_hours) : plan.daily_hours;
    const description = req.body.description !== undefined ? String(req.body.description).trim() : plan.description;
    const status = req.body.status !== undefined ? String(req.body.status).trim() : plan.status;
    
    let milestonesJson = plan.milestones;
    if (req.body.milestones) {
      milestonesJson = JSON.stringify(req.body.milestones);
    }

    const totalDays = computeDaysBetween(plan.start_date, targetDate);

    await run(
      `UPDATE exam_plans
       SET title=?, category=?, target_date=?, total_days=?, daily_hours=?, description=?, milestones=?, status=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND user_id=?`,
      [title, category, targetDate, totalDays, dailyHours, description, milestonesJson, status, planId, req.user.id]
    );

    res.json({ ok: true, message: 'Plan updated.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not update plan: ' + e.message });
  }
});

// DELETE /api/exam-plans/:id - delete plan
router.delete('/:id', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const r = await run('DELETE FROM exam_plans WHERE id=? AND user_id=?', [planId, req.user.id]);
    if (!r.changes) return res.status(404).json({ error: 'Plan not found.' });
    await run('DELETE FROM exam_activities WHERE plan_id=? AND user_id=?', [planId, req.user.id]);
    res.json({ ok: true, message: 'Exam plan and all its activities deleted.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete exam plan: ' + e.message });
  }
});

// POST /api/exam-plans/:id/activities - add daily activity
router.post('/:id/activities', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const plan = await get('SELECT id FROM exam_plans WHERE id=? AND user_id=?', [planId, req.user.id]);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const title = String(req.body.title || '').trim();
    const subject = String(req.body.subject || '').trim().slice(0, 100);
    const date = String(req.body.date || toLocalISO(new Date())).trim();
    const targetMinutes = Math.max(5, Math.min(1440, Number(req.body.target_minutes || 60)));
    const notes = String(req.body.notes || '').trim().slice(0, 1000);

    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'Activity title is required (maximum 200 characters).' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required.' });
    }

    const r = await run(
      `INSERT INTO exam_activities(plan_id, user_id, date, title, subject, target_minutes, is_completed, notes)
       VALUES(?, ?, ?, ?, ?, ?, 0, ?)`,
      [planId, req.user.id, date, title, subject, targetMinutes, notes]
    );

    res.status(201).json({
      ok: true,
      activity: {
        id: r.id,
        plan_id: planId,
        user_id: req.user.id,
        date,
        title,
        subject,
        target_minutes: targetMinutes,
        is_completed: 0,
        notes
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not add activity: ' + e.message });
  }
});

// PUT /api/exam-plans/:id/activities/:activityId - update activity (e.g. toggle completion)
router.put('/:id/activities/:activityId', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const actId = Number(req.params.activityId);

    const act = await get(
      'SELECT * FROM exam_activities WHERE id=? AND plan_id=? AND user_id=?',
      [actId, planId, req.user.id]
    );
    if (!act) return res.status(404).json({ error: 'Activity not found.' });

    const isCompleted =
      req.body.is_completed !== undefined ? (req.body.is_completed ? 1 : 0) : act.is_completed;
    const title = req.body.title !== undefined ? String(req.body.title).trim() : act.title;
    const subject = req.body.subject !== undefined ? String(req.body.subject).trim() : act.subject;
    const targetMinutes =
      req.body.target_minutes !== undefined ? Number(req.body.target_minutes) : act.target_minutes;
    const notes = req.body.notes !== undefined ? String(req.body.notes).trim() : act.notes;
    const completedAt = isCompleted ? (act.completed_at || new Date().toISOString()) : null;

    await run(
      `UPDATE exam_activities
       SET is_completed=?, completed_at=?, title=?, subject=?, target_minutes=?, notes=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND plan_id=? AND user_id=?`,
      [isCompleted, completedAt, title, subject, targetMinutes, notes, actId, planId, req.user.id]
    );

    res.json({
      ok: true,
      activity: {
        ...act,
        is_completed: isCompleted,
        completed_at: completedAt,
        title,
        subject,
        target_minutes: targetMinutes,
        notes
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not update activity: ' + e.message });
  }
});

// DELETE /api/exam-plans/:id/activities/:activityId - delete single activity
router.delete('/:id/activities/:activityId', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const actId = Number(req.params.activityId);

    const r = await run(
      'DELETE FROM exam_activities WHERE id=? AND plan_id=? AND user_id=?',
      [actId, planId, req.user.id]
    );
    if (!r.changes) return res.status(404).json({ error: 'Activity not found.' });

    res.json({ ok: true, message: 'Activity deleted.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete activity: ' + e.message });
  }
});

// POST /api/exam-plans/:id/backlog - shift incomplete past/today activities to a new date
router.post('/:id/backlog', async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const targetDate = String(req.body.to_date || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return res.status(400).json({ error: 'Valid target date (YYYY-MM-DD) is required.' });
    }

    const todayISO = toLocalISO(new Date());

    const r = await run(
      `UPDATE exam_activities
       SET date=?, updated_at=CURRENT_TIMESTAMP
       WHERE plan_id=? AND user_id=? AND is_completed=0 AND date <= ?`,
      [targetDate, planId, req.user.id, todayISO]
    );

    res.json({
      ok: true,
      shifted_count: r.changes,
      to_date: targetDate,
      message: `${r.changes} incomplete activities shifted to ${targetDate}.`
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not shift backlog: ' + e.message });
  }
});

module.exports = router;
