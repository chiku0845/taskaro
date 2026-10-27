# taskaro — Task Management System

A responsive task-management web app built with HTML, CSS, vanilla JavaScript, Node.js, Express, SQLite, and server-side sessions. It is inspired by the supplied blue-and-white login and taskaro dashboard screenshots.

## Included

- Email/password login, logout, password hashing, secure server-side sessions.
- Signup with six-digit email OTP, 10-minute expiry, attempt limit, resend cooldown and rate limiting.
- Secure password-reset link with 30-minute expiry.
- Optional Google OAuth.
- Per-user task CRUD, subtasks, priority, status, categories, estimates, due dates and filters.
- Dashboard statistics and completion progress; overdue is derived from due date and unfinished status.
- Priority Focus Finder, weekly Study Planner, saved Study Resources, in-app deadline alerts.
- Ask AI assistant: uses a configured OpenAI-compatible API, or clearly labels its rule-based fallback.
- Persistent light/dark preference in browser local storage (only the theme preference is stored client-side).
- SQLite database initialization on startup.

## Requirements

- Node.js 20 or newer (includes `fetch`).
- npm.
- For email OTP and password reset: SMTP credentials.
- Optional: Google OAuth credentials and an AI API key.

## Run in VS Code on Windows

1. Extract the ZIP to a folder, then open that folder in VS Code.
2. Install Node.js 20+ from https://nodejs.org/ if needed.
3. Open **Terminal → New Terminal**.
4. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Edit `.env`. Set a long random `SESSION_SECRET`. Configure SMTP before testing signup/forgot-password.
6. Install dependencies:

   ```powershell
   npm install
   ```

7. Start the app:

   ```powershell
   npm start
   ```

8. Open http://localhost:3010.

The SQLite database and session database are created automatically under `database/` when the server starts. Do not commit `.env`, database files, or real credentials to a public repository.

For development with automatic restart:

```powershell
npm run dev
```

## Gmail SMTP setup

1. Enable 2-Step Verification on the Gmail account that will send messages.
2. Create an **App Password** in the Google Account security settings (availability depends on account policy).
3. Put these values in `.env`:

   ```dotenv
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=your-sender@gmail.com
   SMTP_PASS=your-16-character-app-password
   EMAIL_FROM=taskaro <your-sender@gmail.com>
   APP_BASE_URL=http://localhost:3010
   ```

4. Restart `npm start`. Signup's OTP request should send a code. If SMTP is missing or invalid, the server returns a configuration/delivery error instead of pretending the code was sent.

## Google OAuth setup (optional)

1. Create a project in Google Cloud Console and configure the OAuth consent screen.
2. Create an OAuth Client ID for a Web application.
3. Add `http://localhost:3010/auth/google/callback` as an authorized redirect URI.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then restart the server.

The Google button redirects to a real OAuth flow only when both credentials are present. Otherwise, the route returns a clear configuration message. Use HTTPS and the correct callback URL when deploying.

## AI API setup (optional)

The assistant calls an OpenAI-compatible chat completions endpoint from the backend. Set:

```dotenv
AI_API_KEY=your-provider-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Restart the server after changing `.env`. Keep API keys on the backend only. If no key is set, the assistant explicitly labels its output **rule-based fallback**. If a configured provider fails, it falls back with a notice.

## Test

Run the included pure logic smoke tests:

```powershell
npm test
```

Check the app manually:

1. Start the server and confirm the login page loads.
2. Without SMTP credentials, signup should report that email OTP is not configured.
3. Configure SMTP and request an OTP; verify that the account is only created after the correct code.
4. Log in and create a task with a past deadline. It should count as overdue unless completed.
5. Edit, complete, reopen, and delete a task; dashboard stats and progress should refresh.
6. Try search, status/priority/category filters, sorting and Clear.
7. Add a resource, edit it, then delete it.
8. Test weekly planner navigation, notification panel, theme toggle and mobile layout.
9. Configure Google OAuth and AI separately to test those live integrations.
10. Create two accounts and verify each account sees only its own tasks and resources.

## API overview

### Auth
- `POST /auth/signup/request-otp`
- `POST /auth/signup/verify-otp`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /api/me`
- `GET /api/config`

### Tasks (authenticated)
- `GET /api/tasks` — supports `q`, `status`, `priority`, `category`, `sort`
- `GET /api/tasks/stats`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PUT /api/tasks/:id`
- `PATCH /api/tasks/:id/complete`
- `DELETE /api/tasks/:id`

### Resources and assistant (authenticated)
- `GET /api/resources`, `POST /api/resources`, `PUT /api/resources/:id`, `DELETE /api/resources/:id`
- `POST /api/assistant/chat` with `{ "message": "Make a plan for today" }`

## Security notes and limitations

- Passwords and pending OTP values are stored as bcrypt hashes; password-reset tokens are stored as SHA-256 hashes.
- OTPs expire after 10 minutes and are limited to five incorrect attempts; resend has a 60-second cooldown and endpoint rate limits.
- All task/resource queries are scoped to the current session user and use parameterized SQLite queries.
- Session cookies are HttpOnly and SameSite=Lax; HTTPS is required for secure cookies in production (`NODE_ENV=production`).
- Configure a strong `SESSION_SECRET`, SMTP, OAuth and AI credentials before using those integrations.
- This is a local college-project starter. Before public deployment, add HTTPS/reverse-proxy configuration, a CSRF strategy suited to the deployment, production logging/monitoring, backup/restore, and a review of dependency updates. No background email scheduler is included; deadline alerts are shown in-app when the app is open.


## Revision notes (2026-10-27)

This revision includes:
- Primary navigation is displayed across the top on desktop; the compact mobile navigation remains responsive.
- Password reset now requires entering the new password twice in the UI.
- Password reset links expire after 15 minutes.
- Smoke tests now cover preserving overdue history when a task is completed after its deadline.

Important scope notes:
- The current Plan view is still a weekly view of task due dates, not a full activity timetable with start/end times and recurring plans.
- The current notification panel derives reminders from task deadlines in the browser. Persistent notification history, server-side scheduling, and closed-browser Web Push still require implementation/configuration.
- Password reset email requires SMTP values in `.env`; AI responses use the clearly labelled rule-based fallback unless an AI API key is configured.
- Run `npm test` to execute the included smoke tests.


## Daily plans and notifications

- The Plan page supports once/daily/weekly activities, date, start/end times, automatically calculated duration, notes, edit/delete, and an optional in-app reminder.
- Plan and notification records are stored in SQLite. Reminder checks run in the Node.js process; keep the server running for them to fire. If the server is stopped during a plan's start minute, that reminder may be missed.
- The notification bell shows stored notification history, unread count, mark-read controls, overdue tasks and upcoming deadlines.
- Admin announcements are restricted to the account whose email matches `ADMIN_EMAIL` in `.env`. Set it before starting the server.
- Native browser push while the site is closed is not configured in this release; that requires VAPID keys, a service worker subscription flow, and HTTPS in production.

## Install on Windows / VS Code

Open the folder containing `package.json` in VS Code, copy `.env.example` to `.env`, set a strong `SESSION_SECRET`, then run:

```powershell
npm install
npm test
npm start
```

Open the localhost URL printed by the server (by default `http://localhost:3010`).
