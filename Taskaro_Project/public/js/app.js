const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

const state = {
  user: null,
  tasks: [],
  resources: [],
  plans: [],
  notifications: [],
  stats: null,
  view: 'home',
  weekOffset: 0,
  editingTask: null,
  editingResource: null,
  resetToken: new URLSearchParams(location.search).get('reset'),
  // Routine & Performance tracking state
  selectedPlanDate: localISO(new Date()),
  selectedRoutineCat: '',
  planPerformance: null,
  isSkipDay: false,
  skipReason: null,
  skipDays: []
};

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

let toastTimer;
function toast(msg, error = false) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3600);
}

function showAuth(which) {
  $('#authView')?.classList.remove('hidden');
  $('#appView')?.classList.add('hidden');
  ['loginForm', 'signupForm', 'forgotForm', 'resetForm'].forEach((id) =>
    $('#' + id)?.classList.toggle('hidden', id !== which)
  );
}

function showApp() {
  $('#authView')?.classList.add('hidden');
  $('#appView')?.classList.remove('hidden');
  const user = state.user || {};
  if ($('#userName')) $('#userName').textContent = user.name || 'User';
  if ($('#avatar'))
    $('#avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
  const hour = new Date().getHours();
  if ($('#greeting'))
    $('#greeting').textContent = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${(user.name || '').split(' ')[0] || 'there'}`;
  loadAll();
}

function theme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  localStorage.setItem('taskaro-theme', t);
  if ($('#themeToggle')) $('#themeToggle').textContent = t === 'dark' ? '☀' : '☾';
  if ($('#themeToggleApp')) $('#themeToggleApp').textContent = t === 'dark' ? '☀' : '☾';
}

function initTheme() {
  const t = localStorage.getItem('taskaro-theme') || 'light';
  document.documentElement.dataset.theme = t;
  if ($('#themeToggle')) $('#themeToggle').textContent = t === 'dark' ? '☀' : '☾';
  if ($('#themeToggleApp')) $('#themeToggleApp').textContent = t === 'dark' ? '☀' : '☾';
}

function esc(s = '') {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function dateText(d) {
  if (!d) return 'No deadline';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(t) {
  if (!t.due_date) return false;
  const deadline = new Date(t.due_date + 'T23:59:59');
  if (t.status !== 'Completed') return deadline < new Date();
  return Boolean(t.completed_at && new Date(t.completed_at) > deadline);
}

function statusLabel(t) {
  return isOverdue(t) ? 'Overdue' : t.status;
}

function statusClass(s) {
  return s.toLowerCase().replace(' ', '-');
}

function priorityRank(p) {
  return { High: 0, Medium: 1, Low: 2 }[p] ?? 1;
}

function importantTask() {
  return state.tasks
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => {
      const overdueA = isOverdue(a) ? 0 : 1;
      const overdueB = isOverdue(b) ? 0 : 1;
      if (overdueA !== overdueB) return overdueA - overdueB;
      if (priorityRank(a.priority) !== priorityRank(b.priority))
        return priorityRank(a.priority) - priorityRank(b.priority);
      return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    })[0];
}

async function loadAll() {
  try {
    const [tasks, stats, resources, plansData, perfData, notices, skipDaysData] = await Promise.all([
      api('/api/tasks'),
      api('/api/tasks/stats'),
      api('/api/resources'),
      api(`/api/plans?date=${state.selectedPlanDate}`),
      api('/api/plans/performance'),
      api('/api/notifications'),
      api('/api/plans/skip-days').catch(() => ({ skip_days: [] }))
    ]);
    state.tasks = tasks.tasks || [];
    state.stats = stats || {};
    state.resources = resources.resources || [];
    state.plans = plansData.plans || [];
    state.isSkipDay = Boolean(plansData.is_skip_day);
    state.skipReason = plansData.skip_reason || null;
    state.planPerformance = perfData || null;
    state.notifications = notices.notifications || [];
    state.skipDays = skipDaysData?.skip_days || [];

    renderDashboard();
    renderTasks();
    renderPlanner();
    renderResources();
    renderNotifications();
    renderSkipDaysList();
    renderHomeRoutineWidget();
  } catch (e) {
    toast(e.message, true);
  }
}

async function loadRoutineData(date) {
  if (date) state.selectedPlanDate = date;
  try {
    const [plansData, perfData, skipDaysData] = await Promise.all([
      api(`/api/plans?date=${state.selectedPlanDate}`),
      api('/api/plans/performance'),
      api('/api/plans/skip-days').catch(() => ({ skip_days: [] }))
    ]);
    state.plans = plansData.plans || [];
    state.isSkipDay = Boolean(plansData.is_skip_day);
    state.skipReason = plansData.skip_reason || null;
    state.planPerformance = perfData || null;
    state.skipDays = skipDaysData?.skip_days || [];
    renderPlanner();
    renderSkipDaysList();
    renderHomeRoutineWidget();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderDashboard() {
  const s = state.stats || {};
  if ($('#statTotal')) $('#statTotal').textContent = s.total || 0;
  if ($('#statPending')) $('#statPending').textContent = s.pending || 0;
  if ($('#statCompleted')) $('#statCompleted').textContent = s.completed || 0;
  if ($('#statOverdue')) $('#statOverdue').textContent = s.overdue || 0;
  if ($('#completionPct')) $('#completionPct').textContent = (s.completion || 0) + '%';
  if ($('#progressRing')) $('#progressRing').style.setProperty('--progress', (s.completion || 0) + '%');
  if ($('#progressBar')) $('#progressBar').style.width = (s.completion || 0) + '%';
  if ($('#legendCompleted')) $('#legendCompleted').textContent = s.completed || 0;
  if ($('#legendPending')) $('#legendPending').textContent = s.pending || 0;
  if ($('#legendProgress')) $('#legendProgress').textContent = s.inProgress || 0;

  const t = importantTask();
  const box = $('#priorityFocus');
  if (box) {
    if (!t) {
      box.innerHTML =
        '<div class="empty-icon">✦</div><h3>You’re all caught up</h3><p class="muted">Add a task and your next focus will appear here.</p>';
    } else {
      const late = isOverdue(t);
      box.innerHTML = `<div class="focus-card"><div class="focus-card-top"><div><h3>${esc(
        t.title
      )}</h3><p>${esc(t.description || 'No description added.')}</p></div><span class="priority-tag ${t.priority.toLowerCase()}">${esc(
        t.priority
      )} priority</span></div><div class="priority-meta"><span class="due-tag ${
        late ? 'late' : ''
      }">${late ? '⚠ Overdue · ' : '◷ Due '}${esc(dateText(t.due_date))}</span><span class="status-tag ${statusClass(
        statusLabel(t)
      )}">${esc(statusLabel(t))}</span><button class="text-button" data-detail="${
        t.id
      }">Open details →</button></div></div>`;
    }
  }

  const upcoming = [...state.tasks]
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
    .slice(0, 5);

  if ($('#recentTasks')) {
    $('#recentTasks').innerHTML = upcoming.length
      ? upcoming.map(taskRow).join('')
      : empty('Nothing waiting on you', 'Add your first task to get started.');
  }

  renderHomeRoutineWidget();
}

function taskRow(t) {
  return `<div class="task-row"><input class="task-check" type="checkbox" data-complete="${t.id}" ${
    t.status === 'Completed' ? 'checked' : ''
  } aria-label="Complete ${esc(t.title)}"><div class="task-row-content"><h3 class="${
    t.status === 'Completed' ? 'done' : ''
  }">${esc(t.title)}</h3><p>${esc(t.description || t.category || 'General')}</p><div class="task-row-meta"><span class="priority-tag ${t.priority.toLowerCase()}">${esc(
    t.priority
  )}</span><span class="status-tag ${statusClass(statusLabel(t))}">${esc(
    statusLabel(t)
  )}</span><span class="due-tag ${isOverdue(t) ? 'late' : ''}">${esc(
    dateText(t.due_date)
  )}</span></div></div><div class="task-row-actions"><button type="button" class="schedule-task-btn" data-schedule-task="${
    t.id
  }" title="Add to Time Table / Routine">⏱ Schedule</button><button class="mini-icon-btn" data-detail="${
    t.id
  }" title="View details">↗</button><button class="mini-icon-btn" data-edit-task="${
    t.id
  }" title="Edit task">✎</button><button class="mini-icon-btn" data-delete-task="${
    t.id
  }" title="Delete task">×</button></div></div>`;
}

function empty(title, desc) {
  return `<div class="empty-state"><strong>${esc(title)}</strong>${esc(desc)}</div>`;
}

