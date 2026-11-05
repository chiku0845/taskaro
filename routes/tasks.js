const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const run = (sql, p = []) =>
  new Promise((r, j) =>
    db.run(sql, p, function (e) {
      e ? j(e) : r({ id: this.lastID, changes: this.changes });
    })
  );

const all = (sql, p = []) =>
  new Promise((r, j) =>
    db.all(sql, p, (e, rows) => (e ? j(e) : r(rows)))
  );

const get = (sql, p = []) =>
  new Promise((r, j) =>
    db.get(sql, p, (e, row) => (e ? j(e) : r(row)))
  );

const priorities = ['High', 'Medium', 'Low'];
const statuses = ['Pending', 'In Progress', 'Completed'];

function normalize(body, partial = false) {
  const out = {};
  if (!partial || body.title !== undefined) {
    out.title = String(body.title || '').trim();
    if (out.title.length < 1 || out.title.length > 180) {
      throw Error('Title is required and must be under 180 characters.');
    }
  }

  for (const k of ['description', 'start_date', 'due_date', 'category']) {
    if (body[k] !== undefined) {
      out[k] = String(body[k] || '').trim().slice(0, k === 'description' ? 5000 : 120);
    }
  }

  if (body.priority !== undefined || !partial) {
    out.priority = body.priority || 'Medium';
    if (!priorities.includes(out.priority)) throw Error('Invalid priority.');
  }

  if (body.status !== undefined || !partial) {
    out.status = body.status || 'Pending';
    if (!statuses.includes(out.status)) throw Error('Invalid status.');
  }

  if (body.estimated_minutes !== undefined) {
    const n =
      body.estimated_minutes === '' || body.estimated_minutes === null
        ? null
        : Number(body.estimated_minutes);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 10080)) {
      throw Error('Estimated time must be 1–10080 minutes.');
    }
    out.estimated_minutes = n;
  }

  if (body.due_time !== undefined) {
    const t = String(body.due_time || '').trim();
    if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
      throw Error('Due time must be in HH:MM format (24-hour).');
    }
    out.due_time = t || null;
  }

  if (body.effort_estimate !== undefined) {
    const eff = Number(body.effort_estimate || 3);
    if (!Number.isInteger(eff) || eff < 1 || eff > 5) {
      throw Error('Effort estimate must be between 1 and 5.');
    }
    out.effort_estimate = eff;
  }

  if (body.prerequisites !== undefined) {
    let list = [];
    if (Array.isArray(body.prerequisites)) {
      list = body.prerequisites.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    } else if (typeof body.prerequisites === 'string' && body.prerequisites.trim()) {
      try {
        const parsed = JSON.parse(body.prerequisites);
        if (Array.isArray(parsed)) {
          list = parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0);
        }
      } catch {
        list = body.prerequisites.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
      }
    }
    out.prerequisites = JSON.stringify(list);
  }

  if (body.subtasks !== undefined) {
    if (!Array.isArray(body.subtasks) || body.subtasks.length > 50) {
      throw Error('Subtasks must be a list of up to 50 items.');
    }
    out.subtasks = JSON.stringify(
      body.subtasks
        .map((item) => ({ title: String(item.title || '').slice(0, 180), done: Boolean(item.done) }))
        .filter((item) => item.title)
    );
  }

  return out;
}

function overdue(r) {
  if (!r.due_date) return false;
  const deadlineStr = r.due_time ? `${r.due_date}T${r.due_time}:00` : `${r.due_date}T23:59:59`;
  const deadline = new Date(deadlineStr);
  if (r.status !== 'Completed') return deadline < new Date();
  return Boolean(r.completed_at && new Date(r.completed_at) > deadline);
}

function row(r) {
  let prereqs = [];
  try {
    prereqs = JSON.parse(r.prerequisites || '[]');
  } catch {
    prereqs = [];
  }
  return {
    ...r,
    subtasks: JSON.parse(r.subtasks || '[]'),
    prerequisites: prereqs,
    effort_estimate: Number(r.effort_estimate || 3),
    due_time: r.due_time || '',
    is_overdue: overdue(r)
  };
}

