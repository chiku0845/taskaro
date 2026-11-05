const { db } = require('../database/db');
function ensureGoogleUser({ email, name }) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id,name,email FROM users WHERE email=?', [email.toLowerCase()], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row);
      db.run('INSERT INTO users(name,email,email_verified) VALUES(?,?,1)', [name.slice(0,100), email.toLowerCase()], function(e) {
        if (e) return reject(e);
        resolve({ id: this.lastID, name, email: email.toLowerCase() });
      });
    });
  });
}
module.exports = { ensureGoogleUser };
