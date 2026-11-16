const express = require('express');
const cors = require('cors');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword, updateDependentTasksStatus } = require('./db');

const app = express();
const PORT = process.env.PORT || 1234;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory token store mapped to user_id (persistent token table also in SQLite if needed)
const activeTokens = new Map();

// Generate Auth Token
function createToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, {
    userId: user.user_id,
    role: user.role,
    name: user.name,
    email: user.email,
    created: Date.now()
  });
  return token;
}

// Authentication Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = authHeader;
    }
  }

  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }

  const session = activeTokens.get(token);
  // Verify user still exists and is active
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(session.userId);
  if (!user || user.account_status === 'deactivated') {
    activeTokens.delete(token);
    return res.status(403).json({ error: 'Account is deactivated or does not exist' });
  }

  req.user = {
    userId: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    age: user.age,
    gender: user.gender || 'Unspecified'
  };
  next();
}

// Admin-only Middleware
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Administrator role required' });
  }
  next();
}

// Log activity helper
function logActivity(actorId, actorName, action, entityType, entityId, details) {
  try {
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    db.prepare(`
      INSERT INTO activity_logs (log_id, actor_id, actor_name, action, entity_type, entity_id, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, actorId, actorName, action, entityType, entityId, details, new Date().toISOString());
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// ----------------------------------------------------
// AUTHENTICATION ROUTES
// ----------------------------------------------------

// Sign Up
app.post('/api/auth/signup', (req, res) => {
  const { name, age, gender, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // User requirement: "only 6 digit no.ya word specialchracutre for sign up"
  // Validate at least 6 characters (alphanumeric or special characters)
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters (numbers, letters, or special characters)' });
  }

  const existing = db.prepare('SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const userRole = role === 'admin' ? 'admin' : 'user';
  const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const passData = hashPassword(password);
  const now = new Date().toISOString();
  const avatarColors = ['#2563eb', '#4f46e5', '#7c3aed', '#059669', '#d97706', '#dc2626'];
  const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

  try {
    db.prepare(`
      INSERT INTO users (user_id, name, age, gender, email, password_hash, password_salt, role, account_status, avatar_color, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      name.trim(),
      parseInt(age) || 20,
      gender ? String(gender).trim() : 'Unspecified',
      email.trim().toLowerCase(),
      passData.hash,
      passData.salt,
      userRole,
      'active',
      avatarColor,
      now
    );

    // Create welcome notification
    db.prepare(`
      INSERT INTO notifications (notification_id, user_id, type, title, content, created_at, read_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'notif_' + Date.now(),
      userId,
      'welcome',
      'Welcome to Taskaro!',
      `Hi ${name}, your ${userRole} account is successfully set up. Start organizing your workflow today!`,
      now,
      0
    );

    logActivity(userId, name, 'SIGNUP', 'User', userId, `New ${userRole} registered: ${email}`);

    const userObj = { user_id: userId, name: name.trim(), email: email.trim().toLowerCase(), role: userRole, age: parseInt(age) || 20, gender: gender ? String(gender).trim() : 'Unspecified' };
    const token = createToken(userObj);

    return res.json({
      message: 'Account created successfully',
      token,
      user: {
        userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: userRole,
        age: parseInt(age) || 20,
        gender: gender ? String(gender).trim() : 'Unspecified',
        avatarColor
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Server error during account registration' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password, portalRole } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.account_status === 'deactivated') {
    return res.status(403).json({ error: 'This account has been deactivated. Please contact an administrator.' });
  }

  const isMatch = verifyPassword(password, user.password_hash, user.password_salt);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // If user selected specific portal (Admin vs User), verify they have access
  if (portalRole === 'admin' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: You do not have administrator permissions for Admin Portal.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login = ? WHERE user_id = ?').run(now, user.user_id);
  logActivity(user.user_id, user.name, 'LOGIN', 'User', user.user_id, `User logged in from ${portalRole || user.role} portal`);

  const token = createToken(user);

  return res.json({
    message: 'Login successful',
    token,
    user: {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      age: user.age,
      gender: user.gender || 'Unspecified',
      avatarColor: user.avatar_color
    }
  });
});

// Get current user profile
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT user_id, name, age, gender, email, role, account_status, avatar_color, created_at, last_login FROM users WHERE user_id = ?').get(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({ user });
});

// Update Profile
app.put('/api/auth/profile', authMiddleware, (req, res) => {
  const { name, age, gender, avatarColor } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  db.prepare(`
    UPDATE users SET name = ?, age = ?, gender = ?, avatar_color = ? WHERE user_id = ?
  `).run(
    name.trim(),
    parseInt(age) || req.user.age,
    gender ? String(gender).trim() : (req.user.gender || 'Unspecified'),
    avatarColor || '#2563eb',
    req.user.userId
  );

  return res.json({ message: 'Profile updated successfully' });
});

// Change Password
app.put('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = db.prepare('SELECT password_hash, password_salt FROM users WHERE user_id = ?').get(req.user.userId);
  if (!verifyPassword(currentPassword, user.password_hash, user.password_salt)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const passData = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE user_id = ?').run(passData.hash, passData.salt, req.user.userId);

  return res.json({ message: 'Password updated successfully' });
});

// ----------------------------------------------------
// TASKS API
// ----------------------------------------------------

// Helper to determine derived overdue status
function enrichTask(task) {
  const now = new Date();
  let isOverdue = false;
  if (task.deadline && task.status !== 'Completed') {
    const deadlineDate = new Date(task.deadline);
    if (deadlineDate < now) {
      isOverdue = true;
    }
  }

  return {
    ...task,
    isOverdue
  };
}

// Get Tasks
app.get('/api/tasks', authMiddleware, (req, res) => {
  let tasks = [];
  if (req.user.role === 'admin') {
    // Admin can see all system tasks
    tasks = db.prepare(`
      SELECT t.*, u.name as assignee_name, u.email as assignee_email,
             c.name as creator_name,
             p.title as prerequisite_title, p.status as prerequisite_status
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.user_id
      LEFT JOIN users c ON t.creator_id = c.user_id
      LEFT JOIN tasks p ON t.prerequisite_task_id = p.task_id
      ORDER BY t.created_at DESC
    `).all();
  } else {
    // Normal user sees tasks assigned to them or created by them
    tasks = db.prepare(`
      SELECT t.*, u.name as assignee_name, u.email as assignee_email,
             c.name as creator_name,
             p.title as prerequisite_title, p.status as prerequisite_status
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.user_id
      LEFT JOIN users c ON t.creator_id = c.user_id
      LEFT JOIN tasks p ON t.prerequisite_task_id = p.task_id
      WHERE t.assignee_id = ? OR t.creator_id = ?
      ORDER BY t.created_at DESC
    `).all(req.user.userId, req.user.userId);
  }

  const enriched = tasks.map(enrichTask);
  return res.json({ tasks: enriched });
});

// Create Task (Admin only can create and assign tasks)
app.post('/api/tasks', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied: Only administrators can create and assign tasks. Users can work on assigned tasks.' });
  }

  const {
    title,
    description,
    assignee_id,
    priority,
    deadline,
    duration_hours,
    task_type,
    prerequisite_task_id,
    category
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const now = new Date().toISOString();
  let initialStatus = 'Pending';

  // Dependency rule check
  const isDependent = task_type === 'Dependent' && prerequisite_task_id;
  if (isDependent) {
    const prereq = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(prerequisite_task_id);
    if (!prereq || prereq.status !== 'Completed') {
      initialStatus = 'Blocked';
    }
  }

  const targetAssignee = req.user.role === 'admin' ? (assignee_id || req.user.userId) : req.user.userId;

  try {
    db.prepare(`
      INSERT INTO tasks (
        task_id, title, description, assignee_id, creator_id, priority,
        status, task_type, prerequisite_task_id, deadline, progress,
        duration_hours, category, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      title.trim(),
      description || '',
      targetAssignee,
      req.user.userId,
      priority || 'Medium',
      initialStatus,
      task_type || 'Independent',
      prerequisite_task_id || null,
      deadline || null,
      0,
      parseFloat(duration_hours) || 1.0,
      category || 'General',
      now,
      now
    );

    // Notify assignee if assigned by admin to another user
    if (targetAssignee !== req.user.userId) {
      db.prepare(`
        INSERT INTO notifications (notification_id, user_id, type, title, content, created_at, read_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'notif_' + Date.now(),
        targetAssignee,
        'task_assigned',
        'New task assigned',
        `Admin assigned you task: "${title.trim()}". Deadline: ${deadline ? deadline.replace('T', ' ') : 'Not specified'}.`,
        now,
        0
      );
    }

    logActivity(req.user.userId, req.user.name, 'CREATE_TASK', 'Task', taskId, `Created task "${title.trim()}"`);

    return res.json({ message: 'Task created successfully', taskId });
  } catch (err) {
    console.error('Task create error:', err);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update Task
app.put('/api/tasks/:id', authMiddleware, (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Authorization check: Admin or Assignee/Creator
  if (req.user.role !== 'admin' && task.assignee_id !== req.user.userId && task.creator_id !== req.user.userId) {
    return res.status(403).json({ error: 'You are not authorized to update this task' });
  }

  const {
    title,
    description,
    priority,
    status,
    progress,
    deadline,
    duration_hours,
    assignee_id,
    prerequisite_task_id,
    task_type
  } = req.body;

  let newStatus = status !== undefined ? status : task.status;
  let newProgress = progress !== undefined ? parseInt(progress) : task.progress;

  // If status is changed to Completed, automatically set progress to 100%
  if (newStatus === 'Completed' && task.status !== 'Completed') {
    newProgress = 100;
  }

  // If progress is changed to 100%, set status to Completed
  if (newProgress === 100 && newStatus !== 'Completed') {
    newStatus = 'Completed';
  }

  // If task was blocked and someone tries to set In Progress without prerequisite complete:
  if (task.task_type === 'Dependent' && task.prerequisite_task_id && newStatus === 'In Progress') {
    const prereq = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(task.prerequisite_task_id);
    if (prereq && prereq.status !== 'Completed') {
      return res.status(400).json({ error: 'Cannot start task: Prerequisite task is not completed yet.' });
    }
  }

  const now = new Date().toISOString();
  const completedAt = newStatus === 'Completed' ? (task.completed_at || now) : null;
  const isAdmin = req.user.role === 'admin';

  db.prepare(`
    UPDATE tasks SET
      title = ?,
      description = ?,
      priority = ?,
      status = ?,
      progress = ?,
      deadline = ?,
      duration_hours = ?,
      assignee_id = ?,
      prerequisite_task_id = ?,
      task_type = ?,
      completed_at = ?,
      updated_at = ?
    WHERE task_id = ?
  `).run(
    isAdmin && title !== undefined ? title : task.title,
    isAdmin && description !== undefined ? description : task.description,
    isAdmin && priority !== undefined ? priority : task.priority,
    newStatus,
    newProgress,
    isAdmin && deadline !== undefined ? deadline : task.deadline,
    isAdmin && duration_hours !== undefined ? parseFloat(duration_hours) : task.duration_hours,
    isAdmin && assignee_id !== undefined ? assignee_id : task.assignee_id,
    isAdmin && prerequisite_task_id !== undefined ? prerequisite_task_id : task.prerequisite_task_id,
    isAdmin && task_type !== undefined ? task_type : task.task_type,
    completedAt,
    now,
    taskId
  );

  // If this task was completed, check if any dependent tasks can now be unblocked!
  if (newStatus === 'Completed' && task.status !== 'Completed') {
    updateDependentTasksStatus(taskId);
  }

  logActivity(req.user.userId, req.user.name, 'UPDATE_TASK', 'Task', taskId, `Updated task "${task.title}" to status "${newStatus}"`);

  return res.json({ message: 'Task updated successfully' });
});

// Delete Task (Admin only)
app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied: Only administrators can delete tasks.' });
  }

  const taskId = req.params.id;
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  db.prepare('DELETE FROM tasks WHERE task_id = ?').run(taskId);
  logActivity(req.user.userId, req.user.name, 'DELETE_TASK', 'Task', taskId, `Deleted task "${task.title}"`);

  return res.json({ message: 'Task deleted successfully' });
});

// ----------------------------------------------------
// USER MANAGEMENT (ADMIN ONLY)
// ----------------------------------------------------

app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.user_id, u.name, u.age, u.gender, u.email, u.role, u.account_status, u.avatar_color, u.created_at, u.last_login,
           (SELECT COUNT(*) FROM tasks WHERE assignee_id = u.user_id) as total_tasks,
           (SELECT COUNT(*) FROM tasks WHERE assignee_id = u.user_id AND status = 'Completed') as completed_tasks
    FROM users u
    ORDER BY u.created_at DESC
  `).all();

  return res.json({ users });
});

// Get user list for task assignment dropdown
app.get('/api/users/assignable', authMiddleware, (req, res) => {
  const users = db.prepare("SELECT user_id, name, email, role FROM users WHERE account_status = 'active'").all();
  return res.json({ users });
});

// Toggle user status (activate / deactivate)
app.put('/api/users/:id/status', authMiddleware, adminMiddleware, (req, res) => {
  const userId = req.params.id;
  const { status } = req.body; // 'active' or 'deactivated'

  if (userId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot deactivate your own admin account' });
  }

  db.prepare('UPDATE users SET account_status = ? WHERE user_id = ?').run(status, userId);
  logActivity(req.user.userId, req.user.name, 'UPDATE_USER_STATUS', 'User', userId, `Changed status to ${status}`);

  return res.json({ message: `User account ${status === 'active' ? 'activated' : 'deactivated'} successfully` });
});

// Admin create user
app.post('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  const { name, age, gender, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const passData = hashPassword(password);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (user_id, name, age, gender, email, password_hash, password_salt, role, account_status, avatar_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    name.trim(),
    parseInt(age) || 20,
    gender ? String(gender).trim() : 'Unspecified',
    email.trim().toLowerCase(),
    passData.hash,
    passData.salt,
    role || 'user',
    'active',
    '#2563eb',
    now
  );

  logActivity(req.user.userId, req.user.name, 'ADMIN_ADD_USER', 'User', userId, `Admin added user ${name} (${email})`);

  return res.json({ message: 'User added successfully', userId });
});

// ----------------------------------------------------
// TIME TABLE & SCHEDULE API
// ----------------------------------------------------

app.get('/api/schedules', authMiddleware, (req, res) => {
  const schedules = db.prepare(`
    SELECT * FROM schedules WHERE user_id = ? ORDER BY start_time ASC
  `).all(req.user.userId);
  return res.json({ schedules });
});

app.post('/api/schedules', authMiddleware, (req, res) => {
  const { title, day_of_week, start_time, end_time, activity_type, color, linked_task_id } = req.body;
  if (!title || !start_time || !end_time) {
    return res.status(400).json({ error: 'Title, start time, and end time are required' });
  }

  const scheduleId = 'sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO schedules (schedule_id, user_id, title, day_of_week, start_time, end_time, activity_type, color, linked_task_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scheduleId,
    req.user.userId,
    title.trim(),
    day_of_week || 'Daily',
    start_time,
    end_time,
    activity_type || 'Study',
    color || '#3b82f6',
    linked_task_id || null,
    now
  );

  return res.json({ message: 'Schedule entry created', scheduleId });
});