// GET /api/tasks - List all tasks with search, filter, and sort
router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM tasks WHERE user_id=?';
    const p = [req.user.id];
    const w = [];

    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q) {
      w.push('(title LIKE ? OR description LIKE ? OR category LIKE ?)');
      p.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const status = String(req.query.status || '');
    if (status === 'Overdue') {
      w.push(
        "due_date IS NOT NULL AND due_date!='' AND ((status!='Completed' AND due_date < date('now','localtime')) OR (status='Completed' AND completed_at IS NOT NULL AND datetime(completed_at)>datetime(due_date || ' 23:59:59')))"
      );
    } else if (statuses.includes(status)) {
      w.push('status=?');
      p.push(status);
    }

    if (priorities.includes(req.query.priority)) {
      w.push('priority=?');
      p.push(req.query.priority);
    }

    if (req.query.category) {
      w.push('category=?');
      p.push(String(req.query.category).slice(0, 120));
    }

    if (w.length) sql += ' AND ' + w.join(' AND ');

    const sortMap = {
      deadline: "CASE WHEN due_date IS NULL OR due_date='' THEN 1 ELSE 0 END, due_date ASC, due_time ASC",
      priority: "CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END",
      created: 'created_at DESC',
      alphabetical: 'title COLLATE NOCASE ASC'
    };

    sql += ' ORDER BY ' + (sortMap[req.query.sort] || sortMap.deadline);
    const tasks = (await all(sql, p)).map(row);
    const categories = [
      ...new Set(
        (await all('SELECT DISTINCT category FROM tasks WHERE user_id=? AND category!=""', [req.user.id])).map(
          (item) => item.category
        )
      )
    ];

    res.json({ tasks, categories });
  } catch (e) {
    res.status(500).json({ error: 'Could not load tasks.' });
  }
});

