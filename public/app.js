// ==========================================================================
// TASKARO - Core Client Application Controller
// Incorporating User Dashboard & Admin Structure from Design References
// ==========================================================================

const API_BASE = '/api';

// Application State
const state = {
  token: localStorage.getItem('taskaro_token') || null,
  user: JSON.parse(localStorage.getItem('taskaro_user') || 'null'),
  portalRole: 'user', // 'user' or 'admin'
  authMode: 'signin',
  activeTab: 'home',
  tasks: [],
  routines: [],
  plans: [],
  notes: [],
  schedules: [],
  notifications: [],
  users: [],
  stats: {},
  filterTaskState: 'all',
  selectedChatUserId: null
};

// Chart instances for memory cleanup
let chartSplineInstance = null;
let chartGaugeInstance = null;
let chartMonthlyInstance = null;
let chartEfficiencyInstance = null;

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuth();
});

function updateThemeIcons(theme) {
  const icon = theme === 'dark' ? '☀️' : '🌙';
  document.querySelectorAll('.theme-toggle-icon, #themeIcon').forEach(el => {
    el.textContent = icon;
  });
}

function initTheme() {
  const savedTheme = localStorage.getItem('taskaro_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcons(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const target = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem('taskaro_theme', target);
  updateThemeIcons(target);
}

// ----------------------------------------------------
// AUTHENTICATION LOGIC & PORTAL SWITCHING
// ----------------------------------------------------
function checkAuth() {
  if (state.token && state.user) {
    showApp();
  } else {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('authView').style.display = 'flex';
  document.getElementById('userShell').style.display = 'none';
  document.getElementById('adminShell').style.display = 'none';
  renderAuthMode();
}

function showApp() {
  document.getElementById('authView').style.display = 'none';

  if (state.user.role === 'admin') {
    // Show Admin Shell
    document.getElementById('userShell').style.display = 'none';
    document.getElementById('adminShell').style.display = 'flex';
    document.getElementById('adminTopbarName').textContent = state.user.name;
    const adminAvatar = document.getElementById('adminAvatarCircle');
    if (adminAvatar) {
      adminAvatar.textContent = state.user.name.charAt(0).toUpperCase();
    }
    navigateToTab('admin-dashboard');
  } else {
    // Show User Shell
    document.getElementById('adminShell').style.display = 'none';
    document.getElementById('userShell').style.display = 'flex';
    document.getElementById('navUserName').textContent = state.user.name;
    const avatarCircle = document.getElementById('userAvatarCircle');
    if (avatarCircle) {
      avatarCircle.textContent = state.user.name.charAt(0).toUpperCase();
      avatarCircle.style.backgroundColor = state.user.avatarColor || '#2563eb';
    }
    updateGreeting();
    navigateToTab('home');
  }

  loadAllData();
}

function updateGreeting() {
  const greetingEl = document.getElementById('welcomeGreeting');
  if (!greetingEl) return;
  const hour = new Date().getHours();
  let timeGreeting = 'Good morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  else if (hour >= 17) timeGreeting = 'Good evening';

  greetingEl.textContent = `${timeGreeting}, ${state.user.name}`;
}

function switchPortalRole(role) {
  state.portalRole = role;
  document.getElementById('tabRoleUser').classList.toggle('active', role === 'user');
  document.getElementById('tabRoleAdmin').classList.toggle('active', role === 'admin');

  const roleSelect = document.getElementById('authRoleSelect');
  if (roleSelect) {
    roleSelect.value = role;
  }
}

function toggleAuthMode(event) {
  if (event) event.preventDefault();
  state.authMode = state.authMode === 'signup' ? 'signin' : 'signup';
  renderAuthMode();
}

function renderAuthMode() {
  const isSignup = state.authMode === 'signup';
  document.getElementById('authFormTitle').textContent = isSignup ? 'Create account' : 'Welcome Back';
  document.getElementById('authFormSubtitle').textContent = isSignup
    ? 'Start building a calmer, clearer workflow.'
    : 'Sign in to your account and continue your journey.';

  document.querySelectorAll('.signup-only').forEach(el => {
    if (el.classList.contains('signup-grid')) {
      el.style.display = isSignup ? 'grid' : 'none';
    } else {
      el.style.display = isSignup ? 'block' : 'none';
    }
  });

  document.getElementById('authSubmitBtn').textContent = isSignup ? 'Create account' : 'Login →';
  document.getElementById('authTogglePrompt').textContent = isSignup ? 'Already have an account?' : 'New to Taskaro?';
  document.getElementById('authToggleLink').textContent = isSignup ? 'Sign in' : 'Create Account →';

  const pwdInput = document.getElementById('authPassword');
  pwdInput.placeholder = isSignup ? 'At least 6 characters' : 'Enter 6 digit numeric password';
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

function quickFillLogin(email, password, role) {
  state.authMode = 'signin';
  renderAuthMode();
  switchPortalRole(role);
  document.getElementById('authEmail').value = email;
  document.getElementById('authPassword').value = password;
  showToast(`Autofilled demo ${role} credentials! Click "Sign in" to continue.`, 'info');
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  if (state.authMode === 'signup') {
    const name = document.getElementById('authName').value.trim();
    const age = parseInt(document.getElementById('authAge').value) || 20;
    const gender = document.getElementById('authGender') ? document.getElementById('authGender').value : 'Unspecified';
    const role = document.getElementById('authRoleSelect').value || state.portalRole;
    const confirmPassword = document.getElementById('authConfirmPassword').value;

    if (!name) {
      return showToast('Please enter your full name', 'error');
    }
    if (!gender) {
      return showToast('Please select your gender', 'error');
    }
    if (password.length < 6) {
      return showToast('Password must be at least 6 characters (numbers, words, or special characters)', 'error');
    }
    if (password !== confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, age, gender, email, password, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');

      localStorage.setItem('taskaro_token', data.token);
      localStorage.setItem('taskaro_user', JSON.stringify(data.user));
      state.token = data.token;
      state.user = data.user;
      showToast('Account created successfully!', 'success');
      showApp();
    } catch (err) {
      showToast(err.message, 'error');
    }

  } else {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, portalRole: state.portalRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('taskaro_token', data.token);
      localStorage.setItem('taskaro_user', JSON.stringify(data.user));
      state.token = data.token;
      state.user = data.user;
      showToast(`Welcome back, ${data.user.name}!`, 'success');
      showApp();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function handleLogout() {
  localStorage.removeItem('taskaro_token');
  localStorage.removeItem('taskaro_user');
  state.token = null;
  state.user = null;
  showToast('Signed out successfully', 'info');
  showAuth();
}

// ----------------------------------------------------
// TAB NAVIGATION
// ----------------------------------------------------
function navigateToTab(tabName) {
  state.activeTab = tabName;

  // Update navbar & sidebar active styles
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  // Hide all tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.style.display = 'none';
  });

  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) {
    activePane.style.display = 'block';
  }

  // Update Admin breadcrumb header
  const breadcrumb = document.getElementById('adminSectionBreadcrumb');
  if (breadcrumb) {
    const titles = {
      'admin-dashboard': 'Dashboard Overview',
      'admin-tasks': 'Task Operations & Management',
      'admin-users': 'Users & Access Control',
      'admin-reports': 'Team Analytics & Reports',
      'admin-messages': 'Team Communications',
      'admin-logs': 'Security & Activity Logs',
      'admin-ai': 'Ask AI'
    };
    breadcrumb.textContent = titles[tabName] || 'Admin Console';
  }

  // Refresh view data
  if (tabName === 'home') renderHomeTab();
  if (tabName === 'tasks') renderTasksTab();
  if (tabName === 'timetable') loadSchedules();
  if (tabName === 'plans') loadPlans();
  if (tabName === 'notes') loadNotes();
  if (tabName === 'messages') loadUserMessages();
  if (tabName === 'profile') loadProfileSettings();

  // Admin tabs
  if (tabName === 'admin-dashboard') renderAdminDashboardView();
  if (tabName === 'admin-tasks') renderAdminTasksView();
  if (tabName === 'admin-users') renderAdminUsersView();
  if (tabName === 'admin-reports') renderAdminReportsView();
  if (tabName === 'admin-messages') loadAdminMessages();
  if (tabName === 'admin-logs') loadAdminLogsView();
}

// ----------------------------------------------------
// API CALL HELPER
// ----------------------------------------------------
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${state.token}`
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (res.status === 401) {
    handleLogout();
    throw new Error('Session expired. Please log in again.');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadAllData() {
  try {
    await Promise.all([
      loadDashboardStats(),
      loadTasks(),
      loadNotifications(),
      loadPlans(),
      loadRoutines(),
      loadNotes(),
      loadUsersList()
    ]);
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

async function loadUsersList() {
  try {
    if (state.user && state.user.role === 'admin') {
      const data = await apiCall('/users');
      state.users = data.users;
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadDashboardStats() {
  try {
    const data = await apiCall('/dashboard/stats');
    state.stats = data;

    if (data.role === 'admin') {
      const tasksEl = document.getElementById('adminStatTasks');
      const compEl = document.getElementById('adminStatCompleted');
      const inProgEl = document.getElementById('adminStatInProgress');
      const overEl = document.getElementById('adminStatOverdue');

      if (tasksEl) tasksEl.textContent = data.totalTasks;
      if (compEl) compEl.textContent = data.completed;
      if (inProgEl) inProgEl.textContent = data.inProgress;
      if (overEl) overEl.textContent = data.overdue;

      const compRateEl = document.getElementById('analyticsCompRate');
      if (compRateEl) compRateEl.textContent = `${data.completionRate}%`;
    } else {
      document.getElementById('statTotalTasks').textContent = data.totalTasks;
      document.getElementById('statPendingTasks').textContent = data.pending;
      document.getElementById('statInProgressTasks').textContent = data.inProgress;
      document.getElementById('statCompletedTasks').textContent = data.completed;
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadTasks() {
  try {
    const data = await apiCall('/tasks');
    state.tasks = data.tasks;
    renderHomeTasks();
    if (state.activeTab === 'tasks') renderTasksTab();
    if (state.activeTab === 'admin-dashboard') renderAdminDashboardView();
    if (state.activeTab === 'admin-tasks') renderAdminTasksView();
  } catch (err) {
    console.error('Failed to load tasks:', err);
  }
}

async function loadNotifications() {
  try {
    const data = await apiCall('/notifications');
    state.notifications = data.notifications;
    renderNotificationsDrawer();

    const unreadCount = state.notifications.filter(n => n.read_status === 0).length;
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

async function loadPlans() {
  try {
    const data = await apiCall('/plans');
    state.plans = data.plans;

    if (state.plans.length > 0) {
      const activePlan = state.plans[0];
      const nameEl = document.getElementById('activeGoalName');
      const catEl = document.getElementById('activeGoalCategory');
      const durEl = document.getElementById('activeGoalDuration');
      const daysEl = document.getElementById('activeGoalDays');
      const targetDateEl = document.getElementById('activeGoalTargetDate');

      if (nameEl) nameEl.textContent = activePlan.goal_name;
      if (catEl) catEl.textContent = activePlan.category || 'Academic';
      if (durEl) durEl.textContent = activePlan.duration_label || '3 Months';
      if (daysEl) daysEl.textContent = activePlan.daysRemaining;
      if (targetDateEl && activePlan.target_date) {
        const d = new Date(activePlan.target_date);
        targetDateEl.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    }

    if (state.activeTab === 'plans') renderPlansTab();
  } catch (err) {
    console.error('Failed to load plans:', err);
  }
}

async function loadRoutines() {
  try {
    const data = await apiCall('/routines');
    state.routines = data.routines;
    renderHomeRoutines();
  } catch (err) {
    console.error('Failed to load routines:', err);
  }
}

async function loadNotes() {
  try {
    const data = await apiCall('/notes');
    state.notes = data.notes;
    renderHomeNotes();
    if (state.activeTab === 'notes') renderNotesTab();
  } catch (err) {
    console.error('Failed to load notes:', err);
  }
}

// ----------------------------------------------------
// NOTIFICATION DRAWER (Matches Right Side of Image 2)
// ----------------------------------------------------
function toggleNotificationDrawer() {
  const drawer = document.getElementById('notificationDrawer');
  drawer.classList.toggle('open');
}

function renderNotificationsDrawer() {
  const container = document.getElementById('notifListContainer');
  if (!container) return;

  if (state.notifications.length === 0) {
    container.innerHTML = '<li class="notif-item" style="color: var(--text-muted); text-align: center;">No new notifications</li>';
    return;
  }

  container.innerHTML = state.notifications.map(n => `
    <li class="notif-item ${n.read_status === 0 ? 'unread' : ''}">
      <div class="notif-item-title">${escapeHtml(n.title)}</div>
      <div class="notif-item-content">${escapeHtml(n.content)}</div>
      <div class="notif-item-meta">Task reminder • ${timeAgo(n.created_at)}</div>
    </li>
  `).join('');
}

async function markAllNotificationsRead() {
  try {
    await apiCall('/notifications/read-all', 'PUT');
    state.notifications.forEach(n => n.read_status = 1);
    renderNotificationsDrawer();
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
    showToast('All notifications marked as read', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// USER HOME TAB RENDERING (Matches Image 2)
// ----------------------------------------------------
function renderHomeTab() {
  updateGreeting();
  loadDashboardStats();
  renderHomeTasks();
  renderHomeRoutines();
  renderHomeNotes();
}

function renderHomeTasks() {
  const container = document.getElementById('homeTasksList');
  if (!container) return;

  const topTasks = state.tasks.slice(0, 5);
  if (topTasks.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 1rem;">No tasks found. Click "+ Add Task" to create one.</div>';
    return;
  }

  container.innerHTML = topTasks.map(t => renderTaskCardHtml(t)).join('');
}

function renderHomeRoutines() {
  const container = document.getElementById('homeRoutinesList');
  if (!container) return;

  if (state.routines.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 0.5rem;">No routines added.</div>';
    return;
  }

  container.innerHTML = state.routines.map(r => {
    const isCompleted = r.today_status === 'Completed';
    return `
      <div class="task-item-card" style="padding: 0.85rem 1rem;">
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 0.95rem; ${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
            ${escapeHtml(r.title)}
          </div>
          <div style="font-size: 0.785rem; color: var(--text-light);">
            ⏰ ${r.scheduled_time} • 🔥 Streak: ${r.streak} days
          </div>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; ${isCompleted ? 'background: #d1fae5; color: #059669;' : ''}" onclick="logRoutineStatus('${r.routine_id}', 'Completed')">
            ${isCompleted ? '✓ Done' : 'Complete'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderHomeNotes() {
  const container = document.getElementById('homeNotesList');
  if (!container) return;

  const topNotes = state.notes.slice(0, 3);
  if (topNotes.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 0.5rem;">No notes created yet.</div>';
    return;
  }

  container.innerHTML = topNotes.map(n => `
    <div class="task-item-card" style="padding: 0.85rem 1rem; cursor: pointer;" onclick="openEditNoteModal('${n.note_id}')">
      <div>
        <div style="font-weight: 600; font-size: 0.95rem;">${n.pinned ? '📌 ' : ''}${escapeHtml(n.title)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
          ${escapeHtml(n.content.substring(0, 70))}...
        </div>
      </div>
    </div>
  `).join('');
}

// ----------------------------------------------------
// TASK CARD COMPONENT (Used in User Tasks & Home)
function isAdmin() {
  return state.user && state.user.role === 'admin';
}

// ----------------------------------------------------
// TASK CARD COMPONENT
// ----------------------------------------------------
function renderTaskCardHtml(t, showAssignee = false) {
  const isCompleted = t.status === 'Completed';
  const isBlocked = t.status === 'Blocked' || (t.task_type === 'Dependent' && t.prerequisite_status !== 'Completed');
  const isOverdue = t.isOverdue;

  let priorityClass = 'pill-priority-medium';
  if (t.priority === 'High' || t.priority === 'Urgent') priorityClass = 'pill-priority-high';
  if (t.priority === 'Low') priorityClass = 'pill-priority-low';

  let statusClass = 'pill-status-pending';
  if (isCompleted) statusClass = 'pill-status-completed';
  else if (isBlocked) statusClass = 'pill-status-blocked';
  else if (isOverdue) statusClass = 'pill-status-overdue';
  else if (t.status === 'In Progress') statusClass = 'pill-status-progress';

  let deadlineDisplay = 'No deadline';
  if (t.deadline) {
    const d = new Date(t.deadline);
    deadlineDisplay = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const admin = isAdmin();

  return `
    <div class="task-item-card" id="card_${t.task_id}">
      <div class="task-left-col">
        <input type="checkbox" class="task-checkbox" ${isCompleted ? 'checked' : ''} ${isBlocked ? 'disabled title="Prerequisite task must be completed first"' : ''} onchange="toggleTaskComplete('${t.task_id}', this.checked)">
        
        <div class="task-info-block">
          <div class="task-title-row">
            <span class="task-title-text ${isCompleted ? 'completed' : ''}">${escapeHtml(t.title)}</span>
            ${isBlocked ? '<span style="font-size: 0.8rem; color: #dc2626;" title="Locked: requires prerequisite completion">🔒 Locked</span>' : ''}
          </div>

          ${t.description ? `<div class="task-desc-text">${escapeHtml(t.description)}</div>` : ''}

          <div class="task-badges-row">
            <span class="pill-badge ${priorityClass}">${t.priority}</span>
            <span class="pill-badge ${statusClass}">
              ${isBlocked ? '🔒 Blocked' : (isOverdue ? '⚠️ Overdue' : t.status)}
            </span>
            <span class="pill-badge" style="background: #f1f5f9; color: var(--text-muted);">
              ⏱ ${deadlineDisplay}
            </span>
            ${t.task_type === 'Dependent' ? `
              <span class="pill-badge" style="background: #fef2f2; color: #b91c1c;">
                Depends on: ${escapeHtml(t.prerequisite_title || 'Prerequisite Task')}
              </span>
            ` : ''}
            ${showAssignee && t.assignee_name ? `
              <span class="pill-badge" style="background: #eff6ff; color: #2563eb;">
                👤 ${escapeHtml(t.assignee_name)}
              </span>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="task-right-col">
        <div class="task-progress-box">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${t.progress || 0}%;"></div>
          </div>
          <div class="progress-label">${t.progress || 0}% Complete</div>
        </div>

        <div class="task-actions-group">
          ${!isCompleted && !isBlocked && t.status !== 'In Progress' ? `
            <button class="btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;" onclick="updateTaskStatusDirect('${t.task_id}', 'In Progress')">
              Start
            </button>
          ` : ''}
          ${admin ? `
            <button class="icon-action-btn" title="Edit task" onclick="openEditTaskModal('${t.task_id}')">
              ✏️
            </button>
            <button class="icon-action-btn delete" title="Delete task" onclick="deleteTask('${t.task_id}')">
              🗑
            </button>
          ` : `
            <button class="icon-action-btn" title="View details and update progress" onclick="openEditTaskModal('${t.task_id}')">
              🔍
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// TASK CRUD
// ----------------------------------------------------
async function toggleTaskComplete(taskId, isChecked) {
  try {
    const newStatus = isChecked ? 'Completed' : 'Pending';
    const newProgress = isChecked ? 100 : 0;
    await apiCall(`/tasks/${taskId}`, 'PUT', { status: newStatus, progress: newProgress });
    showToast(isChecked ? 'Task marked as Completed! Any dependent tasks unlocked.' : 'Task reopened', 'success');
    await loadTasks();
    await loadDashboardStats();
    await loadNotifications();
  } catch (err) {
    showToast(err.message, 'error');
    await loadTasks();
  }
}

async function updateTaskStatusDirect(taskId, newStatus) {
  try {
    await apiCall(`/tasks/${taskId}`, 'PUT', { status: newStatus });
    showToast(`Task is now ${newStatus}`, 'info');
    await loadTasks();
    await loadDashboardStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTask(taskId) {
  if (!isAdmin()) {
    showToast('Permission denied: Only administrators can delete tasks.', 'error');
    return;
  }
  if (!confirm('Are you sure you want to delete this task?')) return;
  try {
    await apiCall(`/tasks/${taskId}`, 'DELETE');
    showToast('Task deleted successfully', 'info');
    await loadTasks();
    await loadDashboardStats();
    if (isAdmin()) await loadAdminData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function filterTasks(status) {
  state.filterTaskState = status;
  renderTasksTab();
}

function renderTasksTab() {
  const container = document.getElementById('fullTasksContainer');
  if (!container) return;

  const now = new Date();
  let filtered = [...state.tasks];

  if (state.filterTaskState === 'pending') {
    filtered = filtered.filter(t => t.status === 'Pending');
  } else if (state.filterTaskState === 'in_progress') {
    filtered = filtered.filter(t => t.status === 'In Progress');
  } else if (state.filterTaskState === 'completed') {
    filtered = filtered.filter(t => t.status === 'Completed');
  } else if (state.filterTaskState === 'blocked') {
    filtered = filtered.filter(t => t.status === 'Blocked' || (t.task_type === 'Dependent' && t.prerequisite_status !== 'Completed'));
  } else if (state.filterTaskState === 'overdue') {
    filtered = filtered.filter(t => t.status !== 'Completed' && t.deadline && new Date(t.deadline) < now);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 2rem; text-align: center;">No tasks match this filter.</div>';
    return;
  }

  container.innerHTML = filtered.map(t => renderTaskCardHtml(t)).join('');
}

// ----------------------------------------------------
// TASK MODAL (ADMIN ASSIGNS, USER EXECUTES)
// ----------------------------------------------------
function openAddTaskModal() {
  if (!isAdmin()) {
    showToast('Only administrators can create and assign tasks. You can view and update tasks assigned to you.', 'warning');
    return;
  }
  document.getElementById('taskForm').reset();
  document.getElementById('taskEditId').value = '';
  document.getElementById('taskModalTitle').textContent = 'Create & Assign Task';

  // Enable all inputs for admin
  ['taskTitle', 'taskDescription', 'taskPriority', 'taskCategory', 'taskDeadline', 'taskDuration', 'taskTypeSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });

  const prereqSelect = document.getElementById('prerequisiteTaskSelect');
  if (prereqSelect) prereqSelect.disabled = false;

  const statusGroup = document.getElementById('taskStatusProgressGroup');
  if (statusGroup) statusGroup.style.display = 'none';

  populatePrerequisiteDropdown();

  const adminGroup = document.getElementById('adminAssigneeGroup');
  adminGroup.style.display = 'block';
  populateAssigneeDropdown();

  toggleDependencyPicker();
  const saveBtn = document.getElementById('taskSubmitBtn');
  if (saveBtn) saveBtn.textContent = 'Assign Task';
  openModal('addTaskModal');
}

function openEditTaskModal(taskId) {
  const task = state.tasks.find(t => t.task_id === taskId);
  if (!task) return;

  const admin = isAdmin();

  document.getElementById('taskEditId').value = task.task_id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDescription').value = task.description || '';
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskCategory').value = task.category || 'General';
  document.getElementById('taskDeadline').value = task.deadline ? task.deadline.substring(0, 16) : '';
  document.getElementById('taskDuration').value = task.duration_hours || 1.0;
  document.getElementById('taskTypeSelect').value = task.task_type || 'Independent';

  // If user is not admin, lock core assignment fields so user executes the task without altering requirements
  ['taskTitle', 'taskDescription', 'taskPriority', 'taskCategory', 'taskDeadline', 'taskDuration', 'taskTypeSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !admin;
  });

  populatePrerequisiteDropdown(task.task_id);
  const prereqSelect = document.getElementById('prerequisiteTaskSelect');
  if (prereqSelect) {
    prereqSelect.disabled = !admin;
    if (task.prerequisite_task_id) {
      prereqSelect.value = task.prerequisite_task_id;
    }
  }

  // Status & Progress controls (both Admin and User can see/update)
  const statusGroup = document.getElementById('taskStatusProgressGroup');
  if (statusGroup) {
    statusGroup.style.display = 'block';
    const statusSelect = document.getElementById('taskStatusSelect');
    if (statusSelect) statusSelect.value = task.status;
    const progressInput = document.getElementById('taskProgressInput');
    if (progressInput) progressInput.value = task.progress || 0;
    const progressLabel = document.getElementById('taskProgressValueLabel');
    if (progressLabel) progressLabel.textContent = (task.progress || 0) + '%';
  }

  const adminGroup = document.getElementById('adminAssigneeGroup');
  if (admin) {
    adminGroup.style.display = 'block';
    populateAssigneeDropdown(task.assignee_id);
  } else {
    adminGroup.style.display = 'none';
  }

  toggleDependencyPicker();
  document.getElementById('taskModalTitle').textContent = admin ? 'Edit Task' : 'Task Details & Progress';
  const saveBtn = document.getElementById('taskSubmitBtn');
  if (saveBtn) {
    saveBtn.textContent = admin ? 'Save Changes' : 'Update My Progress';
  }
  openModal('addTaskModal');
}

function toggleDependencyPicker() {
  const type = document.getElementById('taskTypeSelect').value;
  const picker = document.getElementById('dependencyPickerGroup');
  picker.style.display = type === 'Dependent' ? 'block' : 'none';
}

function populatePrerequisiteDropdown(excludeTaskId = null) {
  const select = document.getElementById('prerequisiteTaskSelect');
  if (!select) return;
  select.innerHTML = '<option value="">-- Select Prerequisite Task --</option>';

  state.tasks.forEach(t => {
    if (t.task_id !== excludeTaskId) {
      const opt = document.createElement('option');
      opt.value = t.task_id;
      opt.textContent = `${t.title} (${t.status})`;
      select.appendChild(opt);
    }
  });
}

async function populateAssigneeDropdown(selectedUserId = null) {
  const select = document.getElementById('taskAssignee');
  if (!select) return;
  try {
    const data = await apiCall('/users/assignable');
    select.innerHTML = data.users.map(u => `
      <option value="${u.user_id}" ${selectedUserId === u.user_id ? 'selected' : ''}>${escapeHtml(u.name)} (${u.email})</option>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleSaveTask(event) {
  event.preventDefault();
  const editId = document.getElementById('taskEditId').value;
  const admin = isAdmin();

  if (!editId && !admin) {
    showToast('Permission denied: Only administrators can create and assign tasks.', 'error');
    return;
  }

  let body = {};
  if (admin) {
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const priority = document.getElementById('taskPriority').value;
    const category = document.getElementById('taskCategory').value.trim();
    const deadline = document.getElementById('taskDeadline').value;
    const duration_hours = document.getElementById('taskDuration').value;
    const task_type = document.getElementById('taskTypeSelect').value;
    const prerequisite_task_id = task_type === 'Dependent' ? document.getElementById('prerequisiteTaskSelect').value : null;

    body = {
      title,
      description,
      priority,
      category,
      deadline: deadline || null,
      duration_hours,
      task_type,
      prerequisite_task_id: prerequisite_task_id || null
    };

    const assigneeSelect = document.getElementById('taskAssignee');
    if (assigneeSelect) body.assignee_id = assigneeSelect.value;

    const statusSelect = document.getElementById('taskStatusSelect');
    if (statusSelect && editId) body.status = statusSelect.value;
    const progressInput = document.getElementById('taskProgressInput');
    if (progressInput && editId) body.progress = parseInt(progressInput.value) || 0;
  } else {
    // Non-admin user updating their task progress and status
    const statusSelect = document.getElementById('taskStatusSelect');
    const progressInput = document.getElementById('taskProgressInput');
    body = {
      status: statusSelect ? statusSelect.value : undefined,
      progress: progressInput ? parseInt(progressInput.value) : undefined
    };
  }

  try {
    if (editId) {
      await apiCall(`/tasks/${editId}`, 'PUT', body);
      showToast(admin ? 'Task updated successfully' : 'Your progress has been updated', 'success');
    } else {
      await apiCall('/tasks', 'POST', body);
      showToast('New task created and assigned successfully', 'success');
    }
    closeModal('addTaskModal');
    await loadTasks();
    await loadDashboardStats();
    if (admin) await loadAdminData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// ROUTINES & LOGGING
// ----------------------------------------------------
function openAddRoutineModal() {
  openModal('addRoutineModal');
}

async function handleSaveRoutine(event) {
  event.preventDefault();
  const title = document.getElementById('routineTitle').value.trim();
  const routine_type = document.getElementById('routineType').value;
  const scheduled_time = document.getElementById('routineTime').value.trim();

  try {
    await apiCall('/routines', 'POST', { title, routine_type, scheduled_time });
    showToast('Daily routine added', 'success');
    closeModal('addRoutineModal');
    await loadRoutines();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function logRoutineStatus(routineId, status) {
  try {
    const data = await apiCall(`/routines/${routineId}/log`, 'POST', { status });
    showToast(data.message, 'info');
    await loadRoutines();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// EXAM PLANS & ROADMAPS
// ----------------------------------------------------
function renderPlansTab() {
  const container = document.getElementById('plansListContainer');
  if (!container) return;

  if (state.plans.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 2rem; text-align: center;">No plans yet. Click "+ New Goal / Exam" to create one.</div>';
    return;
  }

  container.innerHTML = state.plans.map(p => `
    <div class="roadmap-card" style="margin-bottom: 1.5rem; flex-direction: column; align-items: stretch;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div>
          <div class="roadmap-pills-row">
            <span class="badge-tag badge-primary">${escapeHtml(p.category || 'Academic')}</span>
            <span class="badge-tag">${escapeHtml(p.duration_label || '3 Months')}</span>
          </div>
          <h2 class="roadmap-title" style="margin-bottom: 0.35rem;">${escapeHtml(p.goal_name)}</h2>
          <p style="font-size: 0.9rem; color: var(--text-muted);">${escapeHtml(p.description || '')}</p>
        </div>
        <div style="text-align: right;">
          <div class="countdown-number">${p.daysRemaining}</div>
          <div style="font-size: 0.8rem; color: var(--text-light);">Days Remaining</div>
        </div>
      </div>

      <div style="background: var(--bg-page); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h4 style="font-size: 0.95rem;">Syllabus / Topics (${p.completedTopics}/${p.totalTopics} Completed)</h4>
          <span style="font-weight: 700; color: var(--primary);">${p.progressPercent}%</span>
        </div>
        <div class="progress-bar-bg" style="height: 8px; margin-bottom: 1rem;">
          <div class="progress-bar-fill" style="width: ${p.progressPercent}%;"></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${(p.topics || []).map(t => `
            <div style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.9rem;">
              <input type="checkbox" ${t.status === 'Completed' ? 'checked' : ''} onchange="toggleTopicComplete('${t.topic_id}', this.checked)">
              <span style="${t.status === 'Completed' ? 'text-decoration: line-through; color: var(--text-light);' : ''}">${escapeHtml(t.title)} (${t.allocated_hours} hrs)</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
        <button class="btn-outline" style="font-size: 0.85rem;" onclick="promptAddTopic('${p.plan_id}')">+ Add Topic</button>
      </div>
    </div>
  `).join('');
}

function openAddPlanModal() {
  openModal('addPlanModal');
}

async function handleSavePlan(event) {
  event.preventDefault();
  const goal_name = document.getElementById('planGoalName').value.trim();
  const category = document.getElementById('planCategory').value;
  const duration_label = document.getElementById('planDuration').value.trim();
  const start_date = document.getElementById('planStartDate').value;
  const target_date = document.getElementById('planTargetDate').value;
  const description = document.getElementById('planDesc').value.trim();

  try {
    await apiCall('/plans', 'POST', { goal_name, category, duration_label, start_date, target_date, description });
    showToast('Goal plan created successfully', 'success');
    closeModal('addPlanModal');
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function promptAddTopic(planId) {
  const title = prompt('Enter new topic title:');
  if (!title) return;
  const hours = prompt('Allocated study hours:', '2.0');
  try {
    await apiCall(`/plans/${planId}/topics`, 'POST', { title, allocated_hours: hours });
    showToast('Topic added', 'success');
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleTopicComplete(topicId, isChecked) {
  try {
    await apiCall(`/plans/topics/${topicId}`, 'PUT', { status: isChecked ? 'Completed' : 'Pending' });
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openPrepSessionModal() {
  openModal('prepSessionModal');
}

async function handleSavePrepSession(event) {
  event.preventDefault();
  const topic_title = document.getElementById('sessionTopic').value.trim();
  const planned_minutes = document.getElementById('sessionPlannedMin').value;
  const actual_minutes = document.getElementById('sessionActualMin').value;
  const notes = document.getElementById('sessionNotes').value.trim();

  try {
    await apiCall('/prep-sessions', 'POST', { topic_title, planned_minutes, actual_minutes, notes });
    showToast('Preparation session recorded!', 'success');
    closeModal('prepSessionModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// TIME TABLE / SCHEDULES
// ----------------------------------------------------
async function loadSchedules() {
  try {
    const data = await apiCall('/schedules');
    state.schedules = data.schedules;
    renderScheduleTable();
  } catch (err) {
    console.error('Failed to load schedules:', err);
  }
}

function renderScheduleTable() {
  const tbody = document.getElementById('scheduleTableBody');
  if (!tbody) return;

  if (state.schedules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No routine entries. Click "+ Add Routine Slot" to start.</td></tr>';
    return;
  }

  tbody.innerHTML = state.schedules.map(s => `
    <tr>
      <td><strong>${escapeHtml(s.day_of_week)}</strong></td>
      <td>${s.start_time} - ${s.end_time}</td>
      <td>${escapeHtml(s.title)}</td>
      <td><span class="badge-tag">${escapeHtml(s.activity_type)}</span></td>
      <td>
        <button class="icon-action-btn delete" onclick="deleteSchedule('${s.schedule_id}')" title="Delete">🗑</button>
      </td>
    </tr>
  `).join('');
}

function openAddScheduleModal() {
  openModal('addScheduleModal');
}

async function handleSaveSchedule(event) {
  event.preventDefault();
  const title = document.getElementById('scheduleTitle').value.trim();
  const day_of_week = document.getElementById('scheduleDay').value;
  const start_time = document.getElementById('scheduleStartTime').value;
  const end_time = document.getElementById('scheduleEndTime').value;

  try {
    await apiCall('/schedules', 'POST', { title, day_of_week, start_time, end_time });
    showToast('Time slot added', 'success');
    closeModal('addScheduleModal');
    await loadSchedules();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSchedule(id) {
  try {
    await apiCall(`/schedules/${id}`, 'DELETE');
    showToast('Time slot removed', 'info');
    await loadSchedules();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// NOTES
// ----------------------------------------------------
function renderNotesTab() {
  const container = document.getElementById('fullNotesGrid');
  if (!container) return;

  if (state.notes.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 2rem;">No notes found. Click "+ Create Note" to add one.</div>';
    return;
  }

  container.innerHTML = state.notes.map(n => `
    <div class="stat-card" style="cursor: pointer;" onclick="openEditNoteModal('${n.note_id}')">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
        <span class="badge-tag">${escapeHtml(n.category || 'General')}</span>
        ${n.pinned ? '<span>📌</span>' : ''}
      </div>
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">${escapeHtml(n.title)}</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); white-space: pre-wrap; line-height: 1.4; flex: 1;">${escapeHtml(n.content)}</p>
      <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 1rem;">
        Updated: ${new Date(n.updated_at).toLocaleDateString()}
      </div>
    </div>
  `).join('');
}

function openAddNoteModal() {
  document.getElementById('noteEditId').value = '';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteCategory').value = 'General';
  document.getElementById('noteContent').value = '';
  document.getElementById('notePinned').checked = false;
  openModal('addNoteModal');
}

function openEditNoteModal(noteId) {
  const note = state.notes.find(n => n.note_id === noteId);
  if (!note) return;
  document.getElementById('noteEditId').value = note.note_id;
  document.getElementById('noteTitle').value = note.title;
  document.getElementById('noteCategory').value = note.category;
  document.getElementById('noteContent').value = note.content;
  document.getElementById('notePinned').checked = note.pinned === 1;
  openModal('addNoteModal');
}

async function handleSaveNote(event) {
  event.preventDefault();
  const editId = document.getElementById('noteEditId').value;
  const title = document.getElementById('noteTitle').value.trim();
  const category = document.getElementById('noteCategory').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const pinned = document.getElementById('notePinned').checked;

  try {
    if (editId) {
      await apiCall(`/notes/${editId}`, 'PUT', { title, category, content, pinned });
      showToast('Note updated', 'success');
    } else {
      await apiCall('/notes', 'POST', { title, category, content, pinned });
      showToast('Note created', 'success');
    }
    closeModal('addNoteModal');
    await loadNotes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// AI ASSISTANT CHAT
// ----------------------------------------------------
function askAiWithPrompt(promptText) {
  const input = document.getElementById('userChatInput');
  if (input) input.value = promptText;
  handleSendAiMessage(new Event('submit'), 'userChatInput', 'userChatMessages');
}

function askAdminAi(promptText) {
  const input = document.getElementById('adminChatInput');
  if (input) input.value = promptText;
  handleSendAiMessage(new Event('submit'), 'adminChatInput', 'adminChatMessages');
}

async function handleSendAiMessage(event, inputId, messagesBoxId) {
  if (event) event.preventDefault();
  const input = document.getElementById(inputId);
  const container = document.getElementById(messagesBoxId);
  const question = input.value.trim();
  if (!question) return;

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = question;
  container.appendChild(userBubble);
  input.value = '';

  const typingBubble = document.createElement('div');
  typingBubble.className = 'chat-bubble assistant';
  typingBubble.textContent = 'Thinking with database context...';
  container.appendChild(typingBubble);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await apiCall('/ai/ask', 'POST', { question });
    typingBubble.innerHTML = formatMarkdown(res.answer);
  } catch (err) {
    typingBubble.textContent = 'Sorry, could not process request: ' + err.message;
  }
  container.scrollTop = container.scrollHeight;
}

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// ----------------------------------------------------
// ADMIN CONSOLE: DASHBOARD (Matches Image 3 & Image 5)
// ----------------------------------------------------
function renderAdminDashboardView() {
  loadDashboardStats();
  renderAdminRecentTasksTable();
  renderAdminWorkloadSection();
  renderAdminDashboardCharts();
}

function renderAdminRecentTasksTable() {
  const tbody = document.getElementById('adminRecentTasksTableBody');
  if (!tbody) return;

  const topTasks = state.tasks.slice(0, 6);
  if (topTasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No tasks recorded</td></tr>';
    return;
  }

  tbody.innerHTML = topTasks.map(t => {
    let priorityClass = 'pill-priority-medium';
    if (t.priority === 'High' || t.priority === 'Urgent') priorityClass = 'pill-priority-high';
    if (t.priority === 'Low') priorityClass = 'pill-priority-low';

    let statusClass = 'pill-status-pending';
    if (t.status === 'Completed') statusClass = 'pill-status-completed';
    else if (t.status === 'In Progress') statusClass = 'pill-status-progress';
    else if (t.status === 'Blocked') statusClass = 'pill-status-blocked';
    else if (t.isOverdue) statusClass = 'pill-status-overdue';

    const deadlineStr = t.deadline ? new Date(t.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No date';

    return `
      <tr>
        <td>
          <div style="font-weight: 600;">${escapeHtml(t.title)}</div>
          <div style="font-size: 0.75rem; color: var(--text-light);">${t.category || 'General'}</div>
        </td>
        <td><span class="pill-badge ${priorityClass}">${t.priority}</span></td>
        <td><span class="pill-badge ${statusClass}">${t.isOverdue && t.status !== 'Completed' ? '⚠️ Overdue' : t.status}</span></td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${deadlineStr}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <div class="avatar-circle" style="width: 24px; height: 24px; font-size: 0.7rem; background: #2563eb;">
              ${(t.assignee_name || 'U').charAt(0).toUpperCase()}
            </div>
            <span style="font-size: 0.85rem; font-weight: 500;">${escapeHtml(t.assignee_name || 'Unassigned')}</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAdminWorkloadSection() {
  const container = document.getElementById('adminWorkloadContainer');
  if (!container) return;

  const users = state.users.length > 0 ? state.users : [
    { name: 'chiku', total_tasks: 8, completed_tasks: 0 },
    { name: 'Prince Patyal', total_tasks: 0, completed_tasks: 0 },
    { name: 'System Admin', total_tasks: 0, completed_tasks: 0 }
  ];

  container.innerHTML = users.map(u => {
    const total = u.total_tasks || 0;
    const completed = u.completed_tasks || 0;
    const active = Math.max(0, total - completed);
    const pct = Math.min(100, Math.round((active / 8) * 100));

    return `
      <div class="workload-item">
        <div class="avatar-circle" style="width: 32px; height: 32px; font-size: 0.8rem; background: #4f46e5;">
          ${u.name.charAt(0).toUpperCase()}
        </div>
        <div class="workload-bar-wrap">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">
            <span>${escapeHtml(u.name)}</span>
            <span style="color: var(--text-muted);">${active} active / ${total} tasks</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${pct || 15}%;"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminDashboardCharts() {
  if (typeof Chart === 'undefined') return;

  // 1. Task Progress Weekly Spline Chart (Image 5)
  const ctxSpline = document.getElementById('chartTaskProgressSpline');
  if (ctxSpline) {
    if (chartSplineInstance) chartSplineInstance.destroy();
    chartSplineInstance = new Chart(ctxSpline, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'Tasks Created',
            data: [2, 4, 3, 6, 5, 8, 8],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
            fill: true,
            tension: 0.4,
            borderWidth: 2.5
          },
          {
            label: 'Tasks Completed',
            data: [1, 2, 2, 3, 3, 4, 5],
            borderColor: '#059669',
            backgroundColor: 'transparent',
            tension: 0.4,
            borderWidth: 2,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } }
      }
    });
  }

  // 2. By Status Gauge / Donut Chart (Image 5)
  const ctxGauge = document.getElementById('chartStatusGauge');
  if (ctxGauge) {
    if (chartGaugeInstance) chartGaugeInstance.destroy();
    chartGaugeInstance = new Chart(ctxGauge, {
      type: 'doughnut',
      data: {
        labels: ['In Progress', 'Pending', 'Overdue', 'Completed'],
        datasets: [{
          data: [
            state.stats.inProgress || 5,
            state.stats.pending || 3,
            state.stats.overdue || 2,
            state.stats.completed || 0
          ],
          backgroundColor: ['#2563eb', '#f59e0b', '#ef4444', '#10b981'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

// ----------------------------------------------------
// ADMIN CONSOLE: TASKS (Matches Image 2 HabotConnect Task List)
// ----------------------------------------------------
function renderAdminTasksView() {
  filterAdminTasksTable();
}

function filterAdminTasksTable() {
  const tbody = document.getElementById('adminTasksFullTableBody');
  if (!tbody) return;

  const searchInput = document.getElementById('adminTaskFilterSearch');
  const query = searchInput ? searchInput.value.toLowerCase() : '';
  const statusFilter = document.getElementById('adminTaskStatusFilter');
  const selectedStatus = statusFilter ? statusFilter.value : 'all';

  let filtered = [...state.tasks];

  if (query) {
    filtered = filtered.filter(t => t.title.toLowerCase().includes(query) || (t.assignee_name && t.assignee_name.toLowerCase().includes(query)));
  }

  if (selectedStatus !== 'all') {
    filtered = filtered.filter(t => t.status === selectedStatus);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching tasks found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((t, idx) => {
    const formattedId = `#TASK-${String(idx + 1).padStart(3, '0')}`;
    let statusClass = 'pill-status-pending';
    if (t.status === 'Completed') statusClass = 'pill-status-completed';
    else if (t.status === 'In Progress') statusClass = 'pill-status-progress';
    else if (t.status === 'Blocked') statusClass = 'pill-status-blocked';
    else if (t.isOverdue) statusClass = 'pill-status-overdue';

    const deadlineStr = t.deadline ? new Date(t.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date';

    return `
      <tr>
        <td><span class="pill-badge pill-task-id">${formattedId}</span></td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(t.title)}</div>
          <div style="font-size: 0.75rem; color: var(--text-light);">${t.category || 'General'}</div>
        </td>
        <td><span class="pill-badge ${statusClass}">${t.status}</span></td>
        <td><span class="pill-badge pill-priority-${t.priority.toLowerCase()}">${t.priority}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="avatar-circle" style="width: 24px; height: 24px; font-size: 0.75rem; background: #2563eb;">
              ${(t.assignee_name || 'U').charAt(0).toUpperCase()}
            </div>
            <span>${escapeHtml(t.assignee_name || 'Unassigned')}</span>
          </div>
        </td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${deadlineStr}</td>
        <td style="font-size: 0.8rem;">
          ${t.task_type === 'Dependent' ? `🔒 ${escapeHtml(t.prerequisite_title || 'Prereq')}` : 'Independent'}
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            <button class="btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="openEditTaskModal('${t.task_id}')">Edit</button>
            <button class="icon-action-btn delete" onclick="deleteTask('${t.task_id}')" title="Delete">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------
// ADMIN CONSOLE: USERS (Matches Image 4 Admin Panel Users)
// ----------------------------------------------------
async function renderAdminUsersView() {
  await loadUsersList();
  filterAdminUsersTable();
}

function filterAdminUsersTable() {
  const tbody = document.getElementById('adminUsersTableBodyNew');
  if (!tbody) return;

  const searchInput = document.getElementById('adminUserSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase() : '';
  const statusFilter = document.getElementById('adminUserStatusFilter');
  const selectedStatus = statusFilter ? statusFilter.value : 'all';

  let filtered = [...state.users];

  if (query) {
    filtered = filtered.filter(u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
  }

  if (selectedStatus !== 'all') {
    filtered = filtered.filter(u => u.account_status === selectedStatus);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching users found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const isActive = u.account_status === 'active';
    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="avatar-circle" style="width: 32px; height: 32px; font-size: 0.85rem; background: ${u.avatar_color || '#4f46e5'};">
              ${u.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-weight: 600;">${escapeHtml(u.name)}</div>
              <div style="font-size: 0.785rem; color: var(--text-light);">${escapeHtml(u.email)}</div>
            </div>
          </div>
        </td>
        <td>${u.age || 20}</td>
        <td>${escapeHtml(u.gender || '—')}</td>
        <td><span class="badge-tag ${u.role === 'admin' ? 'badge-primary' : ''}">${u.role.toUpperCase()}</span></td>
        <td>
          <span style="font-size: 0.85rem; font-weight: 600; color: ${isActive ? '#059669' : '#dc2626'};">
            ● ${isActive ? 'Active' : 'Suspended'}
          </span>
        </td>
        <td>${u.total_tasks || 0}</td>
        <td>${u.completed_tasks || 0}</td>
        <td style="font-size: 0.8rem; color: var(--text-light);">${timeAgo(u.created_at)}</td>
        <td>
          <div style="display: flex; gap: 0.6rem;">
            <a href="#" style="font-size: 0.85rem; font-weight: 600; color: ${isActive ? '#d97706' : '#059669'}; text-decoration: none;" onclick="toggleUserStatusNew('${u.user_id}', '${isActive ? 'deactivated' : 'active'}', event)">
              ${isActive ? 'Suspend' : 'Activate'}
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleUserStatusNew(userId, targetStatus, event) {
  if (event) event.preventDefault();
  try {
    await apiCall(`/users/${userId}/status`, 'PUT', { status: targetStatus });
    showToast(`User status updated to ${targetStatus}`, 'success');
    await renderAdminUsersView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAdminAddUserModal() {
  openModal('adminAddUserModal');
}

async function handleAdminCreateUser(event) {
  event.preventDefault();
  const name = document.getElementById('adminNewUserName').value.trim();
  const age = document.getElementById('adminNewUserAge').value;
  const gender = document.getElementById('adminNewUserGender') ? document.getElementById('adminNewUserGender').value : 'Unspecified';
  const email = document.getElementById('adminNewUserEmail').value.trim();
  const role = document.getElementById('adminNewUserRole').value;
  const password = document.getElementById('adminNewUserPassword').value;

  try {
    await apiCall('/users', 'POST', { name, age, gender, email, role, password });
    showToast('New user account created successfully', 'success');
    closeModal('adminAddUserModal');
    await renderAdminUsersView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// ADMIN CONSOLE: ANALYTICS & REPORTS (Matches Image 1 TaskFlow Analytics)
// ----------------------------------------------------
function renderAdminReportsView() {
  if (typeof Chart === 'undefined') return;

  // 1. Monthly Progress Area Chart
  const ctxMonthly = document.getElementById('chartMonthlyTrends');
  if (ctxMonthly) {
    if (chartMonthlyInstance) chartMonthlyInstance.destroy();
    chartMonthlyInstance = new Chart(ctxMonthly, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
          {
            label: 'Completed Tasks',
            data: [15, 28, 42, 55, 68, 85],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Created Tasks',
            data: [20, 35, 50, 62, 75, 90],
            borderColor: '#94a3b8',
            backgroundColor: 'transparent',
            tension: 0.4,
            borderDash: [4, 4]
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // 2. Team Efficiency Bar Chart
  const ctxEff = document.getElementById('chartEfficiencyTrends');
  if (ctxEff) {
    if (chartEfficiencyInstance) chartEfficiencyInstance.destroy();
    chartEfficiencyInstance = new Chart(ctxEff, {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Team Efficiency %',
          data: [72, 80, 85, 94, 88, 92],
          backgroundColor: '#4f46e5',
          borderRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // 3. Category Bars
  const catContainer = document.getElementById('categoryBarsContainer');
  if (catContainer) {
    const cats = [
      { name: 'Academic', count: 3, pct: 40 },
      { name: 'Development', count: 2, pct: 30 },
      { name: 'Project', count: 2, pct: 25 },
      { name: 'Design', count: 1, pct: 15 }
    ];
    catContainer.innerHTML = cats.map(c => `
      <div style="margin-bottom: 0.85rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">
          <span>${c.name}</span>
          <span style="color: var(--text-muted);">${c.count} tasks</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${c.pct}%; background: #4f46e5;"></div>
        </div>
      </div>
    `).join('');
  }
}

// ----------------------------------------------------
// ADMIN CONSOLE: MESSAGES
// ----------------------------------------------------
async function loadAdminMessages() {
  try {
    const data = await apiCall('/messages');
    const container = document.getElementById('adminConversationsList');
    if (!container) return;

    const list = data.conversations || [];
    if (list.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1rem;">No users available for chat</div>';
      return;
    }

    container.innerHTML = list.map(u => `
      <div style="padding: 0.75rem; border-radius: 8px; cursor: pointer; border-bottom: 1px solid var(--border-color); ${state.selectedChatUserId === u.user_id ? 'background: #eff6ff;' : ''}" onclick="selectAdminUserChat('${u.user_id}', '${escapeHtml(u.name)}')">
        <div style="font-weight: 600; font-size: 0.9rem;">${escapeHtml(u.name)}</div>
        <div style="font-size: 0.785rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(u.last_message || 'Start conversation...')}
        </div>
      </div>
    `).join('');

    if (!state.selectedChatUserId && list.length > 0) {
      selectAdminUserChat(list[0].user_id, list[0].name);
    }
  } catch (err) {
    console.error(err);
  }
}

async function selectAdminUserChat(userId, userName) {
  state.selectedChatUserId = userId;
  document.getElementById('adminChatRecipientName').textContent = `Chat with ${userName}`;
  try {
    const data = await apiCall(`/messages?userId=${userId}`);
    const box = document.getElementById('adminThreadMessagesBox');
    if (!box) return;

    const messages = data.messages || [];
    if (messages.length === 0) {
      box.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin-top: 2rem;">No messages exchanged yet. Send instructions below.</div>';
      return;
    }

    box.innerHTML = messages.map(m => {
      const isMe = m.sender_id === state.user.userId;
      return `
        <div class="chat-bubble ${isMe ? 'user' : 'assistant'}">
          <div style="font-weight: 700; font-size: 0.75rem; margin-bottom: 0.2rem;">${isMe ? 'You (Admin)' : escapeHtml(m.sender_name || 'User')}</div>
          ${escapeHtml(m.content)}
          <div style="font-size: 0.7rem; opacity: 0.7; text-align: right; margin-top: 0.25rem;">
            ${new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      `;
    }).join('');
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    console.error(err);
  }
}

async function handleAdminSendMessage(event) {
  event.preventDefault();
  const input = document.getElementById('adminMessageInput');
  const content = input.value.trim();
  if (!content) return;

  try {
    await apiCall('/messages', 'POST', { receiver_id: state.selectedChatUserId, content });
    input.value = '';
    await selectAdminUserChat(state.selectedChatUserId, document.getElementById('adminChatRecipientName').textContent.replace('Chat with ', ''));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// USER MESSAGES (DIRECT ADMIN <-> USER)
// ----------------------------------------------------
async function loadUserMessages() {
  const thread = document.getElementById('userMessagesThread');
  if (!thread) return;
  try {
    const data = await apiCall('/messages');
    const messages = data.messages || [];
    if (messages.length === 0) {
      thread.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin-top: 2rem;">No messages exchanged yet. Send an update or question to your administrator below!</div>';
      return;
    }
    thread.innerHTML = messages.map(m => {
      const isMe = m.sender_id === state.user.userId;
      return `
        <div class="chat-bubble ${isMe ? 'user' : 'assistant'}">
          <div style="font-weight: 700; font-size: 0.75rem; margin-bottom: 0.2rem;">${isMe ? 'You' : 'System Administrator'}</div>
          ${escapeHtml(m.content)}
        </div>
      `;
    }).join('');
    thread.scrollTop = thread.scrollHeight;
  } catch (err) {
    console.error('Failed to load user messages:', err);
  }
}

async function handleUserSendMessage(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('userMessageInput');
  const content = input.value.trim();
  if (!content) return;

  try {
    await apiCall('/messages', 'POST', { content });
    input.value = '';
    await loadUserMessages();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// ADMIN CONSOLE: LOGS
// ----------------------------------------------------
async function loadAdminLogsView() {
  const tbody = document.getElementById('adminFullLogsBodyNew');
  if (!tbody) return;
  try {
    const data = await apiCall('/activity-logs');
    tbody.innerHTML = (data.logs || []).map(l => `
      <tr>
        <td>${new Date(l.timestamp).toLocaleString()}</td>
        <td><strong>${escapeHtml(l.actor_name)}</strong></td>
        <td><span class="badge-tag">${escapeHtml(l.action)}</span></td>
        <td>${escapeHtml(l.entity_type)}</td>
        <td>${escapeHtml(l.details)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function openAdminAssignTaskModal() {
  openAddTaskModal();
}

// ----------------------------------------------------
// PROFILE & SETTINGS
// ----------------------------------------------------
async function loadProfileSettings() {
  try {
    const data = await apiCall('/auth/me');
    const u = data.user;
    document.getElementById('profileName').value = u.name;
    document.getElementById('profileAge').value = u.age || 20;
    if (document.getElementById('profileGender')) {
      document.getElementById('profileGender').value = u.gender || 'Unspecified';
    }
    document.getElementById('profileEmail').value = u.email;
    document.getElementById('profileRole').value = u.role.toUpperCase();
  } catch (err) {
    console.error(err);
  }
}

async function handleUpdateProfile(event) {
  event.preventDefault();
  const name = document.getElementById('profileName').value.trim();
  const age = document.getElementById('profileAge').value;
  const gender = document.getElementById('profileGender') ? document.getElementById('profileGender').value : 'Unspecified';
  try {
    await apiCall('/auth/profile', 'PUT', { name, age, gender });
    state.user.name = name;
    state.user.age = parseInt(age);
    state.user.gender = gender;
    localStorage.setItem('taskaro_user', JSON.stringify(state.user));
    document.getElementById('navUserName').textContent = name;
    showToast('Profile updated successfully', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleChangePassword(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  try {
    await apiCall('/auth/change-password', 'PUT', { currentPassword, newPassword });
    showToast('Password changed successfully', 'success');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// SEARCH & UTILITY HELPERS
// ----------------------------------------------------
function handleGlobalSearch(event) {
  const query = event.target.value.toLowerCase();
  if (state.activeTab === 'home') {
    const filtered = state.tasks.filter(t => t.title.toLowerCase().includes(query) || (t.description && t.description.toLowerCase().includes(query)));
    const container = document.getElementById('homeTasksList');
    if (container) container.innerHTML = filtered.map(t => renderTaskCardHtml(t)).join('');
  } else if (state.activeTab === 'tasks') {
    const filtered = state.tasks.filter(t => t.title.toLowerCase().includes(query) || (t.description && t.description.toLowerCase().includes(query)));
    const container = document.getElementById('fullTasksContainer');
    if (container) container.innerHTML = filtered.map(t => renderTaskCardHtml(t)).join('');
  }
}

function handleAdminGlobalSearch(event) {
  const query = event.target.value.toLowerCase();
  if (state.activeTab === 'admin-tasks') {
    const searchInput = document.getElementById('adminTaskFilterSearch');
    if (searchInput) {
      searchInput.value = query;
      filterAdminTasksTable();
    }
  } else if (state.activeTab === 'admin-users') {
    const searchInput = document.getElementById('adminUserSearchInput');
    if (searchInput) {
      searchInput.value = query;
      filterAdminUsersTable();
    }
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : (type === 'error' ? '⚠️' : 'ℹ️')}</span> ${escapeHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