app.delete('/api/schedules/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM schedules WHERE schedule_id = ? AND user_id = ?').run(req.params.id, req.user.userId);
  return res.json({ message: 'Schedule entry removed' });
});

// ----------------------------------------------------
// DAILY ROUTINES API
// ----------------------------------------------------

app.get('/api/routines', authMiddleware, (req, res) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const routines = db.prepare(`
    SELECT r.*,
           (SELECT status FROM routine_logs WHERE routine_id = r.routine_id AND log_date = ?) as today_status
    FROM routines r
    WHERE r.user_id = ?
    ORDER BY r.scheduled_time ASC
  `).all(todayStr, req.user.userId);

  return res.json({ routines });
});

app.post('/api/routines', authMiddleware, (req, res) => {
  const { title, routine_type, scheduled_time } = req.body;
  if (!title || !scheduled_time) {
    return res.status(400).json({ error: 'Routine title and scheduled time are required' });
  }

  const routineId = 'rout_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO routines (routine_id, user_id, title, routine_type, scheduled_time, active_status, streak, created_at)
    VALUES (?, ?, ?, ?, ?, 1, 0, ?)
  `).run(
    routineId,
    req.user.userId,
    title.trim(),
    routine_type || 'custom',
    scheduled_time,
    now
  );

  return res.json({ message: 'Routine added successfully', routineId });
});

app.post('/api/routines/:id/log', authMiddleware, (req, res) => {
  const routineId = req.params.id;
  const { status } = req.body; // 'Completed' or 'Missed'
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const routine = db.prepare('SELECT * FROM routines WHERE routine_id = ? AND user_id = ?').get(routineId, req.user.userId);
  if (!routine) {
    return res.status(404).json({ error: 'Routine not found' });
  }

  const existingLog = db.prepare('SELECT * FROM routine_logs WHERE routine_id = ? AND log_date = ?').get(routineId, todayStr);
  if (existingLog) {
    db.prepare('UPDATE routine_logs SET status = ?, completed_at = ? WHERE log_id = ?').run(status, status === 'Completed' ? now : null, existingLog.log_id);
  } else {
    const logId = 'log_r_' + Date.now();
    db.prepare(`
      INSERT INTO routine_logs (log_id, routine_id, user_id, log_date, status, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(logId, routineId, req.user.userId, todayStr, status, status === 'Completed' ? now : null);
  }

  // Update streak
  let newStreak = routine.streak;
  if (status === 'Completed' && (!existingLog || existingLog.status !== 'Completed')) {
    newStreak += 1;
  } else if (status === 'Missed' && existingLog && existingLog.status === 'Completed') {
    newStreak = Math.max(0, newStreak - 1);
  }
  db.prepare('UPDATE routines SET streak = ? WHERE routine_id = ?').run(newStreak, routineId);

  return res.json({ message: `Routine marked as ${status}`, streak: newStreak });
});

