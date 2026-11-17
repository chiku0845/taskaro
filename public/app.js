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
  teams: [],
  projects: [],
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
  window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  window.addEventListener('scroll', () => {
    if (window.scrollX !== 0) {
      window.scrollTo(0, window.scrollY);
    }
  }, { passive: true });
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
  window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  if (document.documentElement) document.documentElement.scrollLeft = 0;
  if (document.body) document.body.scrollLeft = 0;

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
    const roleSelect = document.getElementById('authRoleSelect');
    const role = roleSelect ? roleSelect.value : (state.portalRole === 'admin' ? 'admin' : 'user');
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
  window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  if (document.documentElement) document.documentElement.scrollLeft = 0;
  if (document.body) document.body.scrollLeft = 0;

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
      'admin-projects': 'Projects & Initiatives',
      'admin-teams': 'Teams & Groups Organization',
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
  if (tabName === 'projects') loadProjects();
  if (tabName === 'timetable') { loadRoutines(); loadSchedules(); }
  if (tabName === 'plans') loadPlans();
  if (tabName === 'notes') loadNotes();
  if (tabName === 'messages') loadUserMessages();
  if (tabName === 'profile') loadProfileSettings();

  // Admin tabs
  if (tabName === 'admin-dashboard') renderAdminDashboardView();
  if (tabName === 'admin-tasks') renderAdminTasksView();
  if (tabName === 'admin-projects') loadProjects();
  if (tabName === 'admin-teams') loadTeams();
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
      loadProjects(),
      loadTeams(),
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
      const total = data.totalTasks || 0;
      const pending = data.pending || 0;
      const inProgress = data.inProgress || 0;
      const completed = data.completed || 0;
      const rate = data.completionRate || 0;

      const rateEl = document.getElementById('bentoVelocityRate');
      if (rateEl) rateEl.textContent = `${rate}%`;
      const fillEl = document.getElementById('bentoProgressFill');
      if (fillEl) fillEl.style.width = `${rate}%`;
      const remEl = document.getElementById('bentoRemainingTasks');
      if (remEl) remEl.textContent = Math.max(0, total - completed);

      const badgeEl = document.getElementById('bentoStatusBadge');
      if (badgeEl) {
        badgeEl.textContent = rate >= 50 ? 'On Track 🚀' : (total === 0 ? 'Ready to Start ✨' : 'In Progress ⚡');
      }

      const totalEl = document.getElementById('statTotalTasks');
      if (totalEl) totalEl.textContent = total;
      const pEl = document.getElementById('statPendingTasks');
      if (pEl) pEl.textContent = pending;
      const ipEl = document.getElementById('statInProgressTasks');
      if (ipEl) ipEl.textContent = inProgress;
      const cEl = document.getElementById('statCompletedTasks');
      if (cEl) cEl.textContent = completed;

      const teamCountEl = document.getElementById('statActiveTeams');
      if (teamCountEl) {
        teamCountEl.textContent = state.teams ? state.teams.length : 1;
      }
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
    state.routines = data.routines || [];
    state.routineAnalytics = data.analytics || {};
    renderHomeRoutines();
    renderRoutineTab();
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
    const isSkipped = r.today_status === 'Skipped';
    return `
      <div class="task-item-card" style="padding: 0.85rem 1rem; ${isCompleted ? 'border-color: #a7f3d0; background: rgba(16, 185, 129, 0.04);' : (isSkipped ? 'border-color: #fecaca; background: rgba(239, 68, 68, 0.04);' : '')}">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
            <span style="font-weight: 600; font-size: 0.95rem; ${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
              ${escapeHtml(r.title)}
            </span>
            ${isCompleted ? '<span class="pill-badge" style="background: #d1fae5; color: #047857; font-size: 0.72rem; padding: 1px 6px;">✓ Done Today</span>' : ''}
            ${isSkipped ? '<span class="pill-badge" style="background: #fee2e2; color: #b91c1c; font-size: 0.72rem; padding: 1px 6px;">⚠️ Day Skipped</span>' : ''}
          </div>
          <div style="font-size: 0.785rem; color: var(--text-light);">
            ⏰ ${r.scheduled_time} • 🔥 Streak: ${r.streak} days
          </div>
        </div>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <button class="btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; ${isCompleted ? 'background: #d1fae5; color: #059669; font-weight: 700;' : ''}" onclick="logRoutineStatus('${r.routine_id}', 'Completed')">
            ${isCompleted ? '✓ Done' : 'Complete'}
          </button>
          <button class="btn-outline" style="padding: 0.35rem 0.55rem; font-size: 0.8rem; ${isSkipped ? 'background: #fee2e2; color: #b91c1c; font-weight: 700;' : ''}" title="Mark day as skipped" onclick="logRoutineStatus('${r.routine_id}', 'Skipped')">
            ${isSkipped ? 'Skipped' : '⏭ Skip'}
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
            ${t.team_name ? `
              <span class="pill-badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1;">
                👥 ${escapeHtml(t.team_name)}
              </span>
            ` : ''}
            ${t.project_title ? `
              <span class="pill-badge" style="background: rgba(16, 185, 129, 0.12); color: #059669;">
                📁 ${escapeHtml(t.project_title)}
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
  populateTeamAndProjectDropdowns();

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
    populateTeamAndProjectDropdowns(task.team_id, task.project_id);
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

    const teamSelect = document.getElementById('taskTeamSelect');
    if (teamSelect) body.team_id = teamSelect.value || null;

    const projectSelect = document.getElementById('taskProjectSelect');
    if (projectSelect) body.project_id = projectSelect.value || null;

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

