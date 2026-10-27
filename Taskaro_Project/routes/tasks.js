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
  const deadline = new Date(r.due_date + 'T23:59:59');
  if (r.status !== 'Completed') return deadline < new Date();
  return Boolean(r.completed_at && new Date(r.completed_at) > deadline);
}

function row(r) {
  return {
    ...r,
    subtasks: JSON.parse(r.subtasks || '[]'),
    is_overdue: overdue(r)
  };
}

router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM tasks WHERE user_id=?';
    const p = [req.user.id];
    const w = [];

    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q) {
      w.push('(title LIKE ? OR description LIKE ?)');
      p.push(`%${q}%`, `%${q}%`);
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
      deadline: "CASE WHEN due_date IS NULL OR due_date='' THEN 1 ELSE 0 END, due_date ASC",
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

router.get('/stats', async (req, res) => {
  try {
    const tasks = await all(
      'SELECT status, due_date, priority, completed_at FROM tasks WHERE user_id=?',
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

router.post('/', async (req, res) => {
  try {
    const normalized = normalize(req.body);
    const r = await run(
      "INSERT INTO tasks(user_id,title,description,start_date,due_date,priority,status,category,estimated_minutes,subtasks,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='Completed' THEN CURRENT_TIMESTAMP ELSE NULL END)",
      [
        req.user.id,
        normalized.title,
        normalized.description || '',
        normalized.start_date || '',
        normalized.due_date || '',
        normalized.priority,
        normalized.status,
        normalized.category || 'General',
        normalized.estimated_minutes ?? null,
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

router.get('/:id', async (req, res) => {
  const t = await get('SELECT * FROM tasks WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task: row(t) });
});

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
