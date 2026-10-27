require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { initDb, db } = require('./database/db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const resourceRoutes = require('./routes/resources');
const assistantRoutes = require('./routes/assistant');
const planRoutes = require('./routes/plans');
const notificationRoutes = require('./routes/notifications');
const { ensureGoogleUser } = require('./services/authService');

const app = express();
const PORT = Number(process.env.PORT || 3010);
initDb();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'database') }),
    secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.get('SELECT id,name,email FROM users WHERE id=?', [id], (err, user) => done(err, user || false));
});

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
if (googleConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.APP_BASE_URL || `http://localhost:${PORT}`}/auth/google/callback`
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] && profile.emails[0].value;
          if (!email) return done(new Error('Google did not provide an email address'));
          const user = await ensureGoogleUser({ email, name: profile.displayName || email.split('@')[0] });
          done(null, user);
        } catch (e) {
          done(e);
        }
      }
    )
  );
}

app.use('/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/notifications', notificationRoutes);

// Persistent in-app reminders. The process must remain running for scheduled reminders.
const { occursOnDate } = require('./routes/plans');
function runReminderTick() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  db.all(
    `SELECT p.* FROM plans p
     WHERE p.reminder=1 AND p.start_time=?
     AND NOT EXISTS (SELECT 1 FROM skip_days s WHERE s.user_id=p.user_id AND s.date=?)`,
    [time, date],
    (err, plans) => {
      if (err || !plans) return;
      for (const p of plans) {
        const occurs = occursOnDate(p, date);
        const key = date + 'T' + time;
        if (!occurs || p.last_reminded_occurrence === key) continue;

        db.run(
          'UPDATE plans SET last_reminded_occurrence=? WHERE id=? AND (last_reminded_occurrence IS NULL OR last_reminded_occurrence<>?)',
          [key, p.id, key],
          function (updateErr) {
            if (updateErr || !this.changes) return;
            db.run(
              'INSERT INTO notifications(user_id,title,message,type) VALUES(?,?,?,?)',
              [
                p.user_id,
                'Routine reminder',
                `${p.name} starts now (${p.start_time}–${p.end_time}).`,
                'plan-reminder'
              ]
            );
          }
        );
      }
    }
  );
}
const reminderTimer = setInterval(runReminderTick, 15000);
if (reminderTimer.unref) reminderTimer.unref();

app.get('/api/config', (req, res) =>
  res.json({ googleConfigured, aiConfigured: Boolean(process.env.AI_API_KEY) })
);
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  res.json({ user: req.user });
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`taskaro running at http://localhost:${PORT}`));
}

module.exports = app;