app.delete('/api/routines/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM routines WHERE routine_id = ? AND user_id = ?').run(req.params.id, req.user.userId);
  return res.json({ message: 'Routine deleted' });
});

// ----------------------------------------------------
// EXAM PLANS & GOALS ROADMAP API
// ----------------------------------------------------

app.get('/api/plans', authMiddleware, (req, res) => {
  const plans = db.prepare(`
    SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.userId);

  const enrichedPlans = plans.map(p => {
    const topics = db.prepare('SELECT * FROM plan_topics WHERE plan_id = ? ORDER BY order_index ASC').all(p.plan_id);
    const totalTopics = topics.length;
    const completedTopics = topics.filter(t => t.status === 'Completed').length;
    const progressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

    // Calculate days remaining
    let daysRemaining = 0;
    if (p.target_date) {
      const target = new Date(p.target_date);
      const today = new Date();
      const diffTime = target - today;
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    return {
      ...p,
      topics,
      totalTopics,
      completedTopics,
      progressPercent,
      daysRemaining
    };
  });

  return res.json({ plans: enrichedPlans });
});

app.post('/api/plans', authMiddleware, (req, res) => {
  const { goal_name, category, duration_label, description, start_date, target_date } = req.body;
  if (!goal_name || !target_date) {
    return res.status(400).json({ error: 'Goal name and target date are required' });
  }

  const planId = 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO plans (plan_id, user_id, goal_name, category, duration_label, description, start_date, target_date, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)
  `).run(
    planId,
    req.user.userId,
    goal_name.trim(),
    category || 'Academic',
    duration_label || '3 Months',
    description || '',
    start_date || now.split('T')[0],
    target_date,
    now
  );

  return res.json({ message: 'Exam/Goal plan created', planId });
});

