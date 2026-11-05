const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');

test('User registration, password hashing and verification', async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) =>
    new Promise((resolve, reject) => db.run(sql, p, function (err) { err ? reject(err) : resolve(this); }));
  const get = (sql, p = []) =>
    new Promise((resolve, reject) => db.get(sql, p, (err, r) => (err ? reject(err) : resolve(r))));

  await run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const rawPassword = 'SecurePassword123!';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(rawPassword, salt);

  // 1. Register User
  await run('INSERT INTO users(name, email, password_hash) VALUES(?, ?, ?)', [
    'Alice',
    'alice@taskmind.app',
    hash
  ]);

  const user = await get('SELECT * FROM users WHERE email=?', ['alice@taskmind.app']);
  assert.equal(user.name, 'Alice');

  // 2. Validate password match
  const isMatch = await bcrypt.compare(rawPassword, user.password_hash);
  assert.equal(isMatch, true);

  // 3. Reject wrong password
  const isWrong = await bcrypt.compare('WrongPassword999', user.password_hash);
  assert.equal(isWrong, false);
});