function renderTasks() {
  const q = ($('#taskSearch')?.value || $('#globalSearch')?.value || '').toLowerCase();
  const status = $('#statusFilter')?.value || '';
  const priority = $('#priorityFilter')?.value || '';
  const category = $('#categoryFilter')?.value || '';
  const sort = $('#sortFilter')?.value || 'deadline';

  let arr = state.tasks.filter(
    (t) =>
      (!q || `${t.title} ${t.description}`.toLowerCase().includes(q)) &&
      (!status || (status === 'Overdue' ? statusLabel(t) === 'Overdue' : t.status === status)) &&
      (!priority || t.priority === priority) &&
      (!category || t.category === category)
  );

  const rank = { High: 0, Medium: 1, Low: 2 };
  arr.sort((a, b) =>
    sort === 'priority'
      ? rank[a.priority] - rank[b.priority]
      : sort === 'created'
      ? b.created_at.localeCompare(a.created_at)
      : sort === 'alphabetical'
      ? a.title.localeCompare(b.title)
      : (a.due_date || '9999').localeCompare(b.due_date || '9999')
  );

  if ($('#allTasks')) {
    $('#allTasks').innerHTML = arr.length
      ? arr.map(taskRow).join('')
      : empty('No matching tasks', 'Try changing your filters or create a new task.');
  }

  const categoryFilter = $('#categoryFilter');
  if (categoryFilter) {
    const cats = [...new Set(state.tasks.map((t) => t.category).filter(Boolean))];
    const old = categoryFilter.value;
    categoryFilter.innerHTML =
      '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
    categoryFilter.value = cats.includes(old) ? old : '';
  }
}

function openModal(title, body) {
  if ($('#modalTitle')) $('#modalTitle').textContent = title;
  if ($('#modalBody')) $('#modalBody').innerHTML = body;
  $('#modalBackdrop')?.classList.remove('hidden');
}

function closeModal() {
  $('#modalBackdrop')?.classList.add('hidden');
  state.editingTask = null;
  state.editingResource = null;
}

function taskForm(t = {}) {
  return `<form id="taskEditor" class="modal-form">
    <div class="field full-span"><label>Task title *</label><input name="title" required maxlength="180" value="${esc(
      t.title || ''
    )}" placeholder="What needs to get done?"></div>
    <div class="field full-span"><label>Description</label><textarea name="description" maxlength="5000" placeholder="Add a few helpful details…">${esc(
      t.description || ''
    )}</textarea></div>
    <div class="field"><label>Start date</label><input type="date" name="start_date" value="${esc(
      t.start_date || ''
    )}"></div>
    <div class="field"><label>Deadline</label><input type="date" name="due_date" value="${esc(
      t.due_date || ''
    )}"></div>
    <div class="field"><label>Priority</label><select name="priority"><option ${
      t.priority === 'High' ? 'selected' : ''
    }>High</option><option ${
      !t.priority || t.priority === 'Medium' ? 'selected' : ''
    }>Medium</option><option ${t.priority === 'Low' ? 'selected' : ''}>Low</option></select></div>
    <div class="field"><label>Status</label><select name="status"><option ${
      !t.status || t.status === 'Pending' ? 'selected' : ''
    }>Pending</option><option ${
      t.status === 'In Progress' ? 'selected' : ''
    }>In Progress</option><option ${
      t.status === 'Completed' ? 'selected' : ''
    }>Completed</option></select></div>
    <div class="field"><label>Category / subject</label><input name="category" maxlength="120" value="${esc(
      t.category || 'General'
    )}"></div>
    <div class="field"><label>Estimated minutes</label><input type="number" name="estimated_minutes" min="1" max="10080" value="${esc(
      t.estimated_minutes || ''
    )}" placeholder="e.g. 45"></div>
    <div class="field full-span"><label>Subtasks (one per line)</label><textarea name="subtasks" placeholder="Read the brief&#10;Draft an outline&#10;Review and submit">${esc(
      (t.subtasks || []).map((x) => x.title).join('\n')
    )}</textarea></div>
    <div class="modal-actions"><button type="button" class="outline-small" data-close-modal>Cancel</button><button class="primary-btn" type="submit">Save task</button></div>
  </form>`;
}

function newTask(t = null) {
  state.editingTask = t?.id || null;
  openModal(t ? 'Edit task' : 'Create a task', taskForm(t || {}));
}