app.post('/api/plans/:id/topics', authMiddleware, (req, res) => {
  const planId = req.params.id;
  const { title, allocated_hours } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Topic title is required' });
  }

  const topicId = 'topic_' + Date.now();
  db.prepare(`
    INSERT INTO plan_topics (topic_id, plan_id, title, allocated_hours, status, order_index)
    VALUES (?, ?, ?, ?, 'Pending', 0)
  `).run(topicId, planId, title.trim(), parseFloat(allocated_hours) || 2.0);

  return res.json({ message: 'Topic added', topicId });
});

app.put('/api/plans/topics/:topicId', authMiddleware, (req, res) => {
  const { topicId } = req.params;
  const { status } = req.body; // 'Completed' or 'Pending'

  db.prepare('UPDATE plan_topics SET status = ? WHERE topic_id = ?').run(status, topicId);
  return res.json({ message: 'Topic status updated' });
});

// Prep Sessions (Planned vs Actual Time)
app.get('/api/prep-sessions', authMiddleware, (req, res) => {
  const sessions = db.prepare(`
    SELECT * FROM prep_sessions WHERE user_id = ? ORDER BY session_date DESC LIMIT 30
  `).all(req.user.userId);
  return res.json({ sessions });
});

app.post('/api/prep-sessions', authMiddleware, (req, res) => {
  const { plan_id, topic_title, planned_minutes, actual_minutes, session_date, notes } = req.body;
  const sessionId = 'sess_' + Date.now();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO prep_sessions (session_id, user_id, plan_id, topic_title, planned_minutes, actual_minutes, session_date, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    req.user.userId,
    plan_id || 'general',
    topic_title || 'General Revision',
    parseInt(planned_minutes) || 60,
    parseInt(actual_minutes) || 60,
    session_date || now.split('T')[0],
    notes || '',
    now
  );

  return res.json({ message: 'Preparation session logged', sessionId });
});

// ----------------------------------------------------
// NOTES API
// ----------------------------------------------------

app.get('/api/notes', authMiddleware, (req, res) => {
  const notes = db.prepare(`
    SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC
  `).all(req.user.userId);
  return res.json({ notes });
});

app.post('/api/notes', authMiddleware, (req, res) => {
  const { title, content, category, tags, pinned, linked_task_id, linked_plan_id } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Note title is required' });
  }

  const noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO notes (note_id, user_id, title, content, category, tags, pinned, linked_task_id, linked_plan_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    noteId,
    req.user.userId,
    title.trim(),
    content || '',
    category || 'General',
    tags || '',
    pinned ? 1 : 0,
    linked_task_id || null,
    linked_plan_id || null,
    now,
    now
  );

  return res.json({ message: 'Note saved successfully', noteId });
});