async function deleteRoutine(routineId) {
  if (!confirm('Are you sure you want to delete this routine?')) return;
  try {
    await apiCall(`/routines/${routineId}`, 'DELETE');
    showToast('Routine deleted successfully', 'info');
    await loadRoutines();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let chartRoutineConsistencyInstance = null;

function renderRoutineTab() {
  // 1. Render routine checklist in Routine tab
  const tabList = document.getElementById('tabRoutineListContainer');
  if (tabList) {
    if (state.routines.length === 0) {
      tabList.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">No daily routines configured. Click "+ Add Daily Routine" to get started!</div>';
    } else {
      tabList.innerHTML = state.routines.map(r => {
        const isCompleted = r.today_status === 'Completed';
        const isSkipped = r.today_status === 'Skipped';
        return `
          <div class="task-item-card" style="padding: 1rem 1.25rem; ${isCompleted ? 'border-color: #a7f3d0; background: rgba(16, 185, 129, 0.04);' : (isSkipped ? 'border-color: #fecaca; background: rgba(239, 68, 68, 0.04);' : '')}">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                <span style="font-weight: 700; font-size: 1rem; color: var(--text-main); ${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                  ${escapeHtml(r.title)}
                </span>
                ${isCompleted ? '<span class="pill-badge" style="background: #d1fae5; color: #047857; font-size: 0.75rem; padding: 2px 8px;">✓ Done Today</span>' : ''}
                ${isSkipped ? '<span class="pill-badge" style="background: #fee2e2; color: #b91c1c; font-size: 0.75rem; padding: 2px 8px;">⚠️ Day Skipped</span>' : ''}
                ${!isCompleted && !isSkipped ? '<span class="pill-badge" style="background: #f1f5f9; color: var(--text-muted); font-size: 0.75rem; padding: 2px 8px;">Pending</span>' : ''}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 1rem;">
                <span>⏰ Scheduled: <strong>${r.scheduled_time}</strong></span>
                <span>🔥 Streak: <strong>${r.streak} days</strong></span>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="btn-outline" style="padding: 0.4rem 0.85rem; font-size: 0.85rem; ${isCompleted ? 'background: #d1fae5; color: #047857; font-weight: 700;' : ''}" onclick="logRoutineStatus('${r.routine_id}', 'Completed')">
                ${isCompleted ? '✓ Completed' : 'Complete'}
              </button>
              <button class="btn-outline" style="padding: 0.4rem 0.75rem; font-size: 0.85rem; ${isSkipped ? 'background: #fee2e2; color: #b91c1c; font-weight: 700;' : ''}" title="Mark this day as skipped" onclick="logRoutineStatus('${r.routine_id}', 'Skipped')">
                ${isSkipped ? '⚠️ Skipped' : '⏭ Skip'}
              </button>
              <button class="icon-action-btn delete" title="Delete routine" onclick="deleteRoutine('${r.routine_id}')">
                🗑
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Render Analytics summary pills
  const analytics = state.routineAnalytics || {};
  const maxStreak = Math.max(0, ...state.routines.map(r => r.streak || 0));
  const streakEl = document.getElementById('routineHeaderStreakCount');
  if (streakEl) streakEl.textContent = maxStreak;

  const compEl = document.getElementById('routineWeeklyCompletedCount');
  if (compEl) compEl.textContent = `✓ ${analytics.total_completed_week || 0} Completed this week`;

  const skipEl = document.getElementById('routineWeeklySkippedCount');
  if (skipEl) skipEl.textContent = `⚠️ ${analytics.total_skipped_week || 0} Days Skipped`;

  // Render specific skipped days pills
  const skippedDaysContainer = document.getElementById('routineSkippedDaysPills');
  if (skippedDaysContainer) {
    const list = analytics.skipped_days_list || [];
    if (list.length > 0) {
      skippedDaysContainer.innerHTML = '<span style="font-size: 0.78rem; color: var(--text-muted); margin-left: 0.5rem;">Skipped dates:</span>' + list.slice(0, 4).map(d => `
        <span class="badge-tag" style="background: #fee2e2; color: #b91c1c; font-size: 0.72rem; padding: 2px 7px;">${d}</span>
      `).join('');
    } else {
      skippedDaysContainer.innerHTML = '<span style="font-size: 0.78rem; color: #059669; margin-left: 0.5rem;">🎉 Zero skipped days recently!</span>';
    }
  }

  // Render 7-day pill breakdown
  const pillRow = document.getElementById('routineWeeklyPillRow');
  if (pillRow && analytics.labels && analytics.dates) {
    pillRow.innerHTML = analytics.labels.map((lbl, idx) => {
      const dt = analytics.dates[idx];
      const comp = analytics.completed ? analytics.completed[idx] : 0;
      const skip = analytics.skipped ? analytics.skipped[idx] : 0;
      let badgeClass = '';
      let statusIcon = '○';
      if (comp > 0) {
        badgeClass = 'completed';
        statusIcon = '✓';
      } else if (skip > 0) {
        badgeClass = 'skipped';
        statusIcon = '⚠️';
      }
      return `
        <div class="day-badge ${badgeClass}" title="${dt}: ${comp} done, ${skip} skipped">
          <span style="font-weight: 700;">${lbl}</span>
          <span style="font-size: 0.85rem; margin-top: 2px;">${statusIcon}</span>
        </div>
      `;
    }).join('');
  }

  // 3. Render Chart.js
  renderRoutineConsistencyChart();
}

function renderRoutineConsistencyChart() {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('chartRoutineWeeklyConsistency');
  if (!canvas) return;

  const analytics = state.routineAnalytics || {};
  const labels = analytics.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const completedData = analytics.completed || [0, 0, 0, 0, 0, 0, 0];
  const skippedData = analytics.skipped || [0, 0, 0, 0, 0, 0, 0];

  if (chartRoutineConsistencyInstance) {
    chartRoutineConsistencyInstance.destroy();
  }

  chartRoutineConsistencyInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Completed Routines',
          data: completedData,
          backgroundColor: '#10b981',
          borderRadius: 6,
          maxBarThickness: 32
        },
        {
          label: 'Skipped Days',
          data: skippedData,
          backgroundColor: '#f43f5e',
          borderRadius: 6,
          maxBarThickness: 32
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { size: 11, weight: '600' }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${context.parsed.y}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

// ----------------------------------------------------
// EXAM PLANS & ROADMAPS (NIMCET & ACADEMICS)
// ----------------------------------------------------
function renderPlansTab() {
  const container = document.getElementById('plansListContainer');
  if (!container) return;

  if (state.plans.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-muted); padding: 3rem; text-align: center; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-color);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎯</div>
        <div style="font-weight: 700; font-size: 1.15rem; color: var(--text-main);">No Exam Plans or Roadmaps Created</div>
        <p style="font-size: 0.85rem; margin: 0.5rem 0 1.25rem;">Start your NIMCET or BCA preparation roadmap with duration options and checkable daily tasks.</p>
        <button class="btn-primary" onclick="openAddPlanModal()">+ Create NIMCET Plan</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.plans.map(p => {
    const totalTopics = p.totalTopics || (p.topics ? p.topics.length : 0);
    const completedTopics = p.completedTopics || 0;
    const skippedTopics = p.skippedTopics || 0;
    const progressPercent = p.progressPercent || 0;

    let targetDateStr = 'Not set';
    if (p.target_date) {
      const td = new Date(p.target_date);
      targetDateStr = td.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    return `
      <div class="roadmap-card" style="margin-bottom: 2rem; flex-direction: column; align-items: stretch;">
        <!-- Plan Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div class="roadmap-pills-row">
              <span class="badge-tag badge-primary">${escapeHtml(p.category || 'Academic')}</span>
              <span class="badge-tag" style="background: #e0e7ff; color: #4338ca; font-weight: 700;">⏱ ${escapeHtml(p.duration_label || '3 Months')}</span>
              <span class="badge-tag">Target: ${targetDateStr}</span>
            </div>
            <h2 class="roadmap-title" style="margin-bottom: 0.35rem; font-size: 1.45rem;">${escapeHtml(p.goal_name)}</h2>
            ${p.description ? `<p style="font-size: 0.875rem; color: var(--text-muted); line-height: 1.4;">${escapeHtml(p.description)}</p>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="text-align: right; background: #eff6ff; padding: 0.5rem 1rem; border-radius: var(--radius-md);">
              <div class="countdown-number" style="font-size: 1.75rem; line-height: 1;">${p.daysRemaining}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Days Remaining</div>
            </div>
            <div style="display: flex; gap: 0.4rem;">
              <button class="icon-action-btn" title="Edit plan duration & details" onclick="openEditPlanModal('${p.plan_id}')">✏️</button>
              <button class="icon-action-btn delete" title="Delete plan" onclick="deletePlan('${p.plan_id}')">🗑</button>
            </div>
          </div>
        </div>

        <!-- Syllabus / Daily Tasks Section -->
        <div style="background: var(--bg-page); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main);">
                Syllabus & Daily Preparation Checklist
              </h4>
              <div style="font-size: 0.78rem; color: var(--text-muted);">
                ${completedTopics} of ${totalTopics} completed • <strong style="color: #e11d48;">${skippedTopics} skipped</strong>
              </div>
            </div>
            <div style="display: flex; align-items: baseline; gap: 0.5rem;">
              <span style="font-weight: 800; font-size: 1.15rem; color: var(--primary);">${progressPercent}%</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">Syllabus Covered</span>
            </div>
          </div>

          <div class="bento-progress-track" style="margin: 0.25rem 0 1rem 0; height: 10px;">
            <div class="bento-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>

          <!-- Topics List -->
          <div style="display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 1rem;">
            ${(p.topics && p.topics.length > 0) ? p.topics.map(t => {
              const isDone = t.status === 'Completed';
              const isSkip = t.status === 'Skipped';
              return `
                <div class="topic-item-row ${isDone ? 'completed' : (isSkip ? 'skipped' : '')}">
                  <div style="display: flex; align-items: center; gap: 0.65rem; flex: 1;">
                    <input type="checkbox" ${isDone ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #10b981;" onchange="toggleTopicStatus('${t.topic_id}', this.checked ? 'Completed' : 'Pending')">
                    <div>
                      <span class="topic-title-text ${isDone ? 'completed' : (isSkip ? 'skipped' : '')}">
                        ${escapeHtml(t.title)}
                      </span>
                      <span style="font-size: 0.75rem; color: var(--text-light); margin-left: 0.35rem;">(${t.allocated_hours} hrs)</span>
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 0.4rem;">
                    ${isSkip ? `<span class="pill-badge" style="background: #fee2e2; color: #b91c1c; font-size: 0.7rem; padding: 2px 6px;">Day Skipped</span>` : ''}
                    <button class="btn-outline" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; ${isSkip ? 'background: #fee2e2; color: #b91c1c; font-weight: 700;' : ''}" title="Mark as skipped" onclick="toggleTopicStatus('${t.topic_id}', '${isSkip ? 'Pending' : 'Skipped'}')">
                      ${isSkip ? 'Undo Skip' : '⏭ Skip'}
                    </button>
                    <button class="icon-action-btn delete" style="width: 26px; height: 26px; font-size: 0.75rem;" title="Delete topic" onclick="deleteTopic('${t.topic_id}')">
                      ×
                    </button>
                  </div>
                </div>
              `;
            }).join('') : `
              <div style="color: var(--text-muted); font-size: 0.85rem; padding: 0.75rem; text-align: center;">
                No daily tasks / syllabus topics added yet. Click "+ Add Daily Task" below!
              </div>
            `}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <button class="btn-outline" style="font-size: 0.825rem;" onclick="openAddTopicModal('${p.plan_id}')">+ Add Daily Task / Topic</button>
            <button class="btn-primary" style="width: auto; padding: 0.4rem 0.85rem; font-size: 0.825rem;" onclick="openPrepSessionModal()">⏱ Log Study Time</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
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
  const target_hours = document.getElementById('planTargetHours') ? document.getElementById('planTargetHours').value : 300;
  const description = document.getElementById('planDesc').value.trim();

  try {
    await apiCall('/plans', 'POST', { goal_name, category, duration_label, start_date, target_date, target_hours, description });
    showToast('Plan created successfully with roadmap topics!', 'success');
    closeModal('addPlanModal');
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditPlanModal(planId) {
  const p = (state.plans || []).find(x => x.plan_id === planId);
  if (!p) return;

  document.getElementById('editPlanId').value = p.plan_id;
  document.getElementById('editPlanGoalName').value = p.goal_name;
  document.getElementById('editPlanCategory').value = p.category || 'Academic';
  document.getElementById('editPlanDuration').value = p.duration_label || '3 Months';
  document.getElementById('editPlanStartDate').value = p.start_date || '';
  document.getElementById('editPlanTargetDate').value = p.target_date ? p.target_date.substring(0, 10) : '';
  if (document.getElementById('editPlanTargetHours')) {
    document.getElementById('editPlanTargetHours').value = p.target_hours || 300;
  }
  document.getElementById('editPlanDesc').value = p.description || '';
  openModal('editPlanModal');
}

async function handleSaveEditPlan(event) {
  event.preventDefault();
  const planId = document.getElementById('editPlanId').value;
  const goal_name = document.getElementById('editPlanGoalName').value.trim();
  const category = document.getElementById('editPlanCategory').value;
  const duration_label = document.getElementById('editPlanDuration').value.trim();
  const start_date = document.getElementById('editPlanStartDate').value;
  const target_date = document.getElementById('editPlanTargetDate').value;
  const target_hours = document.getElementById('editPlanTargetHours') ? document.getElementById('editPlanTargetHours').value : 300;
  const description = document.getElementById('editPlanDesc').value.trim();

  try {
    await apiCall(`/plans/${planId}`, 'PUT', { goal_name, category, duration_label, start_date, target_date, target_hours, description });
    showToast('Plan updated successfully', 'success');
    closeModal('editPlanModal');
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePlan(planId) {
  if (!confirm('Are you sure you want to delete this plan and all associated topics?')) return;
  try {
    await apiCall(`/plans/${planId}`, 'DELETE');
    showToast('Plan removed', 'info');
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddTopicModal(planId) {
  document.getElementById('planTopicPlanId').value = planId;
  document.getElementById('planTopicTitle').value = '';
  document.getElementById('planTopicHours').value = '2.5';
  openModal('addPlanTopicModal');
}

async function handleSavePlanTopic(event) {
  event.preventDefault();
  const planId = document.getElementById('planTopicPlanId').value;
  const title = document.getElementById('planTopicTitle').value.trim();
  const allocated_hours = document.getElementById('planTopicHours').value;

  try {
    await apiCall(`/plans/${planId}/topics`, 'POST', { title, allocated_hours });
    showToast('Daily task / topic added!', 'success');
    closeModal('addPlanTopicModal');
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleTopicStatus(topicId, status) {
  try {
    await apiCall(`/plans/topics/${topicId}`, 'PUT', { status });
    await loadPlans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTopic(topicId) {
  try {
    await apiCall(`/plans/topics/${topicId}`, 'DELETE');
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
    const replyText = res.answer || res.reply || 'I am here to assist with your tasks, routines, and study plans.';
    typingBubble.innerHTML = formatMarkdown(replyText);
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
          <div style="font-size: 0.75rem; color: var(--text-light);">
            ${t.category || 'General'}
            ${t.project_title ? ` • 📁 ${escapeHtml(t.project_title)}` : ''}
          </div>
        </td>
        <td><span class="pill-badge ${statusClass}">${t.status}</span></td>
        <td><span class="pill-badge pill-priority-${t.priority.toLowerCase()}">${t.priority}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="avatar-circle" style="width: 24px; height: 24px; font-size: 0.75rem; background: #2563eb;">
              ${(t.assignee_name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div>${escapeHtml(t.assignee_name || 'Unassigned')}</div>
              ${t.team_name ? `<div style="font-size: 0.72rem; color: #6366f1; font-weight: 600;">👥 ${escapeHtml(t.team_name)}</div>` : ''}
            </div>
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
// ADMIN CONSOLE: MESSAGES & TEAM CHANNELS
// ----------------------------------------------------
async function loadAdminMessages() {
  try {
    // 1. Load Teams for Group Chat
    const teamsData = await apiCall('/teams');
    const teams = teamsData.teams || [];
    const teamListEl = document.getElementById('adminTeamChannelsList');
    if (teamListEl) {
      if (teams.length === 0) {
        teamListEl.innerHTML = '<div style="font-size: 0.785rem; color: var(--text-muted); padding: 0.5rem;">No groups created yet. Create a team in Teams to start group chat!</div>';
      } else {
        teamListEl.innerHTML = teams.map(t => `
          <div style="padding: 0.65rem 0.75rem; border-radius: 8px; cursor: pointer; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; ${state.selectedChatTeamId === t.team_id ? 'background: #eff6ff; font-weight: 700; color: #2563eb;' : 'background: var(--bg-card);'}" onclick="selectAdminTeamChat('${t.team_id}', '${escapeHtml(t.name)}', ${t.member_count})">
            <div>
              <div style="font-size: 0.88rem;">👥 ${escapeHtml(t.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${t.member_count} member${t.member_count === 1 ? '' : 's'}</div>
            </div>
            <span class="badge-tag" style="font-size: 0.7rem; padding: 2px 6px;">Group</span>
          </div>
        `).join('');
      }
    }

    // 2. Load Users for Direct Messaging
    const usersData = await apiCall('/users');
    const users = (usersData.users || []).filter(u => u.role !== 'admin');
    const userListEl = document.getElementById('adminConversationsList');
    if (userListEl) {
      if (users.length === 0) {
        userListEl.innerHTML = '<div style="font-size: 0.785rem; color: var(--text-muted); padding: 0.5rem;">No users registered yet</div>';
      } else {
        userListEl.innerHTML = users.map(u => `
          <div style="padding: 0.65rem 0.75rem; border-radius: 8px; cursor: pointer; margin-bottom: 4px; ${state.selectedChatUserId === u.user_id && !state.selectedChatTeamId ? 'background: #eff6ff; font-weight: 700; color: #2563eb;' : 'background: var(--bg-card);'}" onclick="selectAdminUserChat('${u.user_id}', '${escapeHtml(u.name)}')">
            <div style="font-size: 0.88rem;">👤 ${escapeHtml(u.name)}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(u.email)}</div>
          </div>
        `).join('');
      }
    }

    if (!state.selectedChatTeamId && !state.selectedChatUserId) {
      if (teams.length > 0) {
        selectAdminTeamChat(teams[0].team_id, teams[0].name, teams[0].member_count);
      } else if (users.length > 0) {
        selectAdminUserChat(users[0].user_id, users[0].name);
      }
    }
  } catch (err) {
    console.error('loadAdminMessages error:', err);
  }
}

async function selectAdminTeamChat(teamId, teamName, memberCount) {
  state.selectedChatTeamId = teamId;
  state.selectedChatUserId = null;
  state.selectedChatType = 'team';

  const nameEl = document.getElementById('adminChatRecipientName');
  const subEl = document.getElementById('adminChatRecipientSubtext');
  const badgeEl = document.getElementById('adminChatBadge');
  if (nameEl) nameEl.textContent = `👥 Team: ${teamName}`;
  if (subEl) subEl.textContent = `All ${memberCount || 'group'} members will receive messages sent here. Only members can see this channel.`;
  if (badgeEl) {
    badgeEl.textContent = 'Team Group Chat';
    badgeEl.className = 'badge-tag badge-primary';
  }

  try {
    const data = await apiCall(`/messages?team_id=${teamId}`);
    renderAdminChatMessages(data.messages || [], `Team ${teamName}`);
  } catch (err) {
    console.error(err);
  }
}

async function selectAdminUserChat(userId, userName) {
  state.selectedChatUserId = userId;
  state.selectedChatTeamId = null;
  state.selectedChatType = 'user';

  const nameEl = document.getElementById('adminChatRecipientName');
  const subEl = document.getElementById('adminChatRecipientSubtext');
  const badgeEl = document.getElementById('adminChatBadge');
  if (nameEl) nameEl.textContent = `👤 Direct Message: ${userName}`;
  if (subEl) subEl.textContent = `Private 1-on-1 conversation with ${userName}`;
  if (badgeEl) {
    badgeEl.textContent = 'Direct Message';
    badgeEl.className = 'badge-tag';
  }

  try {
    const data = await apiCall(`/messages?user_id=${userId}`);
    renderAdminChatMessages(data.messages || [], userName);
  } catch (err) {
    console.error(err);
  }
}

function renderAdminChatMessages(messages, targetName) {
  const box = document.getElementById('adminThreadMessagesBox');
  if (!box) return;

  if (messages.length === 0) {
    box.innerHTML = `<div style="color: var(--text-muted); text-align: center; margin-top: 3rem;">No messages yet in <strong>${escapeHtml(targetName)}</strong>. Send instructions or an update below!</div>`;
    return;
  }

  box.innerHTML = messages.map(m => {
    const isMe = m.sender_id === state.user.userId;
    const senderLabel = isMe ? 'You (Admin)' : escapeHtml(m.sender_name || 'Member');
    return `
      <div class="chat-bubble ${isMe ? 'user' : 'assistant'}">
        <div style="font-weight: 700; font-size: 0.75rem; margin-bottom: 0.2rem; color: ${isMe ? '#ffffff' : 'var(--primary)'};">${senderLabel}</div>
        ${escapeHtml(m.content)}
        <div style="font-size: 0.7rem; opacity: 0.7; text-align: right; margin-top: 0.25rem;">
          ${m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
      </div>
    `;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function handleAdminSendMessage(event) {
  event.preventDefault();
  const input = document.getElementById('adminMessageInput');
  const content = input.value.trim();
  if (!content) return;

  try {
    const payload = { content };
    if (state.selectedChatType === 'team' && state.selectedChatTeamId) {
      payload.team_id = state.selectedChatTeamId;
    } else if (state.selectedChatUserId) {
      payload.receiver_id = state.selectedChatUserId;
    } else {
      showToast('Please select a team or user first', 'error');
      return;
    }

    await apiCall('/messages', 'POST', payload);
    input.value = '';

    if (state.selectedChatType === 'team') {
      const data = await apiCall(`/messages?team_id=${state.selectedChatTeamId}`);
      renderAdminChatMessages(data.messages || [], 'Team');
    } else {
      const data = await apiCall(`/messages?user_id=${state.selectedChatUserId}`);
      renderAdminChatMessages(data.messages || [], 'Direct');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------------------------------------------
// USER MESSAGES (TEAMS & DIRECT ADMIN)
// ----------------------------------------------------
async function loadUserMessages() {
  try {
    // 1. Fetch user's teams (server filters only teams user belongs to)
    const teamsData = await apiCall('/teams');
    const teams = teamsData.teams || [];
    const teamListEl = document.getElementById('userTeamChannelsList');
    if (teamListEl) {
      if (teams.length === 0) {
        teamListEl.innerHTML = '<div style="font-size: 0.785rem; color: var(--text-muted); padding: 0.35rem 0.5rem;">No groups assigned yet. When an admin adds you to a team, your group channels will appear here!</div>';
      } else {
        teamListEl.innerHTML = teams.map(t => `
          <div style="padding: 0.65rem 0.75rem; border-radius: 8px; cursor: pointer; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; ${state.selectedUserChatTeamId === t.team_id ? 'background: #eff6ff; font-weight: 700; color: #2563eb;' : 'background: var(--bg-card);'}" onclick="selectUserTeamChat('${t.team_id}', '${escapeHtml(t.name)}', ${t.member_count})">
            <div>
              <div style="font-size: 0.88rem;">👥 ${escapeHtml(t.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${t.member_count} member${t.member_count === 1 ? '' : 's'}</div>
            </div>
            <span class="badge-tag" style="font-size: 0.7rem; padding: 2px 6px;">Group</span>
          </div>
        `).join('');
      }
    }

    // 2. Direct Messages (with System Admin)
    const dmListEl = document.getElementById('userDirectChannelsList');
    if (dmListEl) {
      dmListEl.innerHTML = `
        <div style="padding: 0.65rem 0.75rem; border-radius: 8px; cursor: pointer; ${!state.selectedUserChatTeamId ? 'background: #eff6ff; font-weight: 700; color: #2563eb;' : 'background: var(--bg-card);'}" onclick="selectUserAdminChat()">
          <div style="font-size: 0.88rem;">🛡️ System Administrator</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">Direct 1-on-1 Help & Updates</div>
        </div>
      `;
    }

    if (state.selectedUserChatTeamId) {
      const activeTeam = teams.find(t => t.team_id === state.selectedUserChatTeamId);
      if (activeTeam) {
        selectUserTeamChat(activeTeam.team_id, activeTeam.name, activeTeam.member_count);
      } else {
        selectUserAdminChat();
      }
    } else {
      selectUserAdminChat();
    }
  } catch (err) {
    console.error('loadUserMessages error:', err);
  }
}

async function selectUserTeamChat(teamId, teamName, memberCount) {
  state.selectedUserChatTeamId = teamId;
  const nameEl = document.getElementById('userChatRecipientName');
  const subEl = document.getElementById('userChatRecipientSubtext');
  const badgeEl = document.getElementById('userChatChannelBadge');
  const avatarEl = document.getElementById('userChatRecipientAvatar');

  if (nameEl) nameEl.textContent = `👥 ${teamName}`;
  if (subEl) subEl.textContent = `Team channel • ${memberCount || ''} members`;
  if (badgeEl) {
    badgeEl.textContent = 'Team Group Chat';
    badgeEl.className = 'badge-tag badge-primary';
  }
  if (avatarEl) avatarEl.textContent = '👥';

  try {
    const data = await apiCall(`/messages?team_id=${teamId}`);
    renderUserChatMessages(data.messages || [], teamName);
  } catch (err) {
    console.error(err);
  }
}

async function selectUserAdminChat() {
  state.selectedUserChatTeamId = null;
  const nameEl = document.getElementById('userChatRecipientName');
  const subEl = document.getElementById('userChatRecipientSubtext');
  const badgeEl = document.getElementById('userChatChannelBadge');
  const avatarEl = document.getElementById('userChatRecipientAvatar');

  if (nameEl) nameEl.textContent = '🛡️ System Administrator';
  if (subEl) subEl.textContent = 'Direct private thread with Administrator';
  if (badgeEl) {
    badgeEl.textContent = 'Direct Message';
    badgeEl.className = 'badge-tag';
  }
  if (avatarEl) avatarEl.textContent = '🛡️';

  try {
    const data = await apiCall('/messages');
    const dmMsgs = (data.messages || []).filter(m => !m.team_id);
    renderUserChatMessages(dmMsgs, 'System Administrator');
  } catch (err) {
    console.error(err);
  }
}

function renderUserChatMessages(messages, channelName) {
  const thread = document.getElementById('userMessagesThread');
  if (!thread) return;

  if (messages.length === 0) {
    thread.innerHTML = `<div style="color: var(--text-muted); text-align: center; margin-top: 3rem;">No messages yet in <strong>${escapeHtml(channelName)}</strong>. Post an update or ask a question below!</div>`;
    return;
  }

  thread.innerHTML = messages.map(m => {
    const isMe = m.sender_id === state.user.userId;
    const senderLabel = isMe ? 'You' : escapeHtml(m.sender_name || 'Member');
    return `
      <div class="chat-bubble ${isMe ? 'user' : 'assistant'}">
        <div style="font-weight: 700; font-size: 0.75rem; margin-bottom: 0.2rem; color: ${isMe ? '#ffffff' : 'var(--primary)'};">${senderLabel}</div>
        ${escapeHtml(m.content)}
        <div style="font-size: 0.7rem; opacity: 0.7; text-align: right; margin-top: 0.25rem;">
          ${m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
      </div>
    `;
  }).join('');
  thread.scrollTop = thread.scrollHeight;
}

async function handleUserSendMessage(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('userMessageInput');
  const content = input.value.trim();
  if (!content) return;

  try {
    const payload = { content };
    if (state.selectedUserChatTeamId) {
      payload.team_id = state.selectedUserChatTeamId;
    }
    await apiCall('/messages', 'POST', payload);
    input.value = '';

    if (state.selectedUserChatTeamId) {
      const data = await apiCall(`/messages?team_id=${state.selectedUserChatTeamId}`);
      renderUserChatMessages(data.messages || [], 'Team');
    } else {
      const data = await apiCall('/messages');
      renderUserChatMessages((data.messages || []).filter(m => !m.team_id), 'System Administrator');
    }
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
// TEAMS & PROJECTS MANAGEMENT
// ----------------------------------------------------

function populateTeamAndProjectDropdowns(selectedTeamId = null, selectedProjectId = null) {
  const teamSelect = document.getElementById('taskTeamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = '<option value="">None (Individual Task)</option>' + 
      (state.teams || []).map(t => `<option value="${t.team_id}" ${selectedTeamId === t.team_id ? 'selected' : ''}>👥 ${escapeHtml(t.name)}</option>`).join('');
  }

  const projSelect = document.getElementById('taskProjectSelect');
  if (projSelect) {
    projSelect.innerHTML = '<option value="">None (Standalone Task)</option>' +
      (state.projects || []).map(p => `<option value="${p.project_id}" ${selectedProjectId === p.project_id ? 'selected' : ''}>📁 ${escapeHtml(p.title)}</option>`).join('');
  }
}

async function loadProjects() {
  try {
    const data = await apiCall('/projects');
    state.projects = data.projects || [];
    renderProjectsViews();
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function renderProjectsViews() {
  // Render User Projects Grid
  const userGrid = document.getElementById('userProjectsGrid');
  if (userGrid) {
    if (state.projects.length === 0) {
      userGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-color);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📁</div>
          <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">No active projects assigned yet</div>
          <div style="font-size: 0.85rem; margin-top: 0.25rem;">Projects coordinated by your team or administrator will appear here.</div>
        </div>
      `;
    } else {
      userGrid.innerHTML = state.projects.map(p => {
        const progress = p.calculated_progress || p.progress || 0;
        let deadlineStr = 'No deadline';
        if (p.deadline) {
          const d = new Date(p.deadline);
          deadlineStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        return `
          <div class="project-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <span class="pill-badge pill-status-progress">${p.status || 'Active'}</span>
                ${p.team_name ? `<span class="pill-badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1;">👥 ${escapeHtml(p.team_name)}</span>` : ''}
              </div>
              <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.4rem;">${escapeHtml(p.title)}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 1rem;">${escapeHtml(p.description || 'No description provided')}</p>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem;">
                <span>Progress: ${p.completed_tasks || 0}/${p.total_tasks || 0} tasks</span>
                <span style="color: var(--primary); font-weight: 700;">${progress}%</span>
              </div>
              <div class="bento-progress-track" style="margin: 0 0 1rem 0;">
                <div class="bento-progress-fill" style="width: ${progress}%;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-light); border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <span>Lead: <strong>${escapeHtml(p.lead_name || 'Admin')}</strong></span>
                <span>📅 ${deadlineStr}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Admin Projects Container
  const adminContainer = document.getElementById('adminProjectsContainer');
  if (adminContainer) {
    if (state.projects.length === 0) {
      adminContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-color);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📁</div>
          <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">No projects created yet</div>
          <p style="font-size: 0.85rem; margin: 0.5rem 0 1rem;">Create initiatives and link tasks to teams.</p>
          <button class="btn-primary" onclick="openCreateProjectModal()">+ New Project</button>
        </div>
      `;
    } else {
      adminContainer.innerHTML = state.projects.map(p => {
        const progress = p.calculated_progress || p.progress || 0;
        let deadlineStr = 'No deadline';
        if (p.deadline) {
          const d = new Date(p.deadline);
          deadlineStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        return `
          <div class="project-card">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <span class="pill-badge ${p.status === 'Completed' ? 'pill-status-completed' : 'pill-status-progress'}">${p.status || 'Active'}</span>
                <div style="display: flex; gap: 0.4rem;">
                  <button class="icon-action-btn" title="Edit project" onclick="openEditProjectModal('${p.project_id}')">✏️</button>
                  <button class="icon-action-btn delete" title="Delete project" onclick="deleteProject('${p.project_id}')">🗑</button>
                </div>
              </div>
              <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.4rem;">${escapeHtml(p.title)}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 1rem;">${escapeHtml(p.description || 'No description provided')}</p>
            </div>
            <div>
              <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                ${p.team_name ? `<span class="pill-badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1;">👥 ${escapeHtml(p.team_name)}</span>` : '<span class="pill-badge" style="background: #f1f5f9; color: var(--text-muted);">No Team</span>'}
                <span class="pill-badge" style="background: #eff6ff; color: #2563eb;">👤 Lead: ${escapeHtml(p.lead_name || 'Admin')}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem;">
                <span>Tasks: ${p.completed_tasks || 0}/${p.total_tasks || 0} completed</span>
                <span style="color: var(--primary); font-weight: 700;">${progress}%</span>
              </div>
              <div class="bento-progress-track" style="margin: 0 0 1rem 0;">
                <div class="bento-progress-fill" style="width: ${progress}%;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-light); border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <span>Target: <strong>${deadlineStr}</strong></span>
                <button class="btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="openAdminAssignTaskModal()">+ Add Task</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function openEditProjectModal(projectId) {
  const p = (state.projects || []).find(x => x.project_id === projectId);
  if (!p) return;

  document.getElementById('editProjId').value = p.project_id;
  document.getElementById('editProjTitle').value = p.title;
  document.getElementById('editProjDesc').value = p.description || '';
  document.getElementById('editProjDeadline').value = p.deadline ? p.deadline.substring(0, 10) : '';
  document.getElementById('editProjStatus').value = p.status || 'Active';
  document.getElementById('editProjProgress').value = p.progress || 0;
  document.getElementById('editProjProgressLabel').textContent = (p.progress || 0) + '%';

  const teamSelect = document.getElementById('editProjTeamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = '<option value="">None (Cross-team)</option>' +
      (state.teams || []).map(t => `<option value="${t.team_id}" ${p.team_id === t.team_id ? 'selected' : ''}>👥 ${escapeHtml(t.name)}</option>`).join('');
  }

  const leadSelect = document.getElementById('editProjLeadSelect');
  if (leadSelect) {
    leadSelect.innerHTML = (state.users || []).map(u => `
      <option value="${u.user_id}" ${p.lead_id === u.user_id ? 'selected' : ''}>👤 ${escapeHtml(u.name)} (${u.role})</option>
    `).join('');
  }

  openModal('adminEditProjectModal');
}

async function handleSaveProjectEdit(event) {
  event.preventDefault();
  const projectId = document.getElementById('editProjId').value;
  const title = document.getElementById('editProjTitle').value.trim();
  const description = document.getElementById('editProjDesc').value.trim();
  const team_id = document.getElementById('editProjTeamSelect').value || null;
  const lead_id = document.getElementById('editProjLeadSelect').value || null;
  const deadline = document.getElementById('editProjDeadline').value || null;
  const status = document.getElementById('editProjStatus').value;
  const progress = parseInt(document.getElementById('editProjProgress').value) || 0;

  try {
    await apiCall(`/projects/${projectId}`, 'PUT', {
      title, description, team_id, lead_id, deadline, status, progress
    });
    showToast('Project updated successfully', 'success');
    closeModal('adminEditProjectModal');
    await loadProjects();
    await loadDashboardStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadTeams() {
  try {
    const data = await apiCall('/teams');
    state.teams = data.teams || [];
    renderTeamsViews();
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

function renderTeamsViews() {
  const container = document.getElementById('adminTeamsContainer');
  if (!container) return;

  if (state.teams.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-color);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">👥</div>
        <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">No teams or groups created yet</div>
        <p style="font-size: 0.85rem; margin: 0.5rem 0 1rem;">Group users together into departments or study groups for collective task assignment.</p>
        <button class="btn-primary" onclick="openCreateTeamModal()">+ Create Team / Group</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.teams.map(t => {
    const members = t.members || [];
    const memberChips = members.map(m => `
      <span class="pill-badge" style="background: rgba(99, 102, 241, 0.08); color: var(--text-main); font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.4rem;">
        👤 ${escapeHtml(m.name)}
        <button onclick="removeTeamMember('${t.team_id}', '${m.user_id}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-weight:700;padding:0 2px;" title="Remove member">×</button>
      </span>
    `).join(' ');

    return `
      <div class="team-card">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
            <span class="pill-badge" style="background: #eef2ff; color: #4f46e5; font-weight: 700;">
              👥 ${members.length} Members
            </span>
            <button class="icon-action-btn delete" title="Delete Team" onclick="deleteTeam('${t.team_id}')">🗑</button>
          </div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.35rem;">${escapeHtml(t.name)}</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 1rem;">${escapeHtml(t.description || 'No description')}</p>

          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: var(--text-light); margin-bottom: 0.4rem;">Members:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
              ${members.length > 0 ? memberChips : '<span style="font-size: 0.8rem; color: var(--text-light);">No members assigned yet</span>'}
            </div>
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <span>Tasks: <strong>${t.task_count || 0}</strong> • Projects: <strong>${t.project_count || 0}</strong></span>
            <button class="btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="openAddMemberModal('${t.team_id}')">+ Add Member</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openCreateTeamModal() {
  document.getElementById('newTeamName').value = '';
  document.getElementById('newTeamDesc').value = '';

  const container = document.getElementById('teamMembersCheckboxes');
  if (container) {
    if (!state.users || state.users.length === 0) {
      container.innerHTML = '<span style="color: var(--text-muted);">No users found.</span>';
    } else {
      container.innerHTML = state.users.map(u => `
        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer;">
          <input type="checkbox" name="teamMemberCheckbox" value="${u.user_id}">
          <span>${escapeHtml(u.name)} (${escapeHtml(u.email)}) [${u.role}]</span>
        </label>
      `).join('');
    }
  }

  openModal('adminCreateTeamModal');
}

async function handleCreateTeam(event) {
  event.preventDefault();
  const name = document.getElementById('newTeamName').value.trim();
  const description = document.getElementById('newTeamDesc').value.trim();
  const checked = Array.from(document.querySelectorAll('input[name="teamMemberCheckbox"]:checked')).map(cb => cb.value);

  try {
    await apiCall('/teams', 'POST', { name, description, member_ids: checked });
    showToast(`Team "${name}" created successfully!`, 'success');
    closeModal('adminCreateTeamModal');
    await loadTeams();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddMemberModal(teamId) {
  document.getElementById('addMemberTeamId').value = teamId;
  const select = document.getElementById('addMemberUserSelect');
  if (select) {
    select.innerHTML = (state.users || []).map(u => `
      <option value="${u.user_id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>
    `).join('');
  }
  openModal('adminAddMemberModal');
}

async function handleAddMemberToTeam(event) {
  event.preventDefault();
  const teamId = document.getElementById('addMemberTeamId').value;
  const userId = document.getElementById('addMemberUserSelect').value;

  try {
    await apiCall(`/teams/${teamId}/members`, 'POST', { user_id: userId });
    showToast('Member added to team!', 'success');
    closeModal('adminAddMemberModal');
    await loadTeams();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeTeamMember(teamId, userId) {
  if (!confirm('Are you sure you want to remove this member from the team?')) return;
  try {
    await apiCall(`/teams/${teamId}/members/${userId}`, 'DELETE');
    showToast('Member removed from team', 'info');
    await loadTeams();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTeam(teamId) {
  if (!confirm('Are you sure you want to delete this team?')) return;
  try {
    await apiCall(`/teams/${teamId}`, 'DELETE');
    showToast('Team deleted', 'info');
    await loadTeams();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCreateProjectModal() {
  document.getElementById('newProjTitle').value = '';
  document.getElementById('newProjDesc').value = '';
  document.getElementById('newProjDeadline').value = '';
  document.getElementById('newProjProgress').value = 0;
  document.getElementById('newProjProgressLabel').textContent = '0%';

  const teamSelect = document.getElementById('newProjTeamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = '<option value="">None (Cross-team)</option>' +
      (state.teams || []).map(t => `<option value="${t.team_id}">👥 ${escapeHtml(t.name)}</option>`).join('');
  }

  const leadSelect = document.getElementById('newProjLeadSelect');
  if (leadSelect) {
    leadSelect.innerHTML = (state.users || []).map(u => `
      <option value="${u.user_id}" ${state.user && u.user_id === state.user.userId ? 'selected' : ''}>${escapeHtml(u.name)}</option>
    `).join('');
  }

  openModal('adminCreateProjectModal');
}

async function handleCreateProject(event) {
  event.preventDefault();
  const title = document.getElementById('newProjTitle').value.trim();
  const description = document.getElementById('newProjDesc').value.trim();
  const team_id = document.getElementById('newProjTeamSelect').value || null;
  const lead_id = document.getElementById('newProjLeadSelect').value || null;
  const deadline = document.getElementById('newProjDeadline').value || null;
  const progress = parseInt(document.getElementById('newProjProgress').value) || 0;

  try {
    await apiCall('/projects', 'POST', { title, description, team_id, lead_id, deadline, progress });
    showToast(`Project "${title}" created successfully!`, 'success');
    closeModal('adminCreateProjectModal');
    await loadProjects();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProject(projectId) {
  if (!confirm('Are you sure you want to delete this project?')) return;
  try {
    await apiCall(`/projects/${projectId}`, 'DELETE');
    showToast('Project deleted', 'info');
    await loadProjects();
  } catch (err) {
    showToast(err.message, 'error');
  }
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
