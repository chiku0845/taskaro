# 🎯 Taskaro — Plan with Clarity

> A smart task management and daily routine timetable web application built with **Node.js, Express, SQLite, and Vanilla JS**.

---

## ✨ Features

- **☑️ Smart Task Management**: Create, edit, prioritize (High/Medium/Low), categorize, and track deadlines with subtasks and overdue flags.
- **⏱️ Time Table & Daily Routine**:
  - Set daily habits, schedule study/work slots with start/end duration.
  - Frequency repeats: *Daily*, *Weekdays*, *Weekends*, *Weekly*, or *Once*.
  - Circular tick marks to mark routines as completed or skipped.
  - Linked task integration: schedule tasks directly into your timetable.
- **📊 7-Day Performance Dashboard**:
  - Dynamic SVG performance bar graph tracking consistency against an 80% target.
  - Circular completion radial gauge.
  - Streak tracker with flame counter and protected rest days.
- **🌴 Dynamic Rest / Skip Days**: Mark planned breaks or recovery days without losing your streak.
- **🔐 Secure Authentication**:
  - Sign up, login with 30-day "Remember me" session.
  - Direct & instant Forgot Password reset flow (works without external SMTP).
  - In-app Change Password modal from user profile menu.
- **📱 Fully Responsive & Mobile-Ready**: Dedicated bottom navigation bar with direct tap icons (`⌂ Home`, `☑ Tasks`, `⏱ Routine`, `◇ Notes`, `✧ Ask AI`).
- **🌙 Dark / Light Mode Toggle**: Instant theme switching.

---

## 🚀 Getting Started Locally

```bash
# Clone the repository
git clone https://github.com/chiku0845/taskaro.git
cd taskaro

# Install dependencies
npm run build

# Start the application
npm start
```

Visit **http://localhost:3010** in your web browser.

---

## 🌐 Deployment (Render.com)

- **Runtime**: Node
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `NODE_ENV=production`
  - `SESSION_SECRET=your-secure-secret-key`

---

## 📄 License
ISC License.