// GET /api/tasks/stats - Summary metrics
router.get('/stats', async (req, res) => {
  try {
    const tasks = await all(
      'SELECT status, due_date, due_time, priority, completed_at FROM tasks WHERE user_id=?',
      [req.user.id]
    );
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Completed').length;
    const pending = tasks.filter((t) => t.status === 'Pending').length;
    const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
    const overdueCount = tasks.filter(overdue).length;

    res.json({
      total,
      pending,
      completed,
      overdue: overdueCount,
      inProgress,
      completion: total ? Math.round((completed / total) * 100) : 0,
      distribution: { pending, inProgress, completed }
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not calculate statistics.' });
  }
});

// POST /api/tasks/smart-suggest - Automatic category, priority, and effort suggestion
router.post('/smart-suggest', (req, res) => {
  const title = String(req.body.title || '').toLowerCase();
  const desc = String(req.body.description || '').toLowerCase();
  const combined = `${title} ${desc}`;

  let category = 'General';
  if (/exam|test|study|chapter|ncert|revision|lecture|homework|assignment|class|math|physics|chemistry|history|syllabus/.test(combined)) {
    category = 'Study';
  } else if (/gym|workout|exercise|diet|walk|run|yoga|water|health|medicine|doctor|sleep/.test(combined)) {
    category = 'Health';
  } else if (/bug|feature|deploy|git|code|pr|api|database|design|client|meeting|presentation|report|office|email/.test(combined)) {
    category = 'Work';
  } else if (/buy|shop|bill|rent|groceries|bank|pay|investment|tax/.test(combined)) {
    category = 'Finance';
  } else if (/habit|read|book|clean|family|hobby|music|meditation/.test(combined)) {
    category = 'Habit';
  }

  let priority = 'Medium';
  let reason = 'Standard priority';
  if (/urgent|asap|today|deadline|critical|important|emergency|interview|exam tomorrow|immediate/.test(combined)) {
    priority = 'High';
    reason = 'Contains urgency keywords';
  } else if (/someday|later|maybe|read later|optional|backlog|idea|whenever|fun/.test(combined)) {
    priority = 'Low';
    reason = 'Contains low-urgency keywords';
  }

  let effort = 3;
  if (/quick|call|email|check|sign|ping|brief/.test(combined)) {
    effort = 1;
  } else if (/setup|configure|review|draft|outline/.test(combined)) {
    effort = 2;
  } else if (/chapter|write|build|complete|develop|practice/.test(combined)) {
    effort = 3;
  } else if (/project|research|deep dive|full mock|presentation/.test(combined)) {
    effort = 4;
  } else if (/architecture|thesis|dissertation|overhaul|system/.test(combined)) {
    effort = 5;
  }

  res.json({ suggested_category: category, suggested_priority: priority, suggested_effort: effort, reason });
});

// POST /api/tasks/smart-scheduler - Pick best tasks fitting in available time
router.post('/smart-scheduler', async (req, res) => {
  try {
    const availableMinutes = Math.max(10, Math.min(1440, Number(req.body.available_minutes || 120)));
    const openTasks = (await all(
      "SELECT * FROM tasks WHERE user_id=? AND status!='Completed' ORDER BY priority='High' DESC, due_date ASC",
      [req.user.id]
    )).map(row);

    const completedTaskIds = new Set(
      (await all("SELECT id FROM tasks WHERE user_id=? AND status='Completed'", [req.user.id])).map(t => t.id)
    );

    const candidates = openTasks.map((t) => {
      const duration = t.estimated_minutes || (t.effort_estimate * 25);
      const isOverdue = t.is_overdue;
      let score = 0;
      if (t.priority === 'High') score += 50;
      else if (t.priority === 'Medium') score += 30;
      else score += 10;

      if (isOverdue) score += 40;
      else if (t.due_date && t.due_date === new Date().toISOString().slice(0, 10)) score += 25;

      const uncompletedPrereqs = (t.prerequisites || []).filter(pId => !completedTaskIds.has(pId));
      const isBlocked = uncompletedPrereqs.length > 0;

      return {
        ...t,
        duration,
        score,
        isBlocked,
        uncompletedPrereqs
      };
    }).filter(t => !t.isBlocked);

    candidates.sort((a, b) => (b.score / (b.duration || 30)) - (a.score / (a.duration || 30)));

    const scheduled = [];
    let usedMinutes = 0;

    for (const task of candidates) {
      if (usedMinutes + task.duration <= availableMinutes) {
        scheduled.push(task);
        usedMinutes += task.duration;
      }
    }

    res.json({
      available_minutes: availableMinutes,
      used_minutes: usedMinutes,
      remaining_minutes: availableMinutes - usedMinutes,
      scheduled_tasks: scheduled,
      count: scheduled.length,
      reasoning: scheduled.length 
        ? `Selected ${scheduled.length} high-impact, unblocked tasks that fit precisely within your ${availableMinutes}-minute focus window.` 
        : `No unblocked tasks fit within ${availableMinutes} minutes.`
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not run smart scheduler: ' + e.message });
  }
});

// GET /api/tasks/dependency-order - Arrange tasks according to dependencies (Topological sort)
router.get('/dependency-order', async (req, res) => {
  try {
    const rawTasks = (await all('SELECT * FROM tasks WHERE user_id=?', [req.user.id])).map(row);
    const taskMap = new Map(rawTasks.map(t => [t.id, t]));
    const completedIds = new Set(rawTasks.filter(t => t.status === 'Completed').map(t => t.id));

    const adj = new Map();
    const inDegree = new Map();
    for (const t of rawTasks) {
      adj.set(t.id, []);
      inDegree.set(t.id, 0);
    }

    for (const t of rawTasks) {
      const prereqs = t.prerequisites || [];
      for (const pId of prereqs) {
        if (adj.has(pId)) {
          adj.get(pId).push(t.id);
          inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
        }
      }
    }

    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order = [];
    while (queue.length > 0) {
      const u = queue.shift();
      order.push(taskMap.get(u));
      for (const v of (adj.get(u) || [])) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) queue.push(v);
      }
    }

    const hasCycle = order.length < rawTasks.length;

    const decoratedOrder = (hasCycle ? rawTasks : order).map((t) => {
      const pendingPrereqs = (t.prerequisites || []).filter(pId => !completedIds.has(pId));
      const isBlocked = t.status !== 'Completed' && pendingPrereqs.length > 0;
      const prereqTitles = (t.prerequisites || []).map(pId => taskMap.get(pId)?.title || `Task #${pId}`);
      return {
        ...t,
        is_blocked: isBlocked,
        blocking_prerequisites: pendingPrereqs.map(pId => taskMap.get(pId)?.title || `Task #${pId}`),
        prerequisite_titles: prereqTitles
      };
    });

    const readyTasks = decoratedOrder.filter(t => t.status !== 'Completed' && !t.is_blocked);
    const blockedTasks = decoratedOrder.filter(t => t.status !== 'Completed' && t.is_blocked);

    res.json({
      has_cycle: hasCycle,
      order: decoratedOrder,
      ready_tasks: readyTasks,
      blocked_tasks: blockedTasks
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not compute dependency order: ' + e.message });
  }
});

// GET /api/tasks/critical-path - Critical Path Method (CPM) calculation
router.get('/critical-path', async (req, res) => {
  try {
    const rawTasks = (await all('SELECT * FROM tasks WHERE user_id=?', [req.user.id])).map(row);
    if (!rawTasks.length) {
      return res.json({ critical_path: [], total_duration_minutes: 0, tasks: [] });
    }

    const taskMap = new Map();
    for (const t of rawTasks) {
      const duration = t.estimated_minutes || (t.effort_estimate * 30);
      taskMap.set(t.id, {
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        duration: Math.max(5, duration),
        prerequisites: (t.prerequisites || []).filter(pId => rawTasks.some(x => x.id === pId)),
        successors: [],
        es: 0,
        ef: 0,
        ls: Infinity,
        lf: Infinity,
        slack: 0,
        is_critical: false
      });
    }

    for (const t of taskMap.values()) {
      for (const pId of t.prerequisites) {
        if (taskMap.has(pId)) {
          taskMap.get(pId).successors.push(t.id);
        }
      }
    }

    const inDegree = new Map();
    for (const t of taskMap.values()) {
      inDegree.set(t.id, t.prerequisites.length);
    }
    const q = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) q.push(id);
    }

    const topoOrder = [];
    while (q.length > 0) {
      const u = q.shift();
      topoOrder.push(u);
      for (const v of taskMap.get(u).successors) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) q.push(v);
      }
    }

    // Forward Pass
    for (const id of topoOrder) {
      const node = taskMap.get(id);
      let maxPredecessorEf = 0;
      for (const pId of node.prerequisites) {
        const p = taskMap.get(pId);
        if (p && p.ef > maxPredecessorEf) maxPredecessorEf = p.ef;
      }
      node.es = maxPredecessorEf;
      node.ef = node.es + node.duration;
    }

    let projectDuration = 0;
    for (const node of taskMap.values()) {
      if (node.ef > projectDuration) projectDuration = node.ef;
    }

    // Backward Pass
    const reverseTopo = [...topoOrder].reverse();
    for (const id of reverseTopo) {
      const node = taskMap.get(id);
      if (node.successors.length === 0) {
        node.lf = projectDuration;
      } else {
        let minSuccessorLs = Infinity;
        for (const sId of node.successors) {
          const s = taskMap.get(sId);
          if (s && s.ls < minSuccessorLs) minSuccessorLs = s.ls;
        }
        node.lf = minSuccessorLs;
      }
      node.ls = node.lf - node.duration;
      node.slack = Math.max(0, node.ls - node.es);
      node.is_critical = node.slack === 0;
    }

    const criticalPathTasks = [...taskMap.values()]
      .filter(t => t.is_critical)
      .sort((a, b) => a.es - b.es);

    res.json({
      total_duration_minutes: projectDuration,
      total_duration_hours: (projectDuration / 60).toFixed(1),
      critical_path: criticalPathTasks,
      critical_path_ids: criticalPathTasks.map(t => t.id),
      tasks: [...taskMap.values()].sort((a, b) => a.es - b.es)
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not calculate critical path: ' + e.message });
  }
});

// DELETE /api/tasks/clear-all - Clear all tasks for current user
router.delete('/clear-all', async (req, res) => {
  try {
    const r = await run('DELETE FROM tasks WHERE user_id=?', [req.user.id]);
    res.json({ ok: true, cleared_count: r.changes, message: `Cleared ${r.changes} tasks.` });
  } catch (e) {
    res.status(500).json({ error: 'Could not clear tasks: ' + e.message });
  }
});

// POST /api/tasks - Create task
router.post('/', async (req, res) => {
  try {
    const normalized = normalize(req.body);
    const r = await run(
      `INSERT INTO tasks(user_id,title,description,start_date,due_date,due_time,priority,status,category,estimated_minutes,effort_estimate,prerequisites,subtasks,completed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='Completed' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [
        req.user.id,
        normalized.title,
        normalized.description || '',
        normalized.start_date || '',
        normalized.due_date || '',
        normalized.due_time || null,
        normalized.priority,
        normalized.status,
        normalized.category || 'General',
        normalized.estimated_minutes ?? null,
        normalized.effort_estimate ?? 3,
        normalized.prerequisites || '[]',
        normalized.subtasks || '[]',
        normalized.status
      ]
    );
    const task = await get('SELECT * FROM tasks WHERE id=? AND user_id=?', [r.id, req.user.id]);
    res.status(201).json({ task: row(task) });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not create task.' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', async (req, res) => {
  const t = await get('SELECT * FROM tasks WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task: row(t) });
});

// PUT /api/tasks/:id - Update task
router.put('/:id', async (req, res) => {
  try {
    const normalized = normalize(req.body, true);
    const keys = Object.keys(normalized);
    if (!keys.length) return res.status(400).json({ error: 'No changes provided.' });

    const values = keys.map((k) => normalized[k]);
    const fields = keys.map((k) => `${k}=?`);

    if (normalized.status !== undefined) {
      fields.push(
        "completed_at=CASE WHEN ?='Completed' THEN CASE WHEN status='Completed' THEN completed_at ELSE CURRENT_TIMESTAMP END ELSE NULL END"
      );
      values.push(normalized.status);
    }

    const sql = `UPDATE tasks SET ${fields.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`;
    const r = await run(sql, [...values, req.params.id, req.user.id]);
    if (!r.changes) return res.status(404).json({ error: 'Task not found.' });

    const t = await get('SELECT * FROM tasks WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ task: row(t) });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not update task.' });
  }
});

// PATCH /api/tasks/:id/complete - Toggle complete or reopen
router.patch('/:id/complete', async (req, res) => {
  try {
    const status = req.body.completed ? 'Completed' : req.body.status || 'Pending';
    if (!statuses.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

    const r = await run(
      "UPDATE tasks SET status=?, completed_at=CASE WHEN ?='Completed' THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
      [status, status, req.params.id, req.user.id]
    );
    if (!r.changes) return res.status(404).json({ error: 'Task not found.' });

    const t = await get('SELECT * FROM tasks WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ task: row(t) });
  } catch (e) {
    res.status(500).json({ error: 'Could not update task status.' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM tasks WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!r.changes) return res.status(404).json({ error: 'Task not found.' });
    res.json({ message: 'Task deleted.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete task.' });
  }
});

module.exports = router;
module.exports.normalize = normalize;
module.exports.row = row;