async function saveTask(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const subtasks = String(f.get('subtasks') || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((title) => ({ title, done: false }));

  const payload = {
    title: f.get('title'),
    description: f.get('description'),
    start_date: f.get('start_date'),
    due_date: f.get('due_date'),
    priority: f.get('priority'),
    status: f.get('status'),
    category: f.get('category'),
    estimated_minutes: f.get('estimated_minutes') || null,
    subtasks
  };

  try {
    await api(state.editingTask ? `/api/tasks/${state.editingTask}` : '/api/tasks', {
      method: state.editingTask ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    closeModal();
    toast(state.editingTask ? 'Task updated.' : 'Task created.');
    await loadAll();
  } catch (err) {
    toast(err.message, true);
  }
}

async function taskDetail(id) {
  try {
    const { task: t } = await api(`/api/tasks/${id}`);
    openModal(
      'Task details',
      `<div class="detail-view">
        <div class="priority-meta"><span class="priority-tag ${t.priority.toLowerCase()}">${esc(
          t.priority
        )} priority</span><span class="status-tag ${statusClass(statusLabel(t))}">${esc(
          statusLabel(t)
        )}</span></div>
        <h2 style="margin-top:15px">${esc(t.title)}</h2>
        <p class="muted">${esc(t.description || 'No description.')}</p>
        <div class="detail-grid">
          <p><b>Category</b><br>${esc(t.category || 'General')}</p>
          <p><b>Start date</b><br>${esc(dateText(t.start_date))}</p>
          <p><b>Deadline</b><br>${esc(dateText(t.due_date))}</p>
          <p><b>Estimated time</b><br>${
            t.estimated_minutes ? esc(t.estimated_minutes + ' minutes') : 'Not set'
          }</p>
          <p><b>Created</b><br>${esc(t.created_at)}</p>
        </div>
        <h3>Subtasks</h3>
        ${
          t.subtasks?.length
            ? t.subtasks.map((s) => `<p>☐ ${esc(s.title)}</p>`).join('')
            : '<p class="muted">No subtasks added.</p>'
        }
        <div class="modal-actions">
          <button class="outline-small" data-close-modal>Close</button>
          <button class="primary-btn" data-edit-task="${t.id}">Edit task</button>
        </div>
      </div>`
    );
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteTask(id) {
  const t = state.tasks.find((x) => x.id === Number(id));
  if (!confirm(`Delete “${t?.title || 'this task'}”? This cannot be undone.`)) return;
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    toast('Task deleted.');
    await loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

async function completeTask(id, checked) {
  try {
    await api(`/api/tasks/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: checked })
    });
    toast(checked ? 'Task completed!' : 'Task reopened.');
    await loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

function durationText(start, end) {
  if (!start || !end || end <= start) return 'End time must be later than start time';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let m = eh * 60 + em - (sh * 60 + sm);
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${hours ? hours + ' hr' + (hours === 1 ? '' : 's') : ''}${
    hours && mins ? ' ' : ''
  }${mins ? mins + ' min' + (mins === 1 ? '' : 's') : ''}`.trim();
}

/* =========================================================
   TIME TABLE, ROUTINE CHECKLIST & PERFORMANCE GRAPH
   ========================================================= */

function renderPlanner() {
  const targetDateObj = new Date(state.selectedPlanDate + 'T12:00:00');
  const isToday = state.selectedPlanDate === localISO(new Date());

  // Update date navigator labels
  const dateFormatted = targetDateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  if ($('#currentRoutineDateLabel')) {
    $('#currentRoutineDateLabel').textContent = isToday ? `${dateFormatted} (Today)` : dateFormatted;
  }
  if ($('#routineDatePicker')) {
    $('#routineDatePicker').value = state.selectedPlanDate;
  }
  if ($('#routineToday')) {
    $('#routineToday').classList.toggle('active', isToday);
  }

  // Update Rest / Skip Day Banner
  const banner = $('#skipDayBanner');
  const toggleBtn = $('#toggleSkipDayBtn');
  if (state.isSkipDay) {
    banner?.classList.remove('hidden');
    if ($('#skipBannerTitle')) {
      $('#skipBannerTitle').textContent = `🌴 Rest / Skip Day Active (${state.skipReason || 'Rest & Recovery'})`;
    }
    toggleBtn?.classList.add('active');
    if (toggleBtn) toggleBtn.textContent = '🌴 Rest Day Active';
  } else {
    banner?.classList.add('hidden');
    toggleBtn?.classList.remove('active');
    if (toggleBtn) toggleBtn.textContent = '🌴 Rest / Skip Day';
  }

  // Render performance cards & graph
  renderPerformance(state.planPerformance);

  // Render routine checklist cards
  renderRoutineChecklist();

  // Render weekly overview grid
  renderWeeklyCalendar();

  // Update tasks dropdown in form
  updatePlanTaskOptions();
}

function renderPerformance(perf) {
  if (!perf) return;

  const today = perf.today || {};
  const isSkip = state.isSkipDay || today.is_skip_day;
  const score = isSkip ? 100 : today.score || 0;

  // Radial Progress Gauge
  const radial = $('#routineRadial');
  if (radial) radial.style.setProperty('--pct', `${score}%`);
  if ($('#routineRadialPct')) $('#routineRadialPct').textContent = `${score}%`;

  if ($('#todayPerfPill')) {
    const pill = $('#todayPerfPill');
    if (isSkip) {
      pill.textContent = '🌴 Rest Day';
      pill.className = 'perf-pill rest';
    } else if (score === 100 && today.total > 0) {
      pill.textContent = '🌟 Complete!';
      pill.className = 'perf-pill success';
    } else {
      pill.textContent = today.total > 0 ? `${today.completed}/${today.total} Done` : 'No Routines';
      pill.className = 'perf-pill';
    }
  }

  // Counts
  if ($('#routineCompletedCount')) $('#routineCompletedCount').textContent = today.completed || 0;
  if ($('#routineSkippedCount')) $('#routineSkippedCount').textContent = today.skipped || 0;
  if ($('#routinePendingCount')) $('#routinePendingCount').textContent = today.pending || 0;

  // Streak & Consistency Card
  if ($('#routineStreakNum')) $('#routineStreakNum').textContent = perf.streak || 0;
  if ($('#routineStreakBadge')) {
    $('#routineStreakBadge').textContent = (perf.streak || 0) > 0 ? '🔥 On Streak' : 'Fresh Start';
  }
  if ($('#routineWeeklyScore')) $('#routineWeeklyScore').textContent = `${perf.weekly_score || 0}%`;
  if ($('#routineTotalDone')) $('#routineTotalDone').textContent = perf.total_completed || 0;

  // Render SVG Performance Graph
  renderSVGPerformanceGraph(perf.days || []);
}

function renderSVGPerformanceGraph(days) {
  const container = $('#routineGraphContainer');
  if (!container) return;

  if (!days || !days.length) {
    container.innerHTML = '<p class="muted small-text">No performance data yet.</p>';
    return;
  }

  const svgWidth = 320;
  const svgHeight = 120;
  const chartBottom = 96;
  const maxBarHeight = 65;

  // 80% Target dotted line y position
  const targetY = chartBottom - (80 / 100) * maxBarHeight;

  let barsHTML = '';
  const totalDays = days.length;
  const barWidth = 24;
  const spacing = (svgWidth - 20) / totalDays;

  days.forEach((d, i) => {
    const x = 12 + i * spacing + (spacing - barWidth) / 2;
    const height = Math.max(5, Math.round(((d.score || 0) / 100) * maxBarHeight));
    const y = chartBottom - height;

    let barColor = '#3b82f6'; // default blue
    let label = `${d.score}%`;

    if (d.is_skip_day) {
      barColor = '#818cf8'; // purple for rest
      label = '🌴';
    } else if (d.score >= 80) {
      barColor = '#10b981'; // green
    } else if (d.score > 0) {
      barColor = '#f59e0b'; // yellow
    } else {
      barColor = '#cbd5e1'; // grey
    }

    const isSelected = d.date === state.selectedPlanDate;

    barsHTML += `
      <g class="graph-bar-group" data-graph-day="${d.date}" tabindex="0" role="button" aria-label="${d.dayName}: ${d.score}%">
        <title>${d.dayName} (${d.date}): ${d.completed}/${d.total} Done, ${d.score}% score${d.is_skip_day ? ' (Rest Day)' : ''}</title>
        <!-- Background touch target -->
        <rect x="${x - 4}" y="0" width="${barWidth + 8}" height="${svgHeight}" fill="transparent" />
        <!-- Bar rectangle -->
        <rect class="bar" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="5" fill="${barColor}" stroke="${isSelected ? 'var(--primary)' : 'none'}" stroke-width="${isSelected ? '2' : '0'}" />
        <!-- Top percentage label -->
        <text class="graph-pct-label" x="${x + barWidth / 2}" y="${y - 4}">${label}</text>
        <!-- Day name label -->
        <text class="graph-day-label" x="${x + barWidth / 2}" y="${chartBottom + 16}" font-weight="${isSelected ? 'bold' : 'normal'}">${d.dayName}</text>
      </g>
    `;
  });

  container.innerHTML = `
    <svg class="routine-graph-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <!-- 80% Target Line -->
      <line class="graph-target-line" x1="8" y1="${targetY}" x2="${svgWidth - 8}" y2="${targetY}" />
      <text class="graph-target-text" x="${svgWidth - 4}" y="${targetY - 3}" text-anchor="end">80% Target</text>
      <!-- Base Axis Line -->
      <line x1="8" y1="${chartBottom}" x2="${svgWidth - 8}" y2="${chartBottom}" stroke="var(--line)" stroke-width="1" />
      ${barsHTML}
    </svg>
  `;
}

function renderRoutineChecklist() {
  const target = $('#planItems');
  if (!target) return;

  const selectedCat = state.selectedRoutineCat;
  const filtered = state.plans.filter((p) => {
    if (!p.occurs) return false;
    if (selectedCat && (p.category || 'General').toLowerCase() !== selectedCat.toLowerCase()) {
      return false;
    }
    return true;
  });

  if (!filtered.length) {
    if (state.isSkipDay) {
      target.innerHTML = `<div class="empty-state">
        <strong style="color:var(--primary)">🌴 Rest &amp; Skip Day Active</strong>
        Routine expectations are paused today. Relax, recharge, and return refreshed!
      </div>`;
    } else {
      target.innerHTML = empty(
        'No routine activities for this date',
        selectedCat
          ? `No ${selectedCat} routines found. Change filter or click "＋ Add Routine" above.`
          : 'Click "＋ Add Routine" above to schedule activities in your time table.'
      );
    }
    return;
  }

  target.innerHTML = filtered
    .map((p) => {
      const isDone = p.is_completed;
      const isSkipped = p.is_skipped;
      const cardClass = isDone ? 'completed' : isSkipped ? 'skipped' : 'pending';

      const statusTag = isDone
        ? '<span class="routine-badge" style="background:#dcfce7;color:#166534">✓ Done</span>'
        : isSkipped
        ? '<span class="routine-badge" style="background:#fef3c7;color:#92400e">⊘ Skipped</span>'
        : '<span class="routine-badge">◷ Scheduled</span>';

      const repeatLabel =
        p.repeat === 'daily'
          ? 'Daily'
          : p.repeat === 'weekdays'
          ? 'Weekdays'
          : p.repeat === 'weekends'
          ? 'Weekends'
          : p.repeat === 'weekly'
          ? 'Weekly'
          : 'Once';

      return `
        <article class="routine-card ${cardClass}" data-routine-id="${p.id}">
          <button type="button" class="routine-tick-btn" data-toggle-routine="${p.id}" title="${
        isDone ? 'Click to mark pending' : 'Click to tick mark as done'
      }">
            ${isDone ? '✓' : ''}
          </button>
          <div class="routine-card-body">
            <div class="routine-title-row">
              <h3 class="routine-title">${esc(p.name)}</h3>
              <span class="routine-badge cat">${esc(p.category || 'General')}</span>
              <span class="routine-badge repeat">${repeatLabel}</span>
              ${statusTag}
            </div>
            <div class="routine-meta-row">
              <span class="routine-time">⏱ ${esc(p.start_time)} – ${esc(p.end_time)} (${durationText(
        p.start_time,
        p.end_time
      )})</span>
              ${p.notes ? `<span class="routine-notes">🎯 ${esc(p.notes)}</span>` : ''}
            </div>
          </div>
          <div class="routine-card-actions">
            <button type="button" class="action-btn-small skip" data-skip-routine="${p.id}" title="Skip this slot for today">
              ${isSkipped ? 'Unskip' : 'Skip'}
            </button>
            <button type="button" class="action-btn-small" data-edit-plan="${p.id}" title="Edit routine">
              ✎
            </button>
            <button type="button" class="action-btn-small delete" data-delete-plan="${p.id}" title="Delete routine">
              ×
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

function planOccursOn(p, targetDateStr) {
  if (!p) return false;
  if (p.repeat === 'once') return p.date === targetDateStr;
  const base = new Date(p.date + 'T12:00:00');
  const target = new Date(targetDateStr + 'T12:00:00');
  const daysDiff = Math.round((target - base) / 86400000);
  if (daysDiff < 0) return false;
  const dayOfWeek = target.getDay(); // 0 = Sun, 6 = Sat
  if (p.repeat === 'daily') return true;
  if (p.repeat === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (p.repeat === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
  if (p.repeat === 'weekly') return dayOfWeek === base.getDay();
  return false;
}

function renderWeeklyCalendar() {
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + state.weekOffset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  if ($('#weekLabel')) {
    $('#weekLabel').textContent = `${start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    })} – ${end.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })}`;
  }

  let days = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = localISO(d);
    const ts = state.tasks.filter((t) => t.due_date === iso);
    const ps = state.plans.filter((p) => planOccursOn(p, iso));

    days += `<div class="day-column ${iso === localISO(new Date()) ? 'today' : ''}">
      <div class="day-name">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
      <div class="day-number">${d.getDate()}</div>
      ${ps
        .slice(0, 3)
        .map(
          (p) =>
            `<div class="day-task low" style="border-left-color:var(--primary)">⏱ ${esc(
              p.start_time
            )} ${esc(p.name)}</div>`
        )
        .join('')}
      ${ts
        .map(
          (t) =>
            `<div class="day-task ${t.priority.toLowerCase()} ${
              t.status === 'Completed' ? 'done' : ''
            }" data-detail="${t.id}" role="button" tabindex="0">${esc(t.title)}</div>`
        )
        .join('')}
    </div>`;
  }

  if ($('#plannerGrid')) $('#plannerGrid').innerHTML = days;

  const un = state.tasks.filter((t) => !t.due_date && t.status !== 'Completed');
  if ($('#unscheduledTasks')) {
    $('#unscheduledTasks').innerHTML = un.length
      ? un.map(taskRow).join('')
      : empty('No unscheduled tasks', 'Tasks without a deadline will show here.');
  }
}

async function toggleRoutineComplete(id) {
  const p = state.plans.find((item) => item.id === Number(id));
  if (!p) return;
  const nextStatus = p.is_completed ? 'pending' : 'completed';

  try {
    const res = await api(`/api/plans/${id}/log`, {
      method: 'POST',
      body: JSON.stringify({ date: state.selectedPlanDate, status: nextStatus, sync_task: true })
    });
    if (nextStatus === 'completed') {
      if (res.task_id) {
        toast('🌟 Routine ticked as done & linked task completed! Great job!');
      } else {
        toast('🌟 Routine ticked as completed! Great momentum!');
      }
    } else {
      toast('Routine reset to pending.');
    }
    await Promise.all([loadRoutineData(), loadAll()]);
  } catch (err) {
    toast(err.message, true);
  }
}

async function toggleRoutineSkip(id) {
  const p = state.plans.find((item) => item.id === Number(id));
  if (!p) return;
  const nextStatus = p.is_skipped ? 'pending' : 'skipped';

  try {
    await api(`/api/plans/${id}/log`, {
      method: 'POST',
      body: JSON.stringify({ date: state.selectedPlanDate, status: nextStatus })
    });
    toast(nextStatus === 'skipped' ? 'Slot marked as skipped.' : 'Slot unskipped.');
    await Promise.all([loadRoutineData(), loadAll()]);
  } catch (err) {
    toast(err.message, true);
  }
}

async function setSkipDay(date, reason, active = true) {
  try {
    await api('/api/plans/skip-day', {
      method: 'POST',
      body: JSON.stringify({ date, reason, active })
    });
    toast(active ? `🌴 Rest / Skip Day set for ${date}. Streaks protected!` : 'Routine resumed!');
    $('#skipDayModal')?.classList.add('hidden');
    await Promise.all([loadRoutineData(), loadAll()]);
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteSkipDay(date) {
  try {
    await api(`/api/plans/skip-days/${date}`, { method: 'DELETE' });
    toast(`🌴 Rest / Skip Day for ${date} removed. Routine resumed!`);
    await Promise.all([loadRoutineData(), loadAll()]);
  } catch (err) {
    toast(err.message, true);
  }
}

function renderSkipDaysList() {
  const container = $('#skipDaysListContainer');
  const countEl = $('#skipDaysCount');
  if (!container) return;

  const list = state.skipDays || [];
  if (countEl) countEl.textContent = `${list.length} scheduled`;

  if (!list.length) {
    container.innerHTML = '<p class="muted small-text">No rest days scheduled yet. Pick a date above to configure one.</p>';
    return;
  }

  container.innerHTML = list.map((item) => {
    const d = new Date(item.date + 'T12:00:00');
    const dateFormatted = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `
      <div class="skip-day-item">
        <div class="skip-day-item-info">
          <span class="skip-day-item-date">🌴 ${dateFormatted}</span>
          <span class="skip-day-item-reason">${esc(item.reason || 'Rest Day')}</span>
        </div>
        <button type="button" class="skip-day-del-btn" data-delete-skip-day="${item.date}" title="Remove this rest day">
          🗑️ Delete
        </button>
      </div>
    `;
  }).join('');
}

function planOccursOnDate(p, targetDateStr) {
  if (p.occurs !== undefined && targetDateStr === state.selectedPlanDate) return Boolean(p.occurs);
  const base = new Date(p.date + 'T12:00:00');
  const target = new Date(targetDateStr + 'T12:00:00');
  const daysDiff = Math.round((target - base) / 86400000);
  if (daysDiff < 0 && p.repeat !== 'once') return false;

  const dayOfWeek = target.getDay(); // 0 = Sun, 6 = Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isWeekday = !isWeekend;

  if (p.repeat === 'once') return p.date === targetDateStr;
  if (p.repeat === 'daily') return true;
  if (p.repeat === 'weekdays') return isWeekday;
  if (p.repeat === 'weekends') return isWeekend;
  if (p.repeat === 'weekly') return dayOfWeek === base.getDay();
  return false;
}

function renderHomeRoutineWidget() {
  const container = $('#homeRoutineItems');
  if (!container) return;

  const todayISO = localISO(new Date());
  const todayPlans = (state.plans || []).filter((p) => planOccursOnDate(p, todayISO));
  const total = todayPlans.length;
  const done = todayPlans.filter((p) => p.is_completed).length;
  const skipped = todayPlans.filter((p) => p.is_skipped).length;
  const pending = Math.max(0, total - done - skipped);
  const score = state.isSkipDay ? 100 : total > 0 ? Math.round((done / total) * 100) : 0;

  if ($('#homeRoutinePct')) $('#homeRoutinePct').textContent = `${score}%`;
  if ($('#homeRoutineProgressBar')) $('#homeRoutineProgressBar').style.width = `${score}%`;
  if ($('#homeRoutineStreak')) $('#homeRoutineStreak').textContent = `${state.planPerformance?.streak || 0} days`;
  if ($('#homeRoutineDoneCount')) $('#homeRoutineDoneCount').textContent = done;
  if ($('#homeRoutinePendingCount')) $('#homeRoutinePendingCount').textContent = pending;

  const badge = $('#homeRoutineStatusBadge');
  if (badge) {
    if (state.isSkipDay) {
      badge.textContent = '🌴 Rest Day';
      badge.style.background = '#ede9fe';
      badge.style.color = '#6d28d9';
    } else if (score === 100 && total > 0) {
      badge.textContent = '🌟 Complete!';
      badge.style.background = '#dcfce7';
      badge.style.color = '#15803d';
    } else {
      badge.textContent = total > 0 ? `${done}/${total} Done` : 'No Routines';
      badge.style.background = '';
      badge.style.color = '';
    }
  }

  if (state.isSkipDay) {
    container.innerHTML = `<div class="empty-state" style="padding:14px;margin:0">
      <strong style="color:var(--primary)">🌴 Rest &amp; Skip Day Active</strong>
      Your daily routine is paused today. Streaks are protected!
    </div>`;
    return;
  }

  if (!todayPlans.length) {
    container.innerHTML = `<div class="empty-state" style="padding:14px;margin:0">
      <strong>No routines scheduled for today</strong>
      <button type="button" class="text-button" data-goto="planner" style="margin-top:4px">＋ Add your first routine →</button>
    </div>`;
    return;
  }

  container.innerHTML = todayPlans.slice(0, 5).map((p) => {
    const isDone = p.is_completed;
    return `
      <div class="home-routine-row ${isDone ? 'completed' : ''}">
        <button type="button" class="routine-tick-btn" data-toggle-routine="${p.id}" title="${
          isDone ? 'Click to mark pending' : 'Click to tick mark as done'
        }">
          ${isDone ? '✓' : ''}
        </button>
        <p class="home-routine-name">${esc(p.name)}</p>
        <span class="home-routine-time">⏱ ${esc(p.start_time)}</span>
      </div>
    `;
  }).join('');
}

function updatePlanTaskOptions(selectedTaskId = null) {
  const select = $('#planTaskSelect');
  if (!select) return;

  const currentVal = selectedTaskId !== null ? selectedTaskId : select.value;
  let opts = '<option value="">-- Choose an existing task to auto-fill (optional) --</option>';
  (state.tasks || []).forEach((t) => {
    const isDone = t.status === 'Completed';
    const isSelected = currentVal && Number(currentVal) === t.id;
    opts += `<option value="${t.id}" ${isSelected ? 'selected' : ''}>${isDone ? '✓ ' : ''}[${t.priority}] ${esc(t.title)} (${esc(t.category || 'General')})</option>`;
  });
  select.innerHTML = opts;
}

function renderTaskPicker(filter = '') {
  const container = $('#taskPickerItems');
  if (!container) return;

  const q = filter.toLowerCase().trim();
  const filtered = (state.tasks || []).filter((t) => {
    if (!q) return true;
    return (t.title || '').toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q);
  });

  if (!filtered.length) {
    container.innerHTML = '<p class="muted small-text">No matching tasks found.</p>';
    return;
  }

  container.innerHTML = filtered.map((t) => {
    const isDone = t.status === 'Completed';
    return `
      <div class="task-picker-card">
        <div class="task-picker-info">
          <h4>${isDone ? '✓ ' : ''}${esc(t.title)}</h4>
          <p>${esc(t.category || 'General')} • Priority: ${esc(t.priority)}${t.due_date ? ` • Due: ${t.due_date}` : ''}</p>
        </div>
        <button type="button" class="task-schedule-btn" data-pick-task="${t.id}">
          ⏱ Schedule Routine
        </button>
      </div>
    `;
  }).join('');
}

function scheduleTaskAsRoutine(taskId) {
  const task = (state.tasks || []).find((t) => t.id === Number(taskId));
  if (!task) return;

  setView('planner');
  const panel = $('#planFormPanel');
  if (panel) {
    panel.removeAttribute('hidden');
    if ($('#planFormTitle')) $('#planFormTitle').textContent = `Schedule Task: ${task.title}`;
    const f = $('#planForm');
    f?.reset();
    if (f?.elements.id) f.elements.id.value = '';

    updatePlanTaskOptions(task.id);

    if ($('#planNameInput')) $('#planNameInput').value = task.title;
    if ($('#planCategory')) {
      const match = Array.from($('#planCategory').options).some((o) => o.value.toLowerCase() === (task.category || '').toLowerCase());
      if (match) $('#planCategory').value = task.category;
    }
    if ($('#planDate')) $('#planDate').value = task.due_date || state.selectedPlanDate;
    if ($('#planStart')) $('#planStart').value = '09:00';
    if ($('#planEnd')) $('#planEnd').value = '10:30';
    if ($('#planDuration')) $('#planDuration').textContent = durationText('09:00', '10:30');
    if (f?.elements.notes) f.elements.notes.value = task.description || '';
    if ($('#savePlanBtn')) $('#savePlanBtn').textContent = 'Schedule as Routine';

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`📋 Pre-filled routine for "${task.title}". Adjust slot times and save!`);
  }
}

async function savePlan(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const id = String(f.get('id') || '');
  const payload = {
    name: f.get('name'),
    category: f.get('category') || 'General',
    date: f.get('date'),
    start_time: f.get('start_time'),
    end_time: f.get('end_time'),
    repeat: f.get('repeat') || 'daily',
    notes: f.get('notes'),
    reminder: f.get('reminder') === 'on',
    task_id: f.get('task_id') ? Number(f.get('task_id')) : null
  };

  try {
    const r = await api(id ? `/api/plans/${id}` : '/api/plans', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });

    if (r.overlap) toast(r.overlap, true);
    else toast(id ? 'Routine updated.' : 'Routine added to Time Table!');

    e.target.reset();
    if (e.target.elements.id) e.target.elements.id.value = '';
    $('#planFormPanel')?.setAttribute('hidden', '');
    if ($('#planDate')) $('#planDate').value = state.selectedPlanDate;
    if ($('#planStart')) $('#planStart').value = '09:00';
    if ($('#planEnd')) $('#planEnd').value = '10:30';
    if ($('#savePlanBtn')) $('#savePlanBtn').textContent = 'Save Routine';

    await Promise.all([loadRoutineData(), loadAll()]);
  } catch (err) {
    toast(err.message, true);
  }
}

function editPlan(id) {
  const p = state.plans.find((item) => item.id === Number(id));
  if (!p) return;
  const f = $('#planForm');
  if (!f) return;

  $('#planFormPanel')?.removeAttribute('hidden');
  if ($('#planFormTitle')) $('#planFormTitle').textContent = 'Edit Routine / Slot';

  for (const key of ['id', 'name', 'category', 'date', 'start_time', 'end_time', 'notes']) {
    if (f.elements[key]) f.elements[key].value = key === 'id' ? p.id : p[key] || '';
  }

  updatePlanTaskOptions(p.task_id);

  const radio = f.querySelector(`input[name="repeat"][value="${p.repeat}"]`);
  if (radio) radio.checked = true;
  if (f.elements.reminder) f.elements.reminder.checked = Boolean(p.reminder);
  if ($('#planDuration')) $('#planDuration').textContent = durationText(p.start_time, p.end_time);
  if ($('#savePlanBtn')) $('#savePlanBtn').textContent = 'Update Routine';

  $('#planFormPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deletePlan(id) {
  const p = state.plans.find((item) => item.id === Number(id));
  if (!p || !confirm(`Remove routine “${p.name}” from time table?`)) return;
  try {
    await api(`/api/plans/${id}`, { method: 'DELETE' });
    toast('Routine removed.');
    await Promise.all([loadRoutineData(), loadAll()]);
  } catch (e) {
    toast(e.message, true);
  }
}

function resourceForm(r = {}) {
  const hasFile = Boolean(r?.file_data);
  const isImg = hasFile && (r.file_type?.startsWith('image/') || r.file_data?.startsWith('data:image/'));

  return `<form id="resourceEditor" class="modal-form">
    <input type="hidden" name="file_data" id="noteFileData" value="${esc(r.file_data || '')}">
    <input type="hidden" name="file_name" id="noteFileName" value="${esc(r.file_name || '')}">
    <input type="hidden" name="file_type" id="noteFileType" value="${esc(r.file_type || '')}">

    <div class="field full-span">
      <label>Resource / Note Title *</label>
      <input name="title" required maxlength="180" value="${esc(
        r.title || ''
      )}" placeholder="e.g. DSA Revision Notes, Architecture Diagram, Formulae">
    </div>

    <div class="field">
      <label>Category</label>
      <input name="category" value="${esc(r.category || 'General')}" placeholder="e.g. Study, Work, Habit">
    </div>

    <div class="field">
      <label>Web Link / URL (optional)</label>
      <input name="url" type="url" value="${esc(r.url || '')}" placeholder="https://…">
    </div>

    <div class="field full-span">
      <label>Notes / Details</label>
      <textarea name="notes" maxlength="5000" rows="3" placeholder="What key insights, code, or steps should you remember?">${esc(
        r.notes || ''
      )}</textarea>
    </div>

    <!-- Attachment & Screenshot Dropzone Area -->
    <div class="field full-span note-attachment-section">
      <label>📎 Attach Image, Screenshot, or File</label>
      <input type="file" id="noteFileInput" accept="image/*,.pdf,.doc,.docx,.txt" style="display:none">
      
      <div id="noteAttachmentBox" class="note-attachment-box">
        <div id="noteDropzonePrompt" class="${hasFile ? 'hidden' : ''}">
          <div class="dropzone-inner">
            <span class="dropzone-icon">📷</span>
            <div class="dropzone-text">
              <strong>Attach an image or paste a screenshot</strong>
              <p class="muted small-text">Click button below, or simply press <kbd>Ctrl + V</kbd> to paste a screenshot!</p>
            </div>
            <button type="button" class="outline-small" id="triggerNoteFileInput">📁 Choose Image / File</button>
          </div>
        </div>

        <div id="noteAttachmentPreview" class="note-preview-wrapper ${hasFile ? '' : 'hidden'}">
          ${
            hasFile
              ? isImg
                ? `<div class="preview-img-container">
                    <img src="${esc(r.file_data)}" alt="Preview" class="preview-thumb">
                    <div class="preview-meta">
                      <span class="preview-name">${esc(r.file_name || 'Screenshot')}</span>
                      <button type="button" class="danger-btn-mini" id="removeNoteAttachmentBtn">✕ Remove</button>
                    </div>
                  </div>`
                : `<div class="preview-file-container">
                    <span class="file-icon">📄</span>
                    <span class="preview-name">${esc(r.file_name || 'Attached File')}</span>
                    <button type="button" class="danger-btn-mini" id="removeNoteAttachmentBtn">✕ Remove</button>
                  </div>`
              : ''
          }
        </div>
      </div>
    </div>

    <div class="modal-actions">
      <button type="button" class="outline-small" data-close-modal>Cancel</button>
      <button class="primary-btn" type="submit">Save note</button>
    </div>
  </form>`;
}

function newResource(r = null) {
  state.editingResource = r?.id || null;
  openModal(r ? 'Edit note' : 'Add note', resourceForm(r || {}));
  setupResourceAttachmentHandlers(r);
}

function setupResourceAttachmentHandlers(r) {
  const fileInput = $('#noteFileInput');
  const triggerBtn = $('#triggerNoteFileInput');
  const previewBox = $('#noteAttachmentPreview');
  const promptBox = $('#noteDropzonePrompt');
  const dataInput = $('#noteFileData');
  const nameInput = $('#noteFileName');
  const typeInput = $('#noteFileType');

  if (triggerBtn && fileInput) {
    triggerBtn.onclick = () => fileInput.click();
  }

  const setAttachment = (dataUrl, fileName, fileType) => {
    if (dataInput) dataInput.value = dataUrl;
    if (nameInput) nameInput.value = fileName;
    if (typeInput) typeInput.value = fileType;

    const isImg = fileType.startsWith('image/') || dataUrl.startsWith('data:image/');
    if (previewBox) {
      previewBox.innerHTML = isImg
        ? `<div class="preview-img-container">
            <img src="${dataUrl}" alt="Preview" class="preview-thumb">
            <div class="preview-meta">
              <span class="preview-name">${esc(fileName)}</span>
              <button type="button" class="danger-btn-mini" id="removeNoteAttachmentBtn">✕ Remove</button>
            </div>
          </div>`
        : `<div class="preview-file-container">
            <span class="file-icon">📄</span>
            <span class="preview-name">${esc(fileName)}</span>
            <button type="button" class="danger-btn-mini" id="removeNoteAttachmentBtn">✕ Remove</button>
          </div>`;
      previewBox.classList.remove('hidden');
      if (promptBox) promptBox.classList.add('hidden');
      bindRemoveBtn();
    }
  };

  const bindRemoveBtn = () => {
    const removeBtn = $('#removeNoteAttachmentBtn');
    if (removeBtn) {
      removeBtn.onclick = () => {
        if (dataInput) dataInput.value = '';
        if (nameInput) nameInput.value = '';
        if (typeInput) typeInput.value = '';
        if (fileInput) fileInput.value = '';
        if (previewBox) {
          previewBox.innerHTML = '';
          previewBox.classList.add('hidden');
        }
        if (promptBox) promptBox.classList.remove('hidden');
      };
    }
  };

  bindRemoveBtn();

  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) {
        return toast('Attachment size must be under 15MB', true);
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        setAttachment(evt.target.result, file.name, file.type || 'application/octet-stream');
        toast('📎 File attached successfully!');
      };
      reader.readAsDataURL(file);
    };
  }

  // Paste screenshot directly into the form
  const form = $('#resourceEditor');
  if (form) {
    form.onpaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = (evt) => {
            const fileName = `screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            setAttachment(evt.target.result, fileName, blob.type || 'image/png');
            toast('📸 Screenshot captured and attached!');
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };
  }
}

async function saveResource(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const payload = {
    title: f.get('title'),
    url: f.get('url'),
    notes: f.get('notes'),
    category: f.get('category'),
    file_data: f.get('file_data') || null,
    file_name: f.get('file_name') || null,
    file_type: f.get('file_type') || null
  };
  try {
    await api(
      state.editingResource ? `/api/resources/${state.editingResource}` : '/api/resources',
      { method: state.editingResource ? 'PUT' : 'POST', body: JSON.stringify(payload) }
    );
    closeModal();
    toast('Note saved successfully!');
    await loadAll();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderResources() {
  const r = state.resources;
  if ($('#resourcesGrid')) {
    $('#resourcesGrid').innerHTML = r.length
      ? r
          .map((x) => {
            const hasFile = Boolean(x.file_data);
            const isImg =
              hasFile && (x.file_type?.startsWith('image/') || x.file_data?.startsWith('data:image/'));

            let attachmentHTML = '';
            if (hasFile) {
              if (isImg) {
                attachmentHTML = `
                  <div class="resource-img-thumb-wrap" data-view-img="${x.id}" title="Click to view full screenshot">
                    <img src="${esc(x.file_data)}" alt="${esc(x.file_name || x.title)}" class="resource-card-img">
                    <span class="zoom-pill">🔍 View Screenshot</span>
                  </div>
                `;
              } else {
                attachmentHTML = `
                  <div class="resource-file-row">
                    <a href="${esc(x.file_data)}" download="${esc(x.file_name || 'attachment')}" class="resource-file-link" title="Download attachment">
                      📄 <span>${esc(x.file_name || 'Attached File')}</span> <small>↓ Download</small>
                    </a>
                  </div>
                `;
              }
            }

            return `
              <article class="resource-card">
                <div class="resource-top-row">
                  <div class="resource-icon">${isImg ? '🖼️' : '◇'}</div>
                  <span class="eyebrow">${esc(x.category || 'GENERAL')}</span>
                </div>
                <h3>${esc(x.title)}</h3>
                ${attachmentHTML}
                <p class="resource-notes-text">${esc(x.notes || 'No notes added yet.')}</p>
                ${
                  x.url
                    ? `<a class="resource-link" href="${esc(
                        x.url
                      )}" target="_blank" rel="noopener noreferrer">🔗 ${esc(x.url)}</a>`
                    : ''
                }
                <div class="resource-actions">
                  <button class="text-button" data-edit-resource="${x.id}">Edit</button>
                  <button class="text-button" data-delete-resource="${x.id}">Delete</button>
                </div>
              </article>
            `;
          })
          .join('')
      : empty('Your notes are empty', 'Save a useful note, link, image, or screenshot to get started.');
  }
}

async function deleteResource(id) {
  if (!confirm('Delete this saved resource?')) return;
  try {
    await api(`/api/resources/${id}`, { method: 'DELETE' });
    toast('Resource deleted.');
    await loadAll();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderNotifications() {
  const late = state.tasks.filter(isOverdue);
  const soon = state.tasks.filter(
    (t) =>
      t.status !== 'Completed' &&
      t.due_date &&
      !isOverdue(t) &&
      new Date(t.due_date + 'T00:00:00') - new Date() < 3 * 86400000
  );

  const generated = [
    ...late.map((t) => ({
      title: 'Overdue task',
      message: `${t.title} was due ${dateText(t.due_date)}.`,
      type: 'late'
    })),
    ...soon.map((t) => ({
      title: 'Upcoming deadline',
      message: `${t.title} is due ${dateText(t.due_date)}.`,
      type: 'soon'
    }))
  ];

  const stored = state.notifications.map((n) => ({ ...n, stored: true }));
  const items = [...stored, ...generated];

  if ($('#notificationItems')) {
    $('#notificationItems').innerHTML = items.length
      ? items
          .map(
            (n) =>
              `<div class="notice-item ${n.read_at ? 'read' : ''}">
                <strong>${esc(n.title)}</strong>
                <p>${esc(n.message)}</p>
                <small>${n.created_at ? esc(n.created_at) : 'Task reminder'}</small>
                ${
                  n.stored && !n.read_at
                    ? `<button class="text-button" data-read-notice="${n.id}">Mark read</button>`
                    : ''
                }
              </div>`
          )
          .join('')
      : empty('All clear', 'No overdue or upcoming deadlines found.');
  }

  const unread = stored.filter((n) => !n.read_at).length;
  const dot = $('#notificationsBtn .notification-dot');
  if (dot) {
    dot.textContent = unread ? String(unread) : '';
    dot.classList.toggle('has-count', unread > 0);
  }
}

function setView(view) {
  state.view = view;
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));
  $$('.nav-item[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view)
  );
  $$('.bottom-nav-item[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view)
  );
  $('#sidebar')?.classList.remove('open');
  if (view === 'home') renderDashboard();
  if (view === 'tasks') renderTasks();
  if (view === 'planner') renderPlanner();
  if (view === 'resources') renderResources();
  if (view === 'assistant' && $('#chatMessages')) {
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  }
}

function formatBotMessage(text) {
  if (!text) return '';
  let safe = esc(text);
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*(.*?)\*/g, '<em>$1</em>');
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

function addChat(text, who = 'bot') {
  const box = $('#chatMessages');
  if (!box) return;
  const b = document.createElement('div');
  b.className = `chat-bubble ${who}`;
  if (who === 'bot') {
    b.innerHTML = formatBotMessage(text);
  } else {
    b.textContent = text;
  }
  box.appendChild(b);
  box.scrollTop = box.scrollHeight;
}

async function sendChat(message) {
  addChat(message, 'user');
  try {
    const r = await api('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
    if ($('#assistantMode')) $('#assistantMode').textContent = r.mode || 'Assistant';
    addChat(r.answer + (r.notice ? `\n\n${r.notice}` : ''), 'bot');
  } catch (e) {
    addChat(e.message, 'bot');
  }
}

async function checkSession() {
  try {
    const r = await api('/api/me');
    state.user = r.user;
    showApp();
  } catch {
    showAuth(state.resetToken ? 'resetForm' : 'loginForm');
  }
}

function bind() {
  if ($('#themeToggle')) $('#themeToggle').onclick = theme;
  if ($('#themeToggleApp')) $('#themeToggleApp').onclick = theme;

  if ($('#showSignup')) $('#showSignup').onclick = () => showAuth('signupForm');
  if ($('#showLogin')) $('#showLogin').onclick = () => showAuth('loginForm');
  if ($('#backLogin')) $('#backLogin').onclick = () => showAuth('loginForm');
  if ($('#forgotBtn')) $('#forgotBtn').onclick = () => showAuth('forgotForm');

  $$('[data-target]').forEach((b) => {
    b.onclick = () => {
      const i = $('#' + b.dataset.target);
      if (!i) return;
      i.type = i.type === 'password' ? 'text' : 'password';
      b.textContent = i.type === 'password' ? 'Show' : 'Hide';
    };
  });

  if ($('#login')) {
    $('#login').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            identity: f.get('identity'),
            password: f.get('password'),
            remember: f.get('remember') === 'on'
          })
        });
        state.user = r.user;
        showApp();
        toast('Welcome back!');
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#signup')) {
    $('#signup').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (f.get('password') !== f.get('confirmPassword')) {
        return toast('Passwords do not match.', true);
      }
      const draft = Object.fromEntries(
        ['name', 'email', 'password', 'confirmPassword'].map((k) => [k, f.get(k)])
      );
      try {
        const r = await api('/auth/signup', { method: 'POST', body: JSON.stringify(draft) });
        state.user = r.user;
        showApp();
        toast('Account created successfully!');
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#forgot')) {
    $('#forgot').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const email = new FormData(e.target).get('email');
        const r = await api('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        if (r.resetToken) {
          state.resetToken = r.resetToken;
          showAuth('resetForm');
          toast(r.message || 'Account verified! Enter your new password.');
          if ($('#resetPassword')) $('#resetPassword').focus();
        } else {
          toast(r.message || 'Password reset instructions sent.');
          showAuth('loginForm');
        }
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#reset')) {
    $('#reset').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const f = new FormData(e.target);
        const password = f.get('password');
        const confirmPassword = f.get('confirmPassword');
        if (password !== confirmPassword) {
          return toast('Passwords do not match.', true);
        }
        if (!password || password.length < 8) {
          return toast('Password must be at least 8 characters.', true);
        }
        if (!state.resetToken) {
          return toast('Reset token missing. Please request a new reset.', true);
        }
        const r = await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: state.resetToken, password, confirmPassword })
        });
        history.replaceState({}, '', location.pathname);
        state.resetToken = null;
        if (r.user) {
          state.user = r.user;
          showApp();
          toast(r.message || 'Password updated! Welcome back.');
        } else {
          showAuth('loginForm');
          toast(r.message || 'Password updated. You can now sign in.');
        }
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#cancelReset')) {
    $('#cancelReset').onclick = () => {
      state.resetToken = null;
      showAuth('loginForm');
    };
  }

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
    } catch {}
    state.user = null;
    state.tasks = [];
    state.plans = [];
    state.resources = [];
    state.notifications = [];
    state.skipDays = [];
    state.planPerformance = null;
    showAuth('loginForm');
    toast('You have signed out.');
  };

  if ($('#logoutBtn')) $('#logoutBtn').onclick = logout;
  if ($('#profileLogout')) $('#profileLogout').onclick = logout;
  if ($('#profileMenu')) {
    $('#profileMenu').onclick = () => $('#profileDropdown')?.classList.toggle('hidden');
  }

  if ($('#openChangePassBtn')) {
    $('#openChangePassBtn').onclick = () => {
      $('#profileDropdown')?.classList.add('hidden');
      $('#changePassForm')?.reset();
      $('#changePassModal')?.classList.remove('hidden');
    };
  }
  if ($('#closeChangePassModal')) {
    $('#closeChangePassModal').onclick = () => $('#changePassModal')?.classList.add('hidden');
  }
  if ($('#cancelChangePassModal')) {
    $('#cancelChangePassModal').onclick = () => $('#changePassModal')?.classList.add('hidden');
  }
  if ($('#changePassForm')) {
    $('#changePassForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const currentPassword = f.get('currentPassword');
      const newPassword = f.get('newPassword');
      const confirmPassword = f.get('confirmPassword');
      if (newPassword !== confirmPassword) {
        return toast('New passwords do not match.', true);
      }
      if (!newPassword || newPassword.length < 8) {
        return toast('New password must be at least 8 characters.', true);
      }
      try {
        const r = await api('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
        toast(r.message || 'Password changed successfully!');
        $('#changePassModal')?.classList.add('hidden');
        e.target.reset();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#menuToggle')) {
    $('#menuToggle').onclick = () => $('#sidebar')?.classList.toggle('open');
  }

  $$('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $$('[data-goto]').forEach((b) => (b.onclick = () => setView(b.dataset.goto)));

  if ($('#addTask')) $('#addTask').onclick = () => newTask();
  if ($('#addTaskTop')) $('#addTaskTop').onclick = () => newTask();
  if ($('#addResource')) $('#addResource').onclick = () => newResource();

  /* =========================================================
     TIME TABLE, ROUTINE & SKIP DAY CONTROLS
     ========================================================= */

  // Routine Date Controls
  if ($('#routinePrevDay')) {
    $('#routinePrevDay').onclick = () => {
      const cur = new Date(state.selectedPlanDate + 'T12:00:00');
      cur.setDate(cur.getDate() - 1);
      loadRoutineData(localISO(cur));
    };
  }

  if ($('#routineNextDay')) {
    $('#routineNextDay').onclick = () => {
      const cur = new Date(state.selectedPlanDate + 'T12:00:00');
      cur.setDate(cur.getDate() + 1);
      loadRoutineData(localISO(cur));
    };
  }

  if ($('#routineToday')) {
    $('#routineToday').onclick = () => {
      loadRoutineData(localISO(new Date()));
    };
  }

  if ($('#routineDatePicker')) {
    $('#routineDatePicker').onchange = (e) => {
      if (e.target.value) loadRoutineData(e.target.value);
    };
  }

  // Category Filter Chips
  $$('[data-routine-cat]').forEach((chip) => {
    chip.onclick = () => {
      $$('[data-routine-cat]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedRoutineCat = chip.dataset.routineCat || '';
      renderRoutineChecklist();
    };
  });

  // Toggle Rest / Skip Day Modal
  if ($('#toggleSkipDayBtn')) {
    $('#toggleSkipDayBtn').onclick = () => {
      if ($('#skipDateInput')) $('#skipDateInput').value = state.selectedPlanDate;
      renderSkipDaysList();
      $('#skipDayModal')?.classList.remove('hidden');
    };
  }

  if ($('#closeSkipDayModal')) {
    $('#closeSkipDayModal').onclick = () => $('#skipDayModal')?.classList.add('hidden');
  }
  if ($('#cancelSkipDayModal')) {
    $('#cancelSkipDayModal').onclick = () => $('#skipDayModal')?.classList.add('hidden');
  }

  if ($('#skipReasonSelect')) {
    $('#skipReasonSelect').onchange = (e) => {
      $('#customReasonField')?.classList.toggle('hidden', e.target.value !== 'custom');
    };
  }

  if ($('#skipDayForm')) {
    $('#skipDayForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const date = f.get('skip_date') || state.selectedPlanDate;
      let reason = f.get('skip_reason');
      if (reason === 'custom') {
        reason = f.get('custom_reason') || 'Rest Day';
      }
      await setSkipDay(date, reason, true);
    };
  }

  if ($('#removeSkipDayBtn')) {
    $('#removeSkipDayBtn').onclick = async () => {
      await setSkipDay(state.selectedPlanDate, '', false);
    };
  }

  // Auto-fill from selected task in routine form
  if ($('#planTaskSelect')) {
    $('#planTaskSelect').onchange = (e) => {
      const taskId = Number(e.target.value);
      if (!taskId) return;
      const task = (state.tasks || []).find((t) => t.id === taskId);
      if (!task) return;

      if ($('#planNameInput')) $('#planNameInput').value = task.title;
      if ($('#planCategory')) {
        const match = Array.from($('#planCategory').options).some(
          (o) => o.value.toLowerCase() === (task.category || '').toLowerCase()
        );
        if (match) $('#planCategory').value = task.category;
      }
      if ($('#planDate') && task.due_date) {
        $('#planDate').value = task.due_date;
      }
      const notesInput = $('#planForm')?.elements?.notes;
      if (notesInput && task.description) {
        notesInput.value = task.description;
      }
      toast(`Auto-filled routine details from "${task.title}"`);
    };
  }

  // Task Picker Modal Controls
  if ($('#openTaskPickerBtn')) {
    $('#openTaskPickerBtn').onclick = () => {
      renderTaskPicker();
      $('#taskPickerModal')?.classList.remove('hidden');
    };
  }
  if ($('#closeTaskPickerModal')) {
    $('#closeTaskPickerModal').onclick = () => $('#taskPickerModal')?.classList.add('hidden');
  }
  if ($('#taskPickerSearch')) {
    $('#taskPickerSearch').oninput = (e) => renderTaskPicker(e.target.value);
  }

  // Routine Form Controls
  if ($('#plannerAdd')) {
    $('#plannerAdd').onclick = () => {
      const panel = $('#planFormPanel');
      if (panel) {
        const isHidden = panel.hasAttribute('hidden');
        if (isHidden) {
          panel.removeAttribute('hidden');
          if ($('#planFormTitle')) $('#planFormTitle').textContent = 'Add Routine / Slot';
          const f = $('#planForm');
          f?.reset();
          if (f?.elements.id) f.elements.id.value = '';
          if ($('#planDate')) $('#planDate').value = state.selectedPlanDate;
          if ($('#planStart')) $('#planStart').value = '09:00';
          if ($('#planEnd')) $('#planEnd').value = '10:30';
          if ($('#planDuration')) $('#planDuration').textContent = durationText('09:00', '10:30');
          if ($('#savePlanBtn')) $('#savePlanBtn').textContent = 'Save Routine';
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          panel.setAttribute('hidden', '');
        }
      }
    };
  }

  if ($('#closePlanFormBtn')) {
    $('#closePlanFormBtn').onclick = () => $('#planFormPanel')?.setAttribute('hidden', '');
  }

  if ($('#cancelPlanEdit')) {
    $('#cancelPlanEdit').onclick = () => {
      const f = $('#planForm');
      f?.reset();
      if (f?.elements.id) f.elements.id.value = '';
      $('#planFormPanel')?.setAttribute('hidden', '');
    };
  }

  if ($('#planForm')) $('#planForm').onsubmit = savePlan;
  if ($('#planDate')) $('#planDate').value = state.selectedPlanDate;

  const updateDuration = () => {
    if ($('#planDuration') && $('#planStart') && $('#planEnd')) {
      $('#planDuration').textContent = durationText($('#planStart').value, $('#planEnd').value);
    }
  };

  if ($('#planStart')) $('#planStart').oninput = updateDuration;
  if ($('#planEnd')) $('#planEnd').oninput = updateDuration;

  // Task Filter Controls
  if ($('#taskSearch')) $('#taskSearch').oninput = renderTasks;
  if ($('#statusFilter')) $('#statusFilter').onchange = renderTasks;
  if ($('#priorityFilter')) $('#priorityFilter').onchange = renderTasks;
  if ($('#categoryFilter')) $('#categoryFilter').onchange = renderTasks;
  if ($('#sortFilter')) $('#sortFilter').onchange = renderTasks;

  if ($('#globalSearch')) {
    $('#globalSearch').oninput = () => {
      if (state.view !== 'tasks') setView('tasks');
      if ($('#taskSearch')) $('#taskSearch').value = $('#globalSearch').value;
      renderTasks();
    };
  }

  if ($('#clearFilters')) {
    $('#clearFilters').onclick = () => {
      if ($('#taskSearch')) $('#taskSearch').value = '';
      if ($('#statusFilter')) $('#statusFilter').value = '';
      if ($('#priorityFilter')) $('#priorityFilter').value = '';
      if ($('#categoryFilter')) $('#categoryFilter').value = '';
      if ($('#sortFilter')) $('#sortFilter').value = 'deadline';
      if ($('#globalSearch')) $('#globalSearch').value = '';
      renderTasks();
    };
  }

  if ($('#closeModal')) $('#closeModal').onclick = closeModal;
  if ($('#modalBackdrop')) {
    $('#modalBackdrop').onclick = (e) => {
      if (e.target === $('#modalBackdrop')) closeModal();
    };
  }

  // Lightbox Modal Controls
  if ($('#closeLightboxModal')) {
    $('#closeLightboxModal').onclick = () => $('#imageLightboxModal')?.classList.add('hidden');
  }
  if ($('#imageLightboxModal')) {
    $('#imageLightboxModal').onclick = (e) => {
      if (e.target === $('#imageLightboxModal')) $('#imageLightboxModal')?.classList.add('hidden');
    };
  }

  if ($('#closeNotifications')) {
    $('#closeNotifications').onclick = () => $('#notificationPanel')?.classList.add('hidden');
  }
  if ($('#notificationsBtn')) {
    $('#notificationsBtn').onclick = () =>
      $('#notificationPanel')?.classList.toggle('hidden');
  }

  if ($('#markAllRead')) {
    $('#markAllRead').onclick = async () => {
      try {
        await api('/api/notifications/read-all', { method: 'POST', body: '{}' });
        await loadAll();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }

  if ($('#broadcastForm')) {
    $('#broadcastForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await api('/api/notifications/broadcast', {
          method: 'POST',
          body: JSON.stringify({ title: f.get('title'), message: f.get('message') })
        });
        toast(r.message);
        e.target.reset();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#prevWeek')) {
    $('#prevWeek').onclick = () => {
      state.weekOffset--;
      renderWeeklyCalendar();
    };
  }
  if ($('#nextWeek')) {
    $('#nextWeek').onclick = () => {
      state.weekOffset++;
      renderWeeklyCalendar();
    };
  }
  if ($('#todayWeek')) {
    $('#todayWeek').onclick = () => {
      state.weekOffset = 0;
      renderWeeklyCalendar();
    };
  }

  if ($('#topAsk')) $('#topAsk').onclick = () => setView('assistant');
  if ($('#chatForm')) {
    $('#chatForm').onsubmit = (e) => {
      e.preventDefault();
      const input = e.target.message;
      const m = input.value.trim();
      if (m) {
        input.value = '';
        sendChat(m);
      }
    };
  }

  $$('[data-prompt]').forEach((b) => (b.onclick = () => sendChat(b.dataset.prompt)));

  // Global Click Delegations
  document.addEventListener('click', (e) => {
    // Tick mark completion on routine checklist
    const toggleRoutine = e.target.closest('[data-toggle-routine]');
    if (toggleRoutine) {
      toggleRoutineComplete(toggleRoutine.dataset.toggleRoutine);
      return;
    }

    // Skip single routine slot
    const skipRoutine = e.target.closest('[data-skip-routine]');
    if (skipRoutine) {
      toggleRoutineSkip(skipRoutine.dataset.skipRoutine);
      return;
    }

    // Click on performance graph bar
    const graphDay = e.target.closest('[data-graph-day]');
    if (graphDay) {
      loadRoutineData(graphDay.dataset.graphDay);
      return;
    }

    // Schedule task into Routine from My Tasks list
    const scheduleTask = e.target.closest('[data-schedule-task]');
    if (scheduleTask) {
      scheduleTaskAsRoutine(scheduleTask.dataset.scheduleTask);
      return;
    }

    // Schedule task from Task Picker modal
    const pickTask = e.target.closest('[data-pick-task]');
    if (pickTask) {
      $('#taskPickerModal')?.classList.add('hidden');
      scheduleTaskAsRoutine(pickTask.dataset.pickTask);
      return;
    }

    // Delete a scheduled Rest / Skip Day
    const delSkip = e.target.closest('[data-delete-skip-day]');
    if (delSkip) {
      deleteSkipDay(delSkip.dataset.deleteSkipDay);
      return;
    }

    // Edit plan / routine
    const ep = e.target.closest('[data-edit-plan]');
    if (ep) {
      editPlan(ep.dataset.editPlan);
      return;
    }

    // Delete plan / routine
    const dp = e.target.closest('[data-delete-plan]');
    if (dp) {
      deletePlan(dp.dataset.deletePlan);
      return;
    }

    const nr = e.target.closest('[data-read-notice]');
    if (nr) {
      api(`/api/notifications/${nr.dataset.readNotice}/read`, {
        method: 'POST',
        body: '{}'
      })
        .then(loadAll)
        .catch((err) => toast(err.message, true));
      return;
    }

    const t = e.target.closest('[data-complete]');
    if (t) {
      completeTask(t.dataset.complete, t.checked);
      return;
    }

    const d = e.target.closest('[data-detail]');
    if (d) {
      taskDetail(d.dataset.detail);
      return;
    }

    // Lightbox image view
    const viewImg = e.target.closest('[data-view-img]');
    if (viewImg) {
      const resId = Number(viewImg.dataset.viewImg);
      const targetNote = state.resources.find((item) => item.id === resId);
      if (targetNote && targetNote.file_data) {
        if ($('#lightboxImg')) $('#lightboxImg').src = targetNote.file_data;
        if ($('#lightboxTitle')) $('#lightboxTitle').textContent = targetNote.file_name || targetNote.title;
        if ($('#lightboxDownloadBtn')) {
          $('#lightboxDownloadBtn').href = targetNote.file_data;
          $('#lightboxDownloadBtn').download = targetNote.file_name || 'screenshot.png';
        }
        $('#imageLightboxModal')?.classList.remove('hidden');
      }
      return;
    }

    const edit = e.target.closest('[data-edit-task]');
    if (edit) {
      const targetTask = state.tasks.find((x) => x.id === Number(edit.dataset.editTask));
      if (targetTask) newTask(targetTask);
      return;
    }

    const del = e.target.closest('[data-delete-task]');
    if (del) {
      deleteTask(del.dataset.deleteTask);
      return;
    }

    const er = e.target.closest('[data-edit-resource]');
    if (er) {
      newResource(state.resources.find((x) => x.id === Number(er.dataset.editResource)));
      return;
    }

    const dr = e.target.closest('[data-delete-resource]');
    if (dr) {
      deleteResource(dr.dataset.deleteResource);
      return;
    }

    if (e.target.closest('[data-close-modal]')) closeModal();
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'taskEditor') saveTask(e);
    if (e.target.id === 'resourceEditor') saveResource(e);
  });
}

window.addEventListener('error', (event) => {
  console.error(event.error || event.message);
  toast('Unexpected app error. Check the browser console for details.', true);
});

initTheme();
bind();
checkSession();
if (new URLSearchParams(location.search).has('authError')) {
  toast('Google sign-in failed. Please try again.', true);
}
