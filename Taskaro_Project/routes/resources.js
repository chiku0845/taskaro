const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const run = (s, p = []) =>
  new Promise((r, j) =>
    db.run(s, p, function (e) {
      e ? j(e) : r({ id: this.lastID, changes: this.changes });
    })
  );

const all = (s, p = []) =>
  new Promise((r, j) =>
    db.all(s, p, (e, x) => (e ? j(e) : r(x)))
  );

function validateResource(b) {
  const title = String(b.title || '').trim();
  if (!title || title.length > 180) {
    throw Error('Resource title is required (max 180 characters).');
  }
  const url = String(b.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) {
    throw Error('Resource URL must start with http:// or https://.');
  }

  const fileData = b.file_data ? String(b.file_data) : null;
  const fileName = b.file_name ? String(b.file_name).slice(0, 255) : null;
  const fileType = b.file_type ? String(b.file_type).slice(0, 100) : null;

  return {
    title,
    url,
    notes: String(b.notes || '').slice(0, 5000),
    category: String(b.category || 'General').slice(0, 120),
    file_data: fileData,
    file_name: fileName,
    file_type: fileType
  };
}

router.get('/', async (req, res) => {
  try {
    const resources = await all(
      'SELECT * FROM resources WHERE user_id=? ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ resources });
  } catch (e) {
    res.status(500).json({ error: 'Could not load resources.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const x = validateResource(req.body);
    const r = await run(
      'INSERT INTO resources(user_id,title,url,notes,category,file_data,file_name,file_type) VALUES(?,?,?,?,?,?,?,?)',
      [req.user.id, x.title, x.url, x.notes, x.category, x.file_data, x.file_name, x.file_type]
    );
    res.status(201).json({ resource: { id: r.id, ...x } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const x = validateResource(req.body);
    const r = await run(
      'UPDATE resources SET title=?,url=?,notes=?,category=?,file_data=?,file_name=?,file_type=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',
      [x.title, x.url, x.notes, x.category, x.file_data, x.file_name, x.file_type, req.params.id, req.user.id]
    );
    if (!r.changes) return res.status(404).json({ error: 'Resource not found.' });
    res.json({ resource: { id: Number(req.params.id), ...x } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM resources WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!r.changes) return res.status(404).json({ error: 'Resource not found.' });
    res.json({ message: 'Resource deleted.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete resource.' });
  }
});

module.exports = router;