app.put('/api/notes/:id', authMiddleware, (req, res) => {
  const noteId = req.params.id;
  const { title, content, category, tags, pinned } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE notes SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      category = COALESCE(?, category),
      tags = COALESCE(?, tags),
      pinned = COALESCE(?, pinned),
      updated_at = ?
    WHERE note_id = ? AND user_id = ?
  `).run(title, content, category, tags, pinned !== undefined ? (pinned ? 1 : 0) : null, now, noteId, req.user.userId);

  return res.json({ message: 'Note updated successfully' });
});

app.delete('/api/notes/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM notes WHERE note_id = ? AND user_id = ?').run(req.params.id, req.user.userId);
  return res.json({ message: 'Note deleted' });
});

// ----------------------------------------------------
// MESSAGES & CONVERSATIONS API
// ----------------------------------------------------

app.get('/api/messages', authMiddleware, (req, res) => {
  if (req.user.role === 'admin') {
    // Admin can see conversation with selected user or list of all active conversations
    const otherUserId = req.query.userId;
    if (otherUserId) {
      const messages = db.prepare(`
        SELECT m.*, s.name as sender_name, r.name as receiver_name
        FROM messages m
        LEFT JOIN users s ON m.sender_id = s.user_id
        LEFT JOIN users r ON m.receiver_id = r.user_id
        WHERE (m.sender_id = ? AND m.receiver_id = ?)
           OR (m.sender_id = ? AND m.receiver_id = ?)
           OR m.receiver_id = 'ALL'
        ORDER BY m.sent_at ASC
      `).all(req.user.userId, otherUserId, otherUserId, req.user.userId);
      return res.json({ messages });
    } else {
      // List conversations summary
      const usersWithMessages = db.prepare(`
        SELECT DISTINCT u.user_id, u.name, u.email, u.avatar_color,
               (SELECT content FROM messages WHERE (sender_id = u.user_id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.user_id) ORDER BY sent_at DESC LIMIT 1) as last_message,
               (SELECT sent_at FROM messages WHERE (sender_id = u.user_id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.user_id) ORDER BY sent_at DESC LIMIT 1) as last_sent,
               (SELECT COUNT(*) FROM messages WHERE sender_id = u.user_id AND receiver_id = ? AND read_status = 0) as unread_count
        FROM users u
        WHERE u.user_id != ? AND u.account_status = 'active'
      `).all(req.user.userId, req.user.userId, req.user.userId, req.user.userId, req.user.userId, req.user.userId);
      return res.json({ conversations: usersWithMessages });
    }
  } else {
    // Normal user communicates with Admin
    const messages = db.prepare(`
      SELECT m.*, s.name as sender_name, r.name as receiver_name
      FROM messages m
      LEFT JOIN users s ON m.sender_id = s.user_id
      LEFT JOIN users r ON m.receiver_id = r.user_id
      WHERE m.sender_id = ? OR m.receiver_id = ? OR m.receiver_id = 'ALL'
      ORDER BY m.sent_at ASC
    `).all(req.user.userId, req.user.userId);

    // Mark incoming messages as read
    db.prepare('UPDATE messages SET read_status = 1 WHERE receiver_id = ?').run(req.user.userId);

    return res.json({ messages });
  }
});

app.post('/api/messages', authMiddleware, (req, res) => {
  const { receiver_id, content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  let targetReceiver = receiver_id;
  if (req.user.role !== 'admin' && !targetReceiver) {
    // If user sends without receiver, default to first active Admin
    const admin = db.prepare("SELECT user_id FROM users WHERE role = 'admin' LIMIT 1").get();
    targetReceiver = admin ? admin.user_id : 'admin';
  }

  const messageId = 'msg_' + Date.now();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (message_id, sender_id, receiver_id, content, sent_at, read_status)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(messageId, req.user.userId, targetReceiver, content.trim(), now);

  // Also create a notification for the recipient
  if (targetReceiver !== 'ALL') {
    db.prepare(`
      INSERT INTO notifications (notification_id, user_id, type, title, content, created_at, read_status)
      VALUES (?, ?, 'message', 'New message received', ?, ?, 0)
    `).run(
      'notif_' + Date.now(),
      targetReceiver,
      `New message from ${req.user.name}: "${content.trim().substring(0, 40)}..."`,
      now
    );
  }

  return res.json({ message: 'Message sent', messageId });
});

// ----------------------------------------------------
// NOTIFICATIONS API
// ----------------------------------------------------

app.get('/api/notifications', authMiddleware, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30
  `).all(req.user.userId);
  return res.json({ notifications });
});

app.put('/api/notifications/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read_status = 1 WHERE user_id = ?').run(req.user.userId);
  return res.json({ message: 'All notifications marked as read' });
});

app.delete('/api/notifications/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE notification_id = ? AND user_id = ?').run(req.params.id, req.user.userId);
  return res.json({ message: 'Notification removed' });
});

// ----------------------------------------------------
// ACTIVITY LOGS API (ADMIN ONLY)
// ----------------------------------------------------

