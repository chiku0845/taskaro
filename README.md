# TASKARO - Personal Productivity & Task Management Platform

A full-stack, enterprise-grade task management system built with **Python, Django, Django REST Framework, and PostgreSQL**.

---

## 🛠️ Tools & Technologies

| Category | Technology |
|---|---|
| **Frontend** | HTML5 |
| **Styling** | CSS3 (Modern Responsive Design System) |
| **Frontend Programming** | JavaScript (Vanilla ES6+) |
| **Backend Language** | Python 3.12+ |
| **Backend Framework** | Django 5.1+ |
| **API Development** | Django REST Framework (DRF) |
| **Database** | PostgreSQL (Production) / SQLite (Local Fallback) |
| **Authentication** | Django Auth + PBKDF2 Hashing + Database-backed Bearer Tokens |
| **Google Login** | Google OAuth 2.0 |
| **Email OTP** | SMTP Verification |
| **AI Chatbot** | Python AI Assistant Engine |
| **Charts & Graphs** | Chart.js |
| **Deployment / WSGI** | Railway / Gunicorn / WhiteNoise |

---

## 🌟 Key Features

### 1. Dual-Portal Role Isolation (Admin & User Portals)
- **Strict Role-Based Isolation**: Admins cannot log into the User Portal, and standard Users cannot log into the Admin Portal. Cross-portal access attempts are strictly rejected by both frontend validation and backend DRF security (`HTTP 403 Forbidden`).
- **Admin Capabilities**: User management (create, activate, deactivate), task creation and cross-user/cross-team assignment, team & project management, progress tracking, reports with Chart.js analytics, audit activity logs, and Admin AI Assistant.
- **User Capabilities**: Personal dashboard matching the modern UI (total tasks, pending, in progress, completed, and exam roadmap countdown), task dependencies, Routine & daily timetable, Plans & roadmaps, notes, direct messaging with admin, and personal Ask AI assistant.

### 2. Teams & Projects
- **Team Management**: Create teams, assign members, and manage collaborative team tasks.
- **Project Tracking**: Group tasks under structured projects with progress tracking.

### 3. Sign Up & Security
- **Required Fields**: Full Name, Age, Email Address, Role (User or Admin), Password (PBKDF2 SHA-512 salted hash).
- **Authentication**: Database-backed bearer tokens (`AuthToken`) ensuring seamless multi-worker session persistence.
- **Email OTP**: SMTP-based 6-digit one-time password verification with automatic expiration.
- **Google OAuth 2.0**: Direct sign-in with Google credentials.

### 4. Independent vs. Dependent Tasks
- **Independent Tasks**: Can be started immediately without prerequisites.
- **Dependent Tasks**: Require a prerequisite task to be completed first.
  - Automatically marked as **`🔒 Blocked / Locked`** until the prerequisite task is finished.
  - Once the prerequisite task is marked **Completed**, any dependent tasks **automatically unlock**!

---

## 🚀 How to Run the Application Locally

### Prerequisites
- Python 3.10+ installed on your PC.

### Quick Start
Open PowerShell or Terminal in the `taskaro` folder:

```bash
# 1. Activate virtual environment (if using venv)
.\venv\Scripts\activate   # Windows
# or: source venv/bin/activate  # macOS / Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Apply database migrations
python manage.py migrate

# 4. Start the Django development server
python manage.py runserver 1234
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
| **Admin Portal** | `admin@taskaro.com` | `admin123` | Administrator | System-wide dashboard, team & project management, assign tasks, user management, activity logs |
| **User Portal** | `chiku@taskaro.com` | `user123` | Student / User | Personal dashboard, daily routine, timetable, roadmaps, AI assistant |
| **User Portal** | `prince@taskaro.com` | `user123` | Student / User | Team member account |

---

## 📂 Project Architecture

```
taskaro/
├── api/                        # Django REST Framework application
│   ├── models.py               # Models: UserAccount, Task, Team, Project, AuthToken, EmailOtp, etc.
│   ├── views.py                # REST API views & business logic
│   ├── serializers.py          # Model serializers for JSON API responses
│   ├── authentication.py       # Bearer token auth, PBKDF2 hashing, SMTP OTP
│   ├── urls.py                 # API routing endpoints
│   └── migrations/             # Database schema migrations
├── taskaro_core/               # Django project core settings
│   ├── settings.py             # PostgreSQL / SQLite, CORS, WhiteNoise, DRF config
│   ├── urls.py                 # Core routing & static file serving
│   ├── wsgi.py                 # WSGI entrypoint for Gunicorn
│   └── asgi.py                 # ASGI entrypoint
├── public/                     # Static frontend SPA
│   ├── index.html              # HTML5 structure (Auth, User Dashboard, Admin Portal)
│   ├── styles.css              # CSS3 design system & themes
│   ├── app.js                  # Frontend state, API client, and dynamic UI rendering
│   └── demo.html               # Presentation & feature showcase
├── manage.py                   # Django CLI management entrypoint
├── requirements.txt            # Python dependencies (Django, DRF, psycopg2, whitenoise, gunicorn)
├── Procfile                    # Production deployment command for Railway
└── README.md                   # Documentation & setup guide
```

---

## 🛠️ Verification & Testing

To run the automated verification test suite:

```bash
python scratch/verify_django.py
```
