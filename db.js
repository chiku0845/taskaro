const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Ensure data directory exists for permanent persistence
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'taskaro.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high performance and reliable persistence
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Helper for hashing passwords
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return check === hash;
}

// Initialize tables
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      age INTEGER DEFAULT 20,
      gender TEXT DEFAULT 'Unspecified',
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', -- 'admin' or 'user'
      account_status TEXT NOT NULL DEFAULT 'active', -- 'active' or 'deactivated'
      avatar_color TEXT DEFAULT '#3b82f6',
      created_at TEXT NOT NULL,
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assignee_id TEXT,
      creator_id TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium', -- 'Low', 'Medium', 'High'
      status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'In Progress', 'Completed', 'Blocked'
      task_type TEXT NOT NULL DEFAULT 'Independent', -- 'Independent' or 'Dependent'
      prerequisite_task_id TEXT,
      start_date TEXT,
      deadline TEXT,
      progress INTEGER DEFAULT 0,
      duration_hours REAL DEFAULT 1.0,
      category TEXT DEFAULT 'General',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      prerequisite_task_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      day_of_week TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      activity_type TEXT DEFAULT 'Study',
      color TEXT DEFAULT '#3b82f6',
      linked_task_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      routine_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      routine_type TEXT DEFAULT 'custom', -- 'morning', 'evening', 'custom'
      scheduled_time TEXT NOT NULL,
      active_status INTEGER DEFAULT 1,
      streak INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id TEXT UNIQUE NOT NULL,
      routine_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      log_date TEXT NOT NULL,
      status TEXT NOT NULL, -- 'Completed' or 'Missed'
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      goal_name TEXT NOT NULL,
      category TEXT DEFAULT 'Academic',
      duration_label TEXT DEFAULT '3 Months',
      description TEXT,
      start_date TEXT NOT NULL,
      target_date TEXT NOT NULL,
      status TEXT DEFAULT 'Active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id TEXT UNIQUE NOT NULL,
      plan_id TEXT NOT NULL,
      title TEXT NOT NULL,
      allocated_hours REAL DEFAULT 2.0,
      status TEXT DEFAULT 'Pending', -- 'Pending' or 'Completed'
      order_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prep_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      topic_title TEXT,
      planned_minutes INTEGER NOT NULL DEFAULT 60,
      actual_minutes INTEGER NOT NULL DEFAULT 60,
      session_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      tags TEXT DEFAULT '',
      pinned INTEGER DEFAULT 0,
      linked_task_id TEXT,
      linked_plan_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      read_status INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_status INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id TEXT UNIQUE NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      team_id TEXT,
      lead_id TEXT,
      status TEXT DEFAULT 'Active',
      deadline TEXT,
      progress INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate existing databases to have columns if not present
  try { db.exec(`ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'Unspecified';`); } catch (e) {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN team_id TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN project_id TEXT;`); } catch (e) {}

  // Seed default teams & projects if empty
  seedTeamsAndProjects();

  // Seed default data if database is brand new
  seedInitialData();
}

function seedTeamsAndProjects() {
  try {
    const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
    if (teamCount === 0) {
      const now = new Date().toISOString();
      const admin = db.prepare("SELECT user_id FROM users WHERE role = 'admin' LIMIT 1").get();
      const adminId = admin ? admin.user_id : 'user_admin_001';
      const chiku = db.prepare("SELECT user_id FROM users WHERE LOWER(name) LIKE '%chiku%' OR LOWER(name) LIKE '%chiky%' LIMIT 1").get();
      const chikuId = chiku ? chiku.user_id : 'user_chiku_002';

      db.prepare(`
        INSERT INTO teams (team_id, name, description, created_by, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('team_001', 'Core Engineering Team', 'Core product development and full-stack tasks', adminId, now);

      db.prepare('INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)').run('team_001', adminId, now);
      if (chikuId) {
        db.prepare('INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)').run('team_001', chikuId, now);
      }

      db.prepare(`
        INSERT INTO projects (project_id, title, description, team_id, lead_id, status, deadline, progress, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('proj_001', 'Taskaro Web Platform Launch', 'Complete modern task management with user & admin portals', 'team_001', adminId, 'Active', '2026-12-31', 65, now);
    }
  } catch (err) {
    console.error('Error seeding teams & projects:', err);
  }
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    // Database already initialized with users; keep persisted data!
    return;
  }

  console.log('Seeding initial demo data for Taskaro...');
  const now = new Date().toISOString();

  // Create Admin user
  const adminId = 'user_admin_001';
  const adminPass = hashPassword('admin123');
  db.prepare(`
    INSERT INTO users (user_id, name, age, email, password_hash, password_salt, role, account_status, avatar_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    adminId,
    'System Admin',
    28,
    'admin@taskaro.com',
    adminPass.hash,
    adminPass.salt,
    'admin',
    'active',
    '#4f46e5',
    now
  );

  // Create Default User (matches chiku from sample image 2)
  const chikuId = 'user_chiku_002';
  const userPass = hashPassword('user123');
  db.prepare(`
    INSERT INTO users (user_id, name, age, email, password_hash, password_salt, role, account_status, avatar_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    chikuId,
    'chiku',
    21,
    'chiku@taskaro.com',
    userPass.hash,
    userPass.salt,
    'user',
    'active',
    '#2563eb',
    now
  );

  // Create another demo team member
  const princeId = 'user_prince_003';
  const princePass = hashPassword('user123');
  db.prepare(`
    INSERT INTO users (user_id, name, age, email, password_hash, password_salt, role, account_status, avatar_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    princeId,
    'Prince Patyal',
    22,
    'prince@taskaro.com',
    princePass.hash,
    princePass.salt,
    'user',
    'active',
    '#059669',
    now
  );

  // Seed tasks matching user screenshot: Total 8 tasks, 3 Pending, 5 In Progress, 0 Completed
  const sampleTasks = [
    {
      id: 'task_001',
      title: 'Assignment 1',
      description: 'Complete Discrete Mathematics Assignment 1 including Set Theory proof questions.',
      assignee: chikuId,
      creator: adminId,
      priority: 'High',
      status: 'Pending',
      type: 'Independent',
      deadline: '2026-10-12T23:59', // overdue
      progress: 0,
      duration: 3.5,
      category: 'Academic'
    },
    {
      id: 'task_002',
      title: 'Str Project Submission',
      description: 'Prepare Structure & Marking Guidelines BCA 311 documentation and software architecture diagram.',
      assignee: chikuId,
      creator: adminId,
      priority: 'High',
      status: 'In Progress',
      type: 'Independent',
      deadline: '2026-11-07T18:00', // upcoming / overdue
      progress: 60,
      duration: 5.0,
      category: 'Project'
    },
    {
      id: 'task_003',
      title: 'Assignment 2 - Python OOP',
      description: 'Implement Inheritance, Polymorphism, and Encapsulation exercises.',
      assignee: chikuId,
      creator: adminId,
      priority: 'Medium',
      status: 'In Progress',
      type: 'Independent',
      deadline: '2026-11-09T23:59',
      progress: 40,
      duration: 4.0,
      category: 'Academic'
    },
    {
      id: 'task_004',
      title: 'Database Schema Setup',
      description: 'Design SQLite relational schema and write SQL scripts for Taskaro.',
      assignee: chikuId,
      creator: adminId,
      priority: 'High',
      status: 'In Progress',
      type: 'Independent',
      deadline: '2026-11-18T20:00',
      progress: 80,
      duration: 6.0,
      category: 'Development'
    },
    {
      id: 'task_005',
      title: 'Front-end User Interface',
      description: 'Implement Taskaro responsive dashboard according to UI design.',
      assignee: chikuId,
      creator: adminId,
      priority: 'Medium',
      status: 'In Progress',
      type: 'Independent',
      deadline: '2026-11-20T22:00',
      progress: 50,
      duration: 8.0,
      category: 'Design'
    },
    {
      id: 'task_006',
      title: 'Backend API Integration',
      description: 'Connect REST API endpoints with authentication and authorization checks.',
      assignee: chikuId,
      creator: adminId,
      priority: 'Medium',
      status: 'In Progress',
      type: 'Independent',
      deadline: '2026-11-22T23:59',
      progress: 30,
      duration: 7.0,
      category: 'Development'
    },
    {
      id: 'task_007',
      title: 'External Practical Viva Prep',
      description: 'Revise all practical assignments and prepare viva question answers.',
      assignee: chikuId,
      creator: chikuId,
      priority: 'High',
      status: 'Pending',
      type: 'Independent',
      deadline: '2026-12-15T10:00',
      progress: 0,
      duration: 10.0,
      category: 'Exam'
    },
    {
      id: 'task_008',
      title: 'Final Project Report Submission',
      description: 'Dependent on Str Project Submission. Must verify testing and compile report.',
      assignee: chikuId,
      creator: adminId,
      priority: 'High',
      status: 'Pending',
      type: 'Dependent',
      prerequisite: 'task_002',
      deadline: '2026-12-25T17:00',
      progress: 0,
      duration: 6.0,
      category: 'Project'
    }
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      task_id, title, description, assignee_id, creator_id, priority,
      status, task_type, prerequisite_task_id, deadline, progress,
      duration_hours, category, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of sampleTasks) {
    insertTask.run(
      t.id,
      t.title,
      t.description,
      t.assignee,
      t.creator,
      t.priority,
      t.status,
      t.type,
      t.prerequisite || null,
      t.deadline,
      t.progress,
      t.duration,
      t.category,
      now,
      now
    );
  }

  // Active Exam / Goal Prep (matching screenshot image 2: External praticals, 56 Days Remaining until Target • 31 Dec 2026)
  const planId = 'plan_001';
  db.prepare(`
    INSERT INTO plans (plan_id, user_id, goal_name, category, duration_label, description, start_date, target_date, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    planId,
    chikuId,
    'External praticals',
    'Academic',
    '3 Months',
    'Comprehensive preparation for BCA semester external practical exams, labs, and viva.',
    '2026-10-01',
    '2026-12-31',
    'Active',
    now
  );

  // Plan Topics
  const insertTopic = db.prepare(`
    INSERT INTO plan_topics (topic_id, plan_id, title, allocated_hours, status, order_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertTopic.run('topic_001', planId, 'Data Structures & Algorithms in C/C++', 12.0, 'Completed', 1);
  insertTopic.run('topic_002', planId, 'Operating System Lab (Process Scheduling & IPC)', 10.0, 'Completed', 2);
  insertTopic.run('topic_003', planId, 'Database Management System & SQL Queries', 14.0, 'Pending', 3);
  insertTopic.run('topic_004', planId, 'Web Development & REST API Implementation', 16.0, 'Pending', 4);

  // Daily Routines
  const insertRoutine = db.prepare(`
    INSERT INTO routines (routine_id, user_id, title, routine_type, scheduled_time, active_status, streak, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertRoutine.run('rout_001', chikuId, 'Wake Up & Fresh Up', 'morning', '06:00 AM', 1, 14, now);
  insertRoutine.run('rout_002', chikuId, 'Physical Exercise / Running', 'morning', '07:00 AM', 1, 12, now);
  insertRoutine.run('rout_003', chikuId, 'Core Technical Reading & Concepts', 'morning', '09:00 AM', 1, 9, now);
  insertRoutine.run('rout_004', chikuId, 'Coding Practice & Lab Work', 'custom', '05:00 PM', 1, 15, now);
  insertRoutine.run('rout_005', chikuId, 'Daily Review & Next Day Planning', 'evening', '10:00 PM', 1, 10, now);

  // Routine activity logs for recent days
  const todayStr = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO routine_logs (log_id, routine_id, user_id, log_date, status, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('log_r_001', 'rout_001', chikuId, todayStr, 'Completed', now);
  db.prepare(`
    INSERT INTO routine_logs (log_id, routine_id, user_id, log_date, status, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('log_r_002', 'rout_002', chikuId, todayStr, 'Completed', now);

  // Sample Prep Sessions (Planned vs Actual time)
  const insertSession = db.prepare(`
    INSERT INTO prep_sessions (session_id, user_id, plan_id, topic_title, planned_minutes, actual_minutes, session_date, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSession.run('sess_001', chikuId, planId, 'DBMS SQL Queries', 120, 110, todayStr, 'Covered joins and group by aggregations.', now);
  insertSession.run('sess_002', chikuId, planId, 'OS Scheduling Algorithms', 90, 105, todayStr, 'Simulated Round Robin and SJF scheduling.', now);

  // Sample Notes
  const insertNote = db.prepare(`
    INSERT INTO notes (note_id, user_id, title, content, category, tags, pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertNote.run(
    'note_001',
    chikuId,
    'Python OOP Concepts',
    'Key definitions:\n- Class: Blueprint for creating objects.\n- Object: Instance of a class with state and behavior.\n- Inheritance: Mechanism where child class acquires properties of parent class.\n- Polymorphism: Ability to take multiple forms (method overriding and overloading).\n- Encapsulation: Binding data and methods into a single unit.',
    'Python',
    'python,oop,exam',
    1,
    now,
    now
  );
  insertNote.run(
    'note_002',
    chikuId,
    'NIMCET Mathematics Formulae',
    'Important topics: Set Theory, Boolean Algebra, Vector Algebra, Probability & Statistics.',
    'Mathematics',
    'nimcet,math,formulas',
    1,
    now,
    now
  );

  // Notifications (exact items from screenshot image 2!)
  const insertNotification = db.prepare(`
    INSERT INTO notifications (notification_id, user_id, type, title, content, created_at, read_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertNotification.run('notif_001', chikuId, 'task_overdue', 'Overdue task', 'Assignment 1 was due 12 Oct 2026. Task reminder', now, 0);
  insertNotification.run('notif_002', chikuId, 'task_overdue', 'Overdue task', 'Assignment 1 was due 15 Oct 2026. Task reminder', now, 0);
  insertNotification.run('notif_003', chikuId, 'deadline_approaching', 'Upcoming deadline', 'Assignment 1 is due 7 Nov 2026. Task reminder', now, 0);
  insertNotification.run('notif_004', chikuId, 'deadline_approaching', 'Upcoming deadline', 'Str Project is due 7 Nov 2026. Task reminder', now, 0);
  insertNotification.run('notif_005', chikuId, 'deadline_approaching', 'Upcoming deadline', 'Assignment 2 is due 9 Nov 2026. Task reminder', now, 0);

  // Sample Messages
  const insertMsg = db.prepare(`
    INSERT INTO messages (message_id, sender_id, receiver_id, content, sent_at, read_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertMsg.run('msg_001', adminId, chikuId, 'Welcome to Taskaro! Please verify your project milestones for this semester.', now, 1);
  insertMsg.run('msg_002', chikuId, adminId, 'Hello Admin! I have started work on the Database Schema and Str Project documentation.', now, 1);
  insertMsg.run('msg_003', adminId, chikuId, 'Great work! Remember that Final Project Report is dependent on Str Project Submission.', now, 0);

  // Activity Log
  db.prepare(`
    INSERT INTO activity_logs (log_id, actor_id, actor_name, action, entity_type, entity_id, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('act_001', adminId, 'System Admin', 'ASSIGN_TASK', 'Task', 'task_002', 'Assigned Str Project Submission to chiku', now);

  console.log('Database initialized successfully with default records!');
}

// Check and update dependent tasks status
function updateDependentTasksStatus(completedTaskId) {
  // Find tasks that have this task as a prerequisite
  const dependentTasks = db.prepare(`
    SELECT * FROM tasks WHERE prerequisite_task_id = ?
  `).all(completedTaskId);

  for (const depTask of dependentTasks) {
    // If prerequisite is completed and this task was blocked, unblock it!
    if (depTask.status === 'Blocked') {
      db.prepare(`
        UPDATE tasks SET status = 'Pending', updated_at = ? WHERE task_id = ?
      `).run(new Date().toISOString(), depTask.task_id);

      // Create notification for assignee
      if (depTask.assignee_id) {
        db.prepare(`
          INSERT INTO notifications (notification_id, user_id, type, title, content, created_at, read_status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          depTask.assignee_id,
          'task_unlocked',
          'Dependent task unlocked',
          `Task "${depTask.title}" is now unlocked and available because prerequisite task has been completed!`,
          new Date().toISOString(),
          0
        );
      }
    }
  }
}

// Initialize on module load
initDatabase();

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  updateDependentTasksStatus
};
