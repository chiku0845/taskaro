const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');

test('Notes CRUD, search filtering, and Clear All operations', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) => db.run(sql, p, function (err) { err ? reject(err) : resolve(this); }));
  const all = (sql, p = []) =>
    new Promise((resolve, reject) => db.all(sql, p, (err, rows) => (err ? reject(err) : resolve(rows))));
  const get = (sql, p = []) =>
    new Promise((resolve, reject) => db.get(sql, p, (err, r) => (err ? reject(err) : resolve(r))));

  await run(`CREATE TABLE resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    category TEXT DEFAULT 'General'
  )`);

  // 1. Create notes
  await run(
    'INSERT INTO resources(user_id, title, notes, category) VALUES(1, "Biology Notes", "Cell division and mitosis", "Science")'
  );
  await run(
    'INSERT INTO resources(user_id, title, notes, category) VALUES(1, "History Timeline", "Mughal empire timeline", "History")'
  );

  let notes = await all('SELECT * FROM resources WHERE user_id=1');
  assert.equal(notes.length, 2);

  // 2. Search note
  const searchResults = await all(
    'SELECT * FROM resources WHERE user_id=1 AND (title LIKE ? OR notes LIKE ?)',
    ['%mitosis%', '%mitosis%']
  );
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].title, 'Biology Notes');

  // 3. Edit note
  await run('UPDATE resources SET title="Updated Biology" WHERE id=1');
  const updated = await get('SELECT * FROM resources WHERE id=1');
  assert.equal(updated.title, 'Updated Biology');

  // 4. Delete single note
  await run('DELETE FROM resources WHERE id=1');
  notes = await all('SELECT * FROM resources WHERE user_id=1');
  assert.equal(notes.length, 1);

  // 5. Clear all notes
  const clearRes = await run('DELETE FROM resources WHERE user_id=1');
  assert.equal(clearRes.changes, 1);
  notes = await all('SELECT * FROM resources WHERE user_id=1');
  assert.equal(notes.length, 0);
});
