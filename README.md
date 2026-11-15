# TASKARO - Personal Productivity & Task Management Platform

A full-stack, enterprise-grade task management system developed from scratch according to the **TASKARO Complete Product Requirements** specification and user interface design guidelines.

---

## 🌟 Key Features

### 1. Role-Based Access Control (Admin & User Portals)
- **Separate Portals on the Same PC**: Easily switch between **User Portal** (`👤`) and **Admin Portal** (`🛡️`) on the login screen.
- **Admin Capabilities**: User management (create, activate, deactivate), task creation and cross-user assignment, task monitoring with progress tracking, reports & analytics with charts, audit logs, and Admin AI Assistant.
- **User Capabilities**: Personal productivity dashboard matching the visual design (total tasks, pending, in progress, completed, and exam roadmap countdown), task management with dependencies, Routine & schedule, Plans & roadmaps, notes, direct messaging with admin, and personal Ask AI assistant.

### 2. Sign Up & Credential Validation
- **Required Fields**:
  - **Full Name**
  - **Age** (e.g., 21)
  - **Email Address**
  - **Role**: Standard User or Admin
  - **Password**: Secure 6-character requirement (supports digits, letters, and special characters)
  - **Confirm Password** verification
- **Security**: Cryptographically hashed using PBKDF2 with unique salts. No plaintext passwords stored.

### 3. 100% Reliable Local Data Persistence
- Uses **native SQLite** (`data/taskaro.db`) with Write-Ahead Logging (`WAL`) mode.
- **Permanent Storage**: All tasks, users, daily routines, exam roadmaps, notes, timetable slots, and activity logs are saved directly to the database on disk.
- **No Data Loss**: Whether you close the browser, turn off your PC, or reopen the application 4 or 10 days later, all your inserted data remains 100% intact!

### 4. Independent vs. Dependent Tasks
- **Independent Tasks**: Can be started immediately without prerequisites.
- **Dependent Tasks**: Require a prerequisite task to be completed first.
  - Automatically marked as **`🔒 Blocked / Locked`** until the prerequisite task is finished.
  - Once the prerequisite task is marked **Completed**, any dependent tasks **automatically unlock** and send a notification!

---

## 🚀 How to Run the Application

### Prerequisites
- Node.js (version 20, 22, or 24+) installed on your PC.

### Quick Start
Open PowerShell or Command Prompt in the `taskaro` folder and run:

```bash
# Start the server
npm start
```

Or directly with Node:
```bash
node server.js
```

Then open your browser and navigate to:
```
http://localhost:1234
```
or
```
http://127.0.0.1:1234
```

---

## 🔑 Demo Accounts (Pre-configured)

You can click the one-click quick demo buttons on the login screen or enter manually:

| Portal | Email | Password | Role | Description |
|---|---|---|---|---|
| **Admin Portal** | `admin@taskaro.com` | `admin123` | Administrator | System-wide dashboard, assign tasks to any user, user management, activity logs |
| **User Portal** | `chiku@taskaro.com` | `user123` | Student / User | Personal dashboard matching TaskMind design, 8 tasks, exam roadmap, routines |
| **User Portal** | `prince@taskaro.com` | `user123` | Student / User | Team member account |

---

## 📂 Project Architecture

```
taskaro/
├── data/
│   └── taskaro.db          # Persistent SQLite database (WAL mode)
├── public/
│   ├── index.html          # SPA layout (Auth screen + User Panel + Admin Console)
│   ├── styles.css          # Design system matching TaskMind & Dark/Light mode
│   └── app.js              # Client state, API handlers, and UI rendering
├── server.js               # Express REST API, auth middleware, and AI engine
├── db.js                   # Database initialization, schema & seed data
├── package.json            # Project manifest
└── README.md               # Documentation & usage guide
```

---

## 🛠️ Verification & Testing

To run the automated database and business logic verification test suite:

```bash
node test_api.js
```