app.get('/api/activity-logs', authMiddleware, adminMiddleware, (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100
  `).all();
  return res.json({ logs });
});

// ----------------------------------------------------
// DASHBOARD & ANALYTICS API
// ----------------------------------------------------

app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  const now = new Date();

  if (req.user.role === 'admin') {
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'").get().count;
    const allTasks = db.prepare('SELECT * FROM tasks').all();

    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    for (const t of allTasks) {
      if (t.status === 'Completed') {
        completed++;
      } else {
        if (t.deadline && new Date(t.deadline) < now) {
          overdue++;
        }
        if (t.status === 'In Progress') {
          inProgress++;
        } else if (t.status === 'Pending' || t.status === 'Blocked') {
          pending++;
        }
      }
    }

    const totalTasks = allTasks.length;
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

    return res.json({
      role: 'admin',
      totalUsers,
      totalTasks,
      pending,
      inProgress,
      completed,
      overdue,
      completionRate
    });
  } else {
    // Personal user stats (matches screenshot image 2: Total tasks 8, Pending 3, In Progress 5, Completed 0)
    const userTasks = db.prepare(`
      SELECT * FROM tasks WHERE assignee_id = ? OR creator_id = ?
    `).all(req.user.userId, req.user.userId);

    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    for (const t of userTasks) {
      if (t.status === 'Completed') {
        completed++;
      } else {
        if (t.deadline && new Date(t.deadline) < now) {
          overdue++;
        }
        if (t.status === 'In Progress') {
          inProgress++;
        } else if (t.status === 'Pending' || t.status === 'Blocked') {
          pending++;
        }
      }
    }

    const totalTasks = userTasks.length;
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

    // Routine streak
    const userRoutines = db.prepare('SELECT streak FROM routines WHERE user_id = ?').all(req.user.userId);
    const avgStreak = userRoutines.length > 0 ? Math.round(userRoutines.reduce((acc, r) => acc + r.streak, 0) / userRoutines.length) : 0;

    return res.json({
      role: 'user',
      userName: req.user.name,
      totalTasks,
      pending,
      inProgress,
      completed,
      overdue,
      completionRate,
      avgStreak
    });
  }
});

// ----------------------------------------------------
// AI ASSISTANT API (BILINGUAL: ENGLISH & HINGLISH)
// ----------------------------------------------------

app.post('/api/ai/ask', authMiddleware, (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const query = question.toLowerCase().trim();
  const now = new Date();

  // Detect Hinglish / Hindi keywords
  const hinglishTokens = ['kya', 'kaise', 'kitne', 'kitna', 'hai', 'karo', 'kare', 'kaun', 'kaunsa', 'batao', 'bache', 'baki', 'aaj', 'kal', 'kyu', 'kyun', 'hoga', 'mujhe', 'mera', 'meri', 'padhai', 'taiyari', 'samjhao', 'kisko', 'jyada', 'chal', 'raha'];
  const isHinglish = hinglishTokens.some(token => query.includes(token));

  // Role check: Admin AI vs User AI
  if (req.user.role === 'admin') {
    const allUsers = db.prepare("SELECT user_id, name, email FROM users WHERE role = 'user'").all();
    const allTasks = db.prepare(`
      SELECT t.*, u.name as assignee_name FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.user_id
    `).all();

    // 1. User Count
    if (query.includes('how many user') || query.includes('user count') || query.includes('registered') || query.includes('kitne user') || query.includes('kitne log')) {
      if (isHinglish) {
        return res.json({
          answer: `Platform par abhi kul **${allUsers.length} registered users** active hain.`
        });
      }
      return res.json({
        answer: `There are currently **${allUsers.length} registered users** active on the Taskaro platform.`
      });
    }

    // 2. Overdue Tasks
    if (query.includes('overdue') || query.includes('delayed') || query.includes('late') || query.includes('deadline') || query.includes('late task')) {
      const overdueTasks = allTasks.filter(t => t.status !== 'Completed' && t.deadline && new Date(t.deadline) < now);
      if (overdueTasks.length === 0) {
        return res.json({
          answer: isHinglish ? 'Bahut badhiya! Abhi system me koi bhi overdue ya late task nahi hai.' : 'Great news! There are currently no overdue tasks across the system.'
        });
      }
      const list = overdueTasks.map(t => `- **${t.title}** (Assignee: ${t.assignee_name || 'Unassigned'}, Due: ${t.deadline.split('T')[0]})`).join('\n');
      return res.json({
        answer: isHinglish
          ? `System me **${overdueTasks.length} overdue task(s)** mile hain jinpar attention chahiye:\n\n${list}`
          : `Found **${overdueTasks.length} overdue task(s)** requiring admin attention:\n\n${list}`
      });
    }

    // 3. Workload & Assignment Recommendations
    if (query.includes('workload') || query.includes('highest workload') || query.includes('suggest assignment') || query.includes('kiske paas') || query.includes('jyada kaam') || query.includes('kisko assign') || query.includes('free kaun')) {
      const counts = {};
      allUsers.forEach(u => { counts[u.name] = 0; });
      allTasks.forEach(t => {
        if (t.assignee_name && counts[t.assignee_name] !== undefined && t.status !== 'Completed') {
          counts[t.assignee_name]++;
        }
      });

      let highestUser = '', maxCount = -1, lowestUser = '', minCount = 9999;
      for (const [name, count] of Object.entries(counts)) {
        if (count > maxCount) { maxCount = count; highestUser = name; }
        if (count < minCount) { minCount = count; lowestUser = name; }
      }

      if (isHinglish) {
        return res.json({
          answer: `**Workload Analysis:**\n- **Sabse Jyada Load:** ${highestUser || 'N/A'} ke paas abhi ${maxCount >= 0 ? maxCount : 0} active tasks hain.\n- **Naye Task ke liye Recommended:** ${lowestUser || 'Koi bhi available user'} ke paas sabse kam (${minCount === 9999 ? 0 : minCount}) tasks hain.\n\n💡 *Smart Suggestion:* Team balance maintain karne ke liye naye tasks ${lowestUser} ko assign karein.`
        });
      }

      return res.json({
        answer: `**Workload Analysis:**\n- **Highest Active Load:** ${highestUser || 'N/A'} with ${maxCount >= 0 ? maxCount : 0} active tasks.\n- **Recommended for New Assignments:** ${lowestUser || 'Any available user'} has the lowest load (${minCount === 9999 ? 0 : minCount} active tasks).\n\n*Smart Recommendation:* Distribute incoming high-priority assignments to ${lowestUser} to maintain team balance.`
      });
    }

    // Default Admin AI response
    const completedCount = allTasks.filter(t => t.status === 'Completed').length;
    const rate = allTasks.length > 0 ? Math.round((completedCount / allTasks.length) * 100) : 0;
    if (isHinglish) {
      return res.json({
        answer: `**Taskaro System Overview:**\n- Total Tasks: ${allTasks.length}\n- Completed: ${completedCount} (${rate}% overall completion rate)\n- Active Users: ${allUsers.length}\n\nAap mujhse overdue tasks, team workload, user status, ya smart assignment suggestions ke baare me pooch sakte hain!`
      });
    }
    return res.json({
      answer: `**Taskaro System Summary:**\n- Total Tasks: ${allTasks.length}\n- Completed: ${completedCount} (${rate}% overall completion rate)\n- Active Users: ${allUsers.length}\n\nYou can ask me about overdue tasks, workload analysis, user progress, or assignment recommendations!`
    });

  } else {
    // User AI questions (Personal Productivity Assistant)
    const userTasks = db.prepare(`
      SELECT * FROM tasks WHERE assignee_id = ? OR creator_id = ?
    `).all(req.user.userId, req.user.userId);

    const userRoutines = db.prepare('SELECT * FROM routines WHERE user_id = ?').all(req.user.userId);
    const userPlans = db.prepare('SELECT * FROM plans WHERE user_id = ?').all(req.user.userId);
    const userNotes = db.prepare('SELECT * FROM notes WHERE user_id = ?').all(req.user.userId);

    // 1. What should I do today / Focus
    if (query.includes('today') || query.includes('recommend') || query.includes('what should') || query.includes('aaj kya') || query.includes('aaj ka') || query.includes('kya karu') || query.includes('kaunsa task') || query.includes('pehle kya')) {
      const pendingTasks = userTasks.filter(t => t.status === 'In Progress' || t.status === 'Pending');
      if (pendingTasks.length === 0) {
        return res.json({
          answer: isHinglish
            ? 'Shaandar! Aaj ke liye aapke paas koi pending task nahi hai. Aap apne exam roadmaps ya revision par focus kar sakte hain.'
            : `You don't have any pending tasks right now! Great job. Consider planning ahead or working on your exam roadmap.`
        });
      }
      const topTasks = pendingTasks.slice(0, 3).map(t => `- **${t.title}** (Priority: ${t.priority}, Progress: ${t.progress}%)`).join('\n');
      if (isHinglish) {
        return res.json({
          answer: `Aaj ke liye aapka **High-Impact Action Plan** yeh hai:\n\n${topTasks}\n\n💡 *Focus Tip: Subah sabse pehle High Priority task se shuru karein bina kisi distraction ke.*`
        });
      }
      return res.json({
        answer: `Here is your high-impact action plan for today:\n\n${topTasks}\n\n💡 *Tip: Start with your highest priority task first thing in the morning.*`
      });
    }

    // 2. Pending Tasks Count
    if (query.includes('pending') || query.includes('how many') || query.includes('count') || query.includes('kitne task') || query.includes('kitna bacha') || query.includes('kitne baki') || query.includes('kitna kaam')) {
      const pending = userTasks.filter(t => t.status === 'Pending' || t.status === 'In Progress').length;
      const completed = userTasks.filter(t => t.status === 'Completed').length;
      if (isHinglish) {
        return res.json({
          answer: `Aapke kul **${userTasks.length} tasks** me se abhi **${pending} pending/in-progress** hain aur **${completed} completed** ho chuke hain.`
        });
      }
      return res.json({
        answer: `You currently have **${pending} active/pending task(s)** and **${completed} completed task(s)** out of ${userTasks.length} total tasks.`
      });
    }

    // 3. Blocked / Locked Tasks
    if (query.includes('blocked') || query.includes('locked') || query.includes('lock kyu') || query.includes('block kyu') || query.includes('open kyu') || query.includes('unlock')) {
      const blockedTasks = userTasks.filter(t => t.status === 'Blocked' || t.task_type === 'Dependent');
      if (blockedTasks.length === 0) {
        return res.json({
          answer: isHinglish ? 'Aapka koi bhi task abhi locked ya blocked nahi hai! Sab ready hain.' : 'None of your tasks are currently blocked!'
        });
      }
      const explanations = blockedTasks.map(t => {
        const prereq = db.prepare('SELECT title, status FROM tasks WHERE task_id = ?').get(t.prerequisite_task_id);
        if (isHinglish) {
          return `- **${t.title}**: Yeh task locked hai kyunki iska prerequisite **"${prereq ? prereq.title : 'Prerequisite task'}"** (Status: ${prereq ? prereq.status : 'Incomplete'}) abhi complete nahi hua. Jaise hi woh complete mark hoga, yeh automatically unlock ho jayega!`;
        }
        return `- **${t.title}**: Blocked waiting for prerequisite **"${prereq ? prereq.title : 'Prerequisite task'}"** (Current status: ${prereq ? prereq.status : 'Incomplete'}). Once that is marked completed, this task will automatically unlock!`;
      }).join('\n');
      return res.json({
        answer: isHinglish
          ? `Aapke dependent task ke locked hone ka kaaran:\n\n${explanations}`
          : `Here is why your dependent task is locked:\n\n${explanations}`
      });
    }

    // 4. Daily Routine / Timetable
    if (query.includes('routine') || query.includes('timetable') || query.includes('schedule') || query.includes('din ka plan') || query.includes('routine banao')) {
      if (isHinglish) {
        return res.json({
          answer: `Aapke schedule ke hisab se ek optimized **Daily Productivity Routine**:\n\n1. **06:00 AM** — Wake Up, Hydrate & Light Exercise\n2. **07:30 AM** — Deep Work Block 1 (Core Concepts & Math Problem Solving)\n3. **09:30 AM** — Breakfast & Healthy Break\n4. **11:00 AM** — Lab Practicals & Coding Sessions\n5. **02:00 PM** — Lunch & 20-min Power Nap\n6. **05:00 PM** — Pending Tasks & Assignment Completion\n7. **09:30 PM** — Day Review, Streak Check & Kal ka Planning\n\nKya aap chahte hain ki main ise aapke **Routine** tab me directly add kar doon?`
        });
      }
      return res.json({
        answer: `Here is an optimized study & productivity routine tailored for your schedule:\n\n1. **06:00 AM** — Wake Up, Hydrate & Light Exercise\n2. **07:30 AM** — Deep Work Session 1 (Core Academic Concepts)\n3. **09:30 AM** — Breakfast & Break\n4. **11:00 AM** — Lab Practicals & Coding Practice\n5. **02:00 PM** — Quick Review & Lunch\n6. **05:00 PM** — Problem Solving & Assignment Work\n7. **09:30 PM** — Daily Wrap-up, Streak Check & Next Day Prep\n\nWould you like me to automatically add these time blocks to your Routine tab?`
      });
    }

    // 5. Notes & Summarization
    if (query.includes('note') || query.includes('python') || query.includes('notes') || query.includes('samjhao') || query.includes('formula')) {
      const pythonNote = userNotes.find(n => n.title.toLowerCase().includes('python') || n.category.toLowerCase().includes('python'));
      if (pythonNote) {
        return res.json({
          answer: isHinglish
            ? `**"${pythonNote.title}" ka Summary:**\n\n${pythonNote.content}\n\n💡 *Key Takeaway:* Object-Oriented Programming real-world objects ko classes ke through model karta hai aur encapsulation & polymorphism se code ko clean banata hai.`
            : `**Summary of "${pythonNote.title}":**\n\n${pythonNote.content}\n\n*Key Takeaway:* Object-Oriented Programming models real-world entities through classes and instances, maintaining clean code via encapsulation and polymorphism.`
        });
      }
      return res.json({
        answer: isHinglish
          ? `Aapke paas workspace me **${userNotes.length} notes** saved hain. Aap Notes tab me jakar unhe revision ya roadmap se link kar sakte hain.`
          : `You have ${userNotes.length} note(s) saved in your workspace. Use the Notes tab to search, pin, or link notes to your exam roadmap.`
      });
    }

    // 6. Exam / Plans / Roadmaps
    if (query.includes('exam') || query.includes('nimcet') || query.includes('target') || query.includes('plan') || query.includes('taiyari') || query.includes('padhai')) {
      const activePlan = userPlans[0];
      if (isHinglish) {
        return res.json({
          answer: `Aapke exam target (**${activePlan ? activePlan.goal_name : 'External Practicals / NIMCET'}**) ke liye preparation plan:\n- Rozana 25 objective sawal solve karein.\n- Operating Systems aur Algorithms ke key concepts ka revision karein.\n- Har roz 90 minute ka uninterrupted deep focus session lagayein target complete karne ke liye.`
        });
      }
      return res.json({
        answer: `For your exam preparation (${activePlan ? activePlan.goal_name : 'NIMCET / Semester Goals'}):\n- Practice 25 objective problems daily.\n- Review mathematical formulas and time complexity in algorithms.\n- Allocate 90 minutes of uninterrupted focus daily to maintain your target roadmap.`
      });
    }

    // Default friendly user assistant response
    if (isHinglish) {
      return res.json({
        answer: `Namaste ${req.user.name}! Main aapka personal Taskaro AI assistant hoon. Mere paas aapke ${userTasks.length} tasks, daily routines aur exam roadmaps ka poora context hai.\n\nAap mujhse Hinglish ya English kisi me bhi pooch sakte hain:\n- *"Aaj mujhe kya karna chahiye?"*\n- *"Kitne tasks pending hain?"*\n- *"Mera task lock kyu hai?"*\n- *"Daily routine banake do"*\n- *"Python ke notes samjhao"*\n- *"Exam ki taiyari kaise kare?"*`
      });
    }
    return res.json({
      answer: `Hello ${req.user.name}! I am your personal Taskaro AI assistant. I have full context of your ${userTasks.length} tasks, ${userRoutines.length} daily routines, and exam roadmaps.\n\nYou can ask me:\n- *"What should I complete today?"*\n- *"How many tasks are pending?"*\n- *"Why is my task blocked?"*\n- *"Create a daily routine for me"*\n- *"Summarize my Python notes"*`
    });
  }
});

// Fallback to index.html for SPA client-side routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`TASKARO Server running at http://localhost:${PORT}`);
  console.log(`Also accessible at: http://127.0.0.1:${PORT}`);
  console.log(`Persistent Database: ${path.join(__dirname, 'data', 'taskaro.db')}`);
  console.log(`Admin Demo: admin@taskaro.com (password: admin123)`);
  console.log(`User Demo: chiku@taskaro.com (password: user123)`);
  console.log(`=======================================================`);
});
