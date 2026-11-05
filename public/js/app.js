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
  skipDays: [],
  // Exam & Long-Term Roadmap state (1 to 12 Months)
  examPlans: [],
  selectedExamPlanId: null,
  selectedExamPlanDetail: null,
  selectedExamActivityDate: localISO(new Date()),
  examFilter: '',
  // TaskMind Enhanced Planning & Assistant State
  selectedTaskTab: '',
  assistantMode: 'tasks_and_notes',
  confirmAction: null
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
    const [tasks, stats, resources, plansData, perfData, notices, skipDaysData, examPlansData] = await Promise.all([
      api('/api/tasks'),
      api('/api/tasks/stats'),
      api('/api/resources'),
      api(`/api/plans?date=${state.selectedPlanDate}`),
      api('/api/plans/performance'),
      api('/api/notifications'),
      api('/api/plans/skip-days').catch(() => ({ skip_days: [] })),
      api('/api/exam-plans').catch(() => ({ plans: [] }))
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
    state.examPlans = examPlansData?.plans || [];

    renderDashboard();
    renderTasks();
    renderPlanner();
    renderResources();
    renderNotifications();
    renderSkipDaysList();
    renderHomeRoutineWidget();
    renderHomeExamWidget();
    renderExamPlans();
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
  if ($('#statInProgress')) $('#statInProgress').textContent = s.inProgress || 0;
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
  renderHomeExamWidget();
}

function taskRow(t) {
  const effort = t.effort_estimate || 3;
  let prereqBadge = '';
  if (t.prerequisites && t.prerequisites.length > 0) {
    const blockedBy = t.prerequisites
      .map((pid) => state.tasks.find((x) => x.id === pid))
      .filter((p) => !p || p.status !== 'Completed');
    if (blockedBy.length === 0) {
      prereqBadge = `<span class="prereq-badge ready" title="All prerequisites completed">✓ Ready</span>`;
    } else {
      prereqBadge = `<span class="prereq-badge blocked" title="Waiting on ${blockedBy.length} prerequisite task(s)">🔒 Blocked (${blockedBy.length})</span>`;
    }
  }

  const dueDisplay = t.due_date
    ? dateText(t.due_date) + (t.due_time ? ' ' + t.due_time : '')
    : 'No deadline';

  return `<div class="task-row"><input class="task-check" type="checkbox" data-complete="${t.id}" ${
    t.status === 'Completed' ? 'checked' : ''
  } aria-label="Complete or reopen ${esc(t.title)}"><div class="task-row-content"><h3 class="${
    t.status === 'Completed' ? 'done' : ''
  }">${esc(t.title)}</h3><p>${esc(t.description || t.category || 'General')}</p><div class="task-row-meta"><span class="priority-tag ${t.priority.toLowerCase()}">${esc(
    t.priority
  )}</span><span class="status-tag ${statusClass(statusLabel(t))}">${esc(
    statusLabel(t)
  )}</span><span class="effort-pill" title="Effort level ${effort}/5">⚡ Effort ${effort}/5</span>${prereqBadge}<span class="due-tag ${isOverdue(t) ? 'late' : ''}">${esc(
    dueDisplay
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
  const allCount = state.tasks.length;
  const pendingCount = state.tasks.filter((t) => t.status === 'Pending').length;
  const progressCount = state.tasks.filter((t) => t.status === 'In Progress').length;
  const completedCount = state.tasks.filter((t) => t.status === 'Completed').length;
  const overdueCount = state.tasks.filter(isOverdue).length;

  if ($('#tabCountAll')) $('#tabCountAll').textContent = allCount;
  if ($('#tabCountPending')) $('#tabCountPending').textContent = pendingCount;
  if ($('#tabCountProgress')) $('#tabCountProgress').textContent = progressCount;
  if ($('#tabCountCompleted')) $('#tabCountCompleted').textContent = completedCount;
  if ($('#tabCountOverdue')) $('#tabCountOverdue').textContent = overdueCount;

  $$('.task-tab-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.taskTab === (state.selectedTaskTab || ''))
  );

  if (state.selectedTaskTab === 'dependencies') {
    $('#allTasks')?.classList.add('hidden');
    $('.filters-panel')?.classList.add('hidden');
    $('#dependencyView')?.classList.remove('hidden');
    renderDependencyView();
    return;
  } else {
    $('#allTasks')?.classList.remove('hidden');
    $('.filters-panel')?.classList.remove('hidden');
    $('#dependencyView')?.classList.add('hidden');
  }

  const q = ($('#taskSearch')?.value || $('#globalSearch')?.value || '').toLowerCase();
  const status = $('#statusFilter')?.value || '';
  const priority = $('#priorityFilter')?.value || '';
  const category = $('#categoryFilter')?.value || '';
  const sort = $('#sortFilter')?.value || 'deadline';
  const tabFilter = state.selectedTaskTab || '';

  let arr = state.tasks.filter((t) => {
    const matchesSearch = !q || `${t.title} ${t.description}`.toLowerCase().includes(q);
    const matchesTab = !tabFilter
      ? true
      : tabFilter === 'Overdue'
      ? isOverdue(t)
      : t.status === tabFilter;
    const matchesStatus = !status
      ? true
      : status === 'Overdue'
      ? statusLabel(t) === 'Overdue'
      : t.status === status;
    const matchesPriority = !priority || t.priority === priority;
    const matchesCategory = !category || t.category === category;
    return matchesSearch && matchesTab && matchesStatus && matchesPriority && matchesCategory;
  });

  const rank = { High: 0, Medium: 1, Low: 2 };
  arr.sort((a, b) =>
    sort === 'priority'
      ? rank[a.priority] - rank[b.priority]
      : sort === 'effort'
      ? (b.effort_estimate || 3) - (a.effort_estimate || 3)
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

async function renderDependencyView() {
  try {
    const [depData, cpmData] = await Promise.all([
      api('/api/tasks/dependency-order').catch(() => ({ ready_tasks: [], blocked_tasks: [] })),
      api('/api/tasks/critical-path').catch(() => ({ total_duration: 0, critical_path: [], all_tasks: [] }))
    ]);
    if ($('#depSummaryTitle')) {
      $('#depSummaryTitle').textContent = `Project Duration: ${cpmData.total_duration || 0} mins (${cpmData.critical_path?.length || 0} tasks on Critical Path)`;
    }
    if ($('#depSummaryDesc')) {
      $('#depSummaryDesc').textContent = cpmData.has_cycle
        ? '⚠️ Circular dependency detected. Resolve task prerequisites.'
        : `Dependency Order: ${depData.ready_tasks?.length || 0} tasks ready to execute now.`;
    }
    if ($('#readyCount')) $('#readyCount').textContent = depData.ready_tasks?.length || 0;
    if ($('#blockedCount')) $('#blockedCount').textContent = depData.blocked_tasks?.length || 0;

    if ($('#readyTasksList')) {
      $('#readyTasksList').innerHTML = depData.ready_tasks?.length
        ? depData.ready_tasks.map((t) => `
          <div class="task-row" style="margin:0">
            <input class="task-check" type="checkbox" data-complete="${t.id}" ${t.status === 'Completed' ? 'checked' : ''}>
            <div class="task-row-content">
              <h3 class="${t.status === 'Completed' ? 'done' : ''}">${esc(t.title)}</h3>
              <div class="task-row-meta">
                <span class="priority-tag ${t.priority.toLowerCase()}">${esc(t.priority)}</span>
                <span class="effort-pill">⚡ ${t.effort_estimate || 3}/5</span>
                <span class="prereq-badge ready">✓ Ready</span>
                <span class="due-tag">${t.estimated_minutes ? t.estimated_minutes + 'm' : 'Flexible'}</span>
              </div>
            </div>
            <div class="task-row-actions">
              <button class="mini-icon-btn" data-detail="${t.id}" title="View details">↗</button>
            </div>
          </div>
        `).join('')
        : '<p class="muted small-text">No ready tasks.</p>';
    }

    if ($('#blockedTasksList')) {
      $('#blockedTasksList').innerHTML = depData.blocked_tasks?.length
        ? depData.blocked_tasks.map((t) => `
          <div class="task-row" style="margin:0;opacity:0.9">
            <div class="task-row-content">
              <h3>${esc(t.title)}</h3>
              <p class="muted small-text" style="margin:4px 0">🔒 Waiting on: <b>${esc((t.unmet_prerequisites || []).map(p => p.title).join(', ') || 'prior tasks')}</b></p>
              <div class="task-row-meta">
                <span class="priority-tag ${t.priority.toLowerCase()}">${esc(t.priority)}</span>
                <span class="effort-pill">⚡ ${t.effort_estimate || 3}/5</span>
                <span class="prereq-badge blocked">Blocked</span>
              </div>
            </div>
            <div class="task-row-actions">
              <button class="mini-icon-btn" data-detail="${t.id}" title="View details">↗</button>
            </div>
          </div>
        `).join('')
        : '<p class="muted small-text">No blocked tasks. All tasks are ready!</p>';
    }
  } catch (err) {
    toast(err.message, true);
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
  const otherTasks = state.tasks.filter((x) => x.id !== (t.id || 0));
  const currentPrereqs = Array.isArray(t.prerequisites) ? t.prerequisites : [];

  return `<form id="taskEditor" class="modal-form">
    <div class="field full-span">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <label style="margin:0">Task title *</label>
        <button type="button" class="text-button" id="btnSmartSuggest" style="font-weight:700;color:var(--primary)">✨ Auto Suggest</button>
      </div>
      <input name="title" id="taskTitleField" required maxlength="180" value="${esc(
        t.title || ''
      )}" placeholder="What needs to get done?">
      <div id="smartSuggestNotice" class="smart-suggest-helper hidden"></div>
    </div>
    <div class="field full-span"><label>Description</label><textarea name="description" id="taskDescField" maxlength="5000" placeholder="Add a few helpful details…">${esc(
      t.description || ''
    )}</textarea></div>
    <div class="field"><label>Start date</label><input type="date" name="start_date" value="${esc(
      t.start_date || ''
    )}"></div>
    <div class="field"><label>Deadline date</label><input type="date" name="due_date" value="${esc(
      t.due_date || ''
    )}"></div>
    <div class="field"><label>Due time (optional)</label><input type="time" name="due_time" value="${esc(
      t.due_time || ''
    )}"></div>
    <div class="field"><label>Priority</label><select name="priority" id="taskPriorityField"><option ${
      t.priority === 'High' ? 'selected' : ''
    }>High</option><option ${
      !t.priority || t.priority === 'Medium' ? 'selected' : ''
    }>Medium</option><option ${t.priority === 'Low' ? 'selected' : ''}>Low</option></select></div>
    <div class="field"><label>Status</label><select name="status" id="taskStatusField"><option ${
      !t.status || t.status === 'Pending' ? 'selected' : ''
    }>Pending</option><option ${
      t.status === 'In Progress' ? 'selected' : ''
    }>In Progress</option><option ${
      t.status === 'Completed' ? 'selected' : ''
    }>Completed</option></select></div>
    <div class="field"><label>Category / subject</label><input name="category" id="taskCategoryField" maxlength="120" value="${esc(
      t.category || 'General'
    )}"></div>
    <div class="field"><label>Estimated minutes</label><input type="number" name="estimated_minutes" min="1" max="10080" value="${esc(
      t.estimated_minutes || ''
    )}" placeholder="e.g. 45"></div>
    <div class="field"><label>Effort estimate (1–5)</label>
      <select name="effort_estimate" id="taskEffortField">
        <option value="1" ${t.effort_estimate === 1 ? 'selected' : ''}>1 - Very Low (Quick task)</option>
        <option value="2" ${t.effort_estimate === 2 ? 'selected' : ''}>2 - Low</option>
        <option value="3" ${!t.effort_estimate || t.effort_estimate === 3 ? 'selected' : ''}>3 - Medium</option>
        <option value="4" ${t.effort_estimate === 4 ? 'selected' : ''}>4 - High</option>
        <option value="5" ${t.effort_estimate === 5 ? 'selected' : ''}>5 - Very High (Complex)</option>
      </select>
    </div>
    <div class="field full-span">
      <label>Prerequisite Tasks (Dependencies)</label>
      <div style="max-height:130px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--surface-2);display:grid;gap:6px">
        ${
          otherTasks.length
            ? otherTasks
                .map(
                  (ot) => `
            <label class="check-label" style="font-size:12px;cursor:pointer">
              <input type="checkbox" name="prerequisites" value="${ot.id}" ${
                    currentPrereqs.includes(ot.id) ? 'checked' : ''
                  }>
              <span>${esc(ot.title)}</span> <small class="muted">(${esc(ot.status)})</small>
            </label>`
                )
                .join('')
            : '<p class="muted small-text" style="margin:0">No other tasks available to depend on.</p>'
        }
      </div>
    </div>
    <div class="field full-span"><label>Subtasks (one per line)</label><textarea name="subtasks" placeholder="Read the brief&#10;Draft an outline&#10;Review and submit">${esc(
      (t.subtasks || []).map((x) => x.title).join('\n')
    )}</textarea></div>
    <div class="modal-actions"><button type="button" class="outline-small" data-close-modal>Cancel</button><button class="primary-btn" type="submit">Save task</button></div>
  </form>`;
}

function newTask(t = null) {
  state.editingTask = t?.id || null;
  openModal(t ? 'Edit task' : 'Create a task', taskForm(t || {}));

  const suggestBtn = $('#btnSmartSuggest');
  if (suggestBtn) {
    suggestBtn.onclick = async () => {
      const title = $('#taskTitleField')?.value?.trim();
      const description = $('#taskDescField')?.value?.trim();
      if (!title) {
        toast('Please enter a task title first to auto-suggest.', true);
        return;
      }
      try {
        suggestBtn.textContent = 'Analyzing...';
        const res = await api('/api/tasks/smart-suggest', {
          method: 'POST',
          body: JSON.stringify({ title, description })
        });
        suggestBtn.textContent = '✨ Auto Suggest';
        if (res.suggested_category && $('#taskCategoryField')) {
          $('#taskCategoryField').value = res.suggested_category;
        }
        if (res.suggested_priority && $('#taskPriorityField')) {
          $('#taskPriorityField').value = res.suggested_priority;
        }
        if (res.suggested_effort && $('#taskEffortField')) {
          $('#taskEffortField').value = String(res.suggested_effort);
        }
        const notice = $('#smartSuggestNotice');
        if (notice) {
          notice.innerHTML = `<span>✨ Suggested: ${esc(res.suggested_category)} | ${esc(
            res.suggested_priority
          )} priority | Effort ${res.suggested_effort}/5 (${esc(res.rationale)})</span>`;
          notice.classList.remove('hidden');
        }
      } catch (err) {
        suggestBtn.textContent = '✨ Auto Suggest';
        toast(err.message, true);
      }
    };
  }
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
    due_time: f.get('due_time') || null,
    priority: f.get('priority'),
    status: f.get('status'),
    category: f.get('category'),
    estimated_minutes: f.get('estimated_minutes') || null,
    effort_estimate: Number(f.get('effort_estimate')) || 3,
    prerequisites: Array.from(f.getAll('prerequisites')).map(Number).filter(Boolean),
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
    const effort = t.effort_estimate || 3;
    const dueFull = t.due_date
      ? dateText(t.due_date) + (t.due_time ? ' at ' + t.due_time : '')
      : 'Not set';

    let prereqsHtml = '<p class="muted">No prerequisite tasks required.</p>';
    if (t.prerequisites && t.prerequisites.length > 0) {
      prereqsHtml = t.prerequisites
        .map((pid) => {
          const pt = state.tasks.find((x) => x.id === pid);
          const isDone = pt && pt.status === 'Completed';
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span class="prereq-badge ${isDone ? 'ready' : 'blocked'}">${isDone ? '✓ Done' : '⏳ Pending'}</span>
            <b>${esc(pt ? pt.title : 'Task #' + pid)}</b>
          </div>`;
        })
        .join('');
    }

    openModal(
      'Task details',
      `<div class="detail-view">
        <div class="priority-meta"><span class="priority-tag ${t.priority.toLowerCase()}">${esc(
          t.priority
        )} priority</span><span class="status-tag ${statusClass(statusLabel(t))}">${esc(
          statusLabel(t)
        )}</span><span class="effort-pill">⚡ Effort ${effort}/5</span></div>
        <h2 style="margin-top:15px">${esc(t.title)}</h2>
        <p class="muted">${esc(t.description || 'No description.')}</p>
        <div class="detail-grid">
          <p><b>Category</b><br>${esc(t.category || 'General')}</p>
          <p><b>Start date</b><br>${esc(dateText(t.start_date))}</p>
          <p><b>Deadline & Time</b><br>${esc(dueFull)}</p>
          <p><b>Estimated time</b><br>${
            t.estimated_minutes ? esc(t.estimated_minutes + ' minutes') : 'Not set'
          }</p>
          <p><b>Created</b><br>${esc(t.created_at)}</p>
        </div>
        <h3>Prerequisites</h3>
        ${prereqsHtml}
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
    const ps = state.plans.filter((p) => p.date === iso || p.repeat === 'daily');

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
  return `<form id="resourceEditor" class="modal-form">
    <div class="field full-span"><label>Resource title *</label><input name="title" required maxlength="180" value="${esc(
      r.title || ''
    )}" placeholder="e.g. JavaScript revision notes"></div>
    <div class="field full-span"><label>URL (optional)</label><input name="url" type="url" value="${esc(
      r.url || ''
    )}" placeholder="https://…"></div>
    <div class="field full-span"><label>Notes</label><textarea name="notes" maxlength="5000" placeholder="What should you remember?">${esc(
      r.notes || ''
    )}</textarea></div>
    <div class="field full-span"><label>Category</label><input name="category" value="${esc(
      r.category || 'General'
    )}"></div>
    <div class="modal-actions"><button type="button" class="outline-small" data-close-modal>Cancel</button><button class="primary-btn" type="submit">Save resource</button></div>
  </form>`;
}

function newResource(r = null) {
  state.editingResource = r?.id || null;
  openModal(r ? 'Edit note' : 'Add note', resourceForm(r || {}));
}

async function saveResource(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const payload = Object.fromEntries(
    ['title', 'url', 'notes', 'category'].map((k) => [k, f.get(k)])
  );
  try {
    await api(
      state.editingResource ? `/api/resources/${state.editingResource}` : '/api/resources',
      { method: state.editingResource ? 'PUT' : 'POST', body: JSON.stringify(payload) }
    );
    closeModal();
    toast('Resource saved.');
    await loadAll();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderResources() {
  const q = ($('#noteSearch')?.value || '').toLowerCase();
  const cat = $('#noteCategoryFilter')?.value || '';

  const r = state.resources.filter((x) => {
    const matchesQ =
      !q || `${x.title} ${x.notes || ''} ${x.category || ''}`.toLowerCase().includes(q);
    const matchesCat = !cat || x.category === cat;
    return matchesQ && matchesCat;
  });

  const catSelect = $('#noteCategoryFilter');
  if (catSelect) {
    const cats = [...new Set(state.resources.map((x) => x.category).filter(Boolean))];
    const oldVal = catSelect.value;
    catSelect.innerHTML =
      '<option value="">All categories</option>' +
      cats.map((c) => `<option>${esc(c)}</option>`).join('');
    catSelect.value = cats.includes(oldVal) ? oldVal : '';
  }

  if ($('#resourcesGrid')) {
    $('#resourcesGrid').innerHTML = r.length
      ? r
          .map(
            (x) => `<article class="resource-card">
              <div class="resource-icon">◇</div>
              <span class="eyebrow">${esc(x.category || 'GENERAL')}</span>
              <h3>${esc(x.title)}</h3>
              <p>${esc(x.notes || 'No notes added yet.')}</p>
              ${
                x.url
                  ? `<a class="resource-link" href="${esc(
                      x.url
                    )}" target="_blank" rel="noopener noreferrer">${esc(x.url)}</a>`
                  : ''
              }
              <div class="resource-actions">
                <button class="text-button" data-edit-resource="${x.id}">Edit</button>
                <button class="text-button" data-delete-resource="${x.id}">Delete</button>
              </div>
            </article>`
          )
          .join('')
      : empty(
          q || cat ? 'No matching notes found' : 'Your notes are empty',
          q || cat
            ? 'Try adjusting your search terms.'
            : 'Save a useful note or link to get started.'
        );
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
  if (view === 'exam-plans') renderExamPlans();
  if (view === 'resources') renderResources();
  if (view === 'assistant' && $('#chatMessages')) {
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  }
}

function addChat(text, who = 'bot') {
  const box = $('#chatMessages');
  if (!box) return;
  const b = document.createElement('div');
  b.className = `chat-bubble ${who}`;
  b.textContent = text;
  box.appendChild(b);
  box.scrollTop = box.scrollHeight;
}

async function sendChat(message) {
  addChat(message, 'user');
  try {
    const r = await api('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message, mode: state.assistantMode || 'tasks_and_notes' })
    });
    if ($('#assistantMode')) $('#assistantMode').textContent = r.mode || 'Assistant';

    const box = $('#chatMessages');
    if (box) {
      const b = document.createElement('div');
      b.className = 'chat-bubble bot';
      const botText = r.answer + (r.notice ? `\n\n${r.notice}` : '');

      let sourcesHtml = '';
      if (r.sources && r.sources.length) {
        sourcesHtml = `<div class="chat-sources"><strong>Sources:</strong> ${r.sources
          .map((s) => `<span class="source-chip">${esc(s)}</span>`)
          .join('')}</div>`;
      }

      b.innerHTML = `<div>${esc(botText).replace(/\n/g, '<br>')}</div>${sourcesHtml}`;
      box.appendChild(b);
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) {
    addChat(e.message, 'bot');
  }
}

/* =========================================================
   EXAM & LONG-TERM ROADMAPS (1 TO 12 MONTHS) LOGIC
   ========================================================= */

function durationLabel(type, totalDays) {
  if (type === '1month' || totalDays <= 35) return '1 Month (Sprint)';
  if (type === '3months' || (totalDays > 35 && totalDays <= 100)) return '3 Months';
  if (type === '6months' || (totalDays > 100 && totalDays <= 200)) return '6 Months';
  if (type === '12months' || totalDays > 200) return '12 Months (Full Year)';
  return `${totalDays} Days`;
}

function renderHomeExamWidget() {
  const container = $('#homeExamContent');
  if (!container) return;

  const plans = state.examPlans || [];
  if (!plans.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:20px;border-style:dashed">
        <strong>🎯 Have an upcoming test, exam, or 1–12 month goal?</strong>
        <p class="muted" style="margin:4px 0 12px;font-size:12px">Create a focused roadmap with milestone phases, target daily study hours, and daily activity tracking.</p>
        <button type="button" class="primary-btn" id="homeCreateExamBtn" style="min-height:36px;font-size:12px;padding:0 14px">＋ Create 1 to 12 Month Roadmap</button>
      </div>
    `;
    $('#homeCreateExamBtn')?.addEventListener('click', () => {
      openNewExamPlanModal();
    });
    return;
  }

  const activePlan = plans[0];
  container.innerHTML = `
    <div class="home-exam-card">
      <div class="home-exam-left">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span class="exam-cat-pill">${esc(activePlan.category)}</span>
          <span class="exam-duration-pill">${esc(durationLabel(activePlan.duration_type, activePlan.total_days))}</span>
        </div>
        <h3 class="home-exam-title">${esc(activePlan.title)}</h3>
        <div class="home-exam-countdown">
          <strong>${activePlan.days_left > 0 ? activePlan.days_left : 0}</strong>
          <span>${activePlan.days_left > 0 ? 'Days Remaining until Target' : 'Target Date Reached'} • ${esc(dateText(activePlan.target_date))}</span>
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap">
          <span>Timeline: <b>Day ${activePlan.current_day_number} of ${activePlan.total_days}</b></span> •
          <span>Progress: <b>${activePlan.progress_pct}%</b></span> •
          <span>Today's Tasks: <b>${activePlan.today_completed}/${activePlan.today_total} Done</b></span>
        </div>
      </div>
      <div>
        <button type="button" class="primary-btn" data-open-exam-plan="${activePlan.id}" style="min-height:40px;font-size:12px">
          Open Daily Roadmap →
        </button>
      </div>
    </div>
  `;
}

function renderExamPlans() {
  const grid = $('#examPlansGrid');
  if (!grid) return;

  const filter = state.examFilter || '';
  const filtered = (state.examPlans || []).filter((p) => {
    if (!filter) return true;
    if (filter === 'Exam') return p.category.toLowerCase().includes('exam') || p.category.toLowerCase().includes('academic') || p.category.toLowerCase().includes('test');
    if (filter === '1month') return p.duration_type === '1month' || p.total_days <= 35;
    if (filter === '3months') return p.duration_type === '3months' || (p.total_days > 35 && p.total_days <= 100);
    if (filter === '6months') return p.duration_type === '6months' || (p.total_days > 100 && p.total_days <= 200);
    if (filter === '12months') return p.duration_type === '12months' || p.total_days > 200;
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state full-span" style="grid-column:1/-1;padding:45px 20px">
        <div class="empty-icon" style="margin:0 auto 12px">🎯</div>
        <strong>No Roadmaps Found</strong>
        <p class="muted" style="margin:6px 0 16px">Create your first 1-month or 12-month test preparation roadmap to track daily activity.</p>
        <button type="button" class="primary-btn" id="emptyCreatePlanBtn">＋ Create New Roadmap</button>
      </div>
    `;
    $('#emptyCreatePlanBtn')?.addEventListener('click', openNewExamPlanModal);
    return;
  }

  grid.innerHTML = filtered.map((p) => {
    return `
      <div class="exam-plan-card">
        <div>
          <div class="exam-card-badges">
            <span class="exam-cat-pill">${esc(p.category)}</span>
            <span class="exam-duration-pill">${esc(durationLabel(p.duration_type, p.total_days))}</span>
          </div>
          <h3 class="exam-plan-title">${esc(p.title)}</h3>
          ${p.description ? `<p class="exam-plan-desc">${esc(p.description)}</p>` : ''}
          <div class="exam-countdown-box">
            <div class="exam-countdown-days">
              <span class="exam-days-num">${p.days_left > 0 ? p.days_left : 0}</span>
              <span class="exam-days-label">${p.days_left > 0 ? 'Days Remaining' : 'Finished'}</span>
            </div>
            <span class="exam-target-date">Target: ${esc(dateText(p.target_date))}</span>
          </div>
          <div class="exam-progress-wrap">
            <div class="exam-progress-top">
              <span>Day ${p.current_day_number} of ${p.total_days}</span>
              <span>${p.progress_pct}% Completed</span>
            </div>
            <div class="exam-progress-bar-bg">
              <div class="exam-progress-bar-fill" style="width:${p.progress_pct}%"></div>
            </div>
          </div>
        </div>
        <div class="exam-card-footer">
          <span class="exam-today-status">Today: <b>${p.today_completed}/${p.today_total} Done</b></span>
          <div style="display:flex;gap:6px">
            <button type="button" class="action-btn-small delete" data-delete-exam-plan="${p.id}" title="Delete Roadmap">🗑</button>
            <button type="button" class="primary-btn" data-open-exam-plan="${p.id}" style="min-height:34px;padding:0 12px;font-size:11px">
              Daily Tracker →
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function openExamPlanDetail(planId, date) {
  state.selectedExamPlanId = Number(planId);
  if (date) state.selectedExamActivityDate = date;

  try {
    const data = await api(`/api/exam-plans/${state.selectedExamPlanId}?date=${state.selectedExamActivityDate}`);
    state.selectedExamPlanDetail = data;

    $('#examPlansListView')?.classList.add('hidden');
    $('#examPlanDetailView')?.classList.remove('hidden');

    const p = data.plan;
    if ($('#detailPlanTitle')) $('#detailPlanTitle').textContent = p.title;
    if ($('#detailPlanCat')) $('#detailPlanCat').textContent = p.category;
    if ($('#detailPlanDuration')) $('#detailPlanDuration').textContent = durationLabel(p.duration_type, p.total_days);
    if ($('#detailPlanDates')) $('#detailPlanDates').textContent = `${dateText(p.start_date)} → ${dateText(p.target_date)}`;
    if ($('#detailDaysLeft')) $('#detailDaysLeft').textContent = p.days_left > 0 ? p.days_left : (p.days_left === 0 ? 'Today!' : 'Passed');
    if ($('#detailCurrentDay')) $('#detailCurrentDay').textContent = `Day ${p.current_day_number} / ${p.total_days}`;
    if ($('#detailProgressPct')) $('#detailProgressPct').textContent = `${p.progress_pct}%`;
    if ($('#detailDailyHours')) $('#detailDailyHours').textContent = `${p.daily_hours} hrs`;
    if ($('#detailTotalHours')) $('#detailTotalHours').textContent = `${p.total_hours_logged || 0} hrs`;

    renderExamMilestones(p.milestones || []);
    renderExamActivities(data.activities || [], data.selected_date);
    renderExamHeatmap(p, data.heatmap || {});
  } catch (e) {
    toast(e.message, true);
  }
}

function renderExamMilestones(milestones) {
  const container = $('#detailMilestonesContainer');
  if (!container) return;

  if (!milestones.length) {
    container.innerHTML = '<p class="muted small-text">No milestone phases defined yet.</p>';
    return;
  }

  container.innerHTML = milestones.map((m, idx) => {
    const isCompleted = m.status === 'completed';
    return `
      <div class="milestone-step-card ${isCompleted ? 'completed' : ''}">
        <div class="milestone-step-header">
          <span class="milestone-step-pill">${isCompleted ? '✓ Completed' : `Phase ${idx + 1}`}</span>
          <span class="muted small-text">Target Day ${m.targetDay || ''}</span>
        </div>
        <h4 class="milestone-step-title">${esc(m.title)}</h4>
        <div class="milestone-step-target">
          <label class="check-label" style="font-size:11px;cursor:pointer">
            <input type="checkbox" data-toggle-milestone="${m.id || idx}" ${isCompleted ? 'checked' : ''}>
            Mark Phase Completed
          </label>
        </div>
      </div>
    `;
  }).join('');
}

function renderExamActivities(activities, selectedDate) {
  const list = $('#examActivityList');
  if (!list) return;

  if ($('#examDatePicker')) $('#examDatePicker').value = selectedDate;
  if ($('#examCurrentDateLabel')) {
    const isToday = selectedDate === localISO(new Date());
    $('#examCurrentDateLabel').textContent = `${isToday ? 'Today · ' : ''}${dateText(selectedDate)}`;
  }

  if (!activities.length) {
    list.innerHTML = `
      <div class="empty-state" style="padding:32px 14px">
        <strong>No Daily Activities for ${esc(dateText(selectedDate))}</strong>
        <p class="muted" style="margin:4px 0 12px;font-size:12px">Add specific topics, practice questions, or study sessions to track for this day.</p>
        <button type="button" class="primary-btn" id="emptyAddActBtn" style="min-height:36px;font-size:11px;padding:0 14px">
          ＋ Add Daily Task
        </button>
      </div>
    `;
    $('#emptyAddActBtn')?.addEventListener('click', openAddExamActivityModal);
    return;
  }

  list.innerHTML = activities.map((a) => {
    const isDone = a.is_completed === 1;
    return `
      <div class="exam-activity-card ${isDone ? 'completed' : ''}">
        <button type="button" class="routine-tick-btn" data-toggle-exam-act="${a.id}" data-act-status="${a.is_completed}" title="${isDone ? 'Mark Incomplete' : 'Mark Completed'}">
          ${isDone ? '✓' : ''}
        </button>
        <div class="exam-activity-info">
          <h4 class="exam-activity-title">${esc(a.title)}</h4>
          <div class="exam-activity-meta">
            ${a.subject ? `<span class="exam-subject-tag">${esc(a.subject)}</span>` : ''}
            <span class="exam-duration-tag">⏱ ${a.target_minutes || 60} mins</span>
            ${a.notes ? `<span>• ${esc(a.notes)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="action-btn-small delete" data-delete-exam-act="${a.id}" title="Delete Activity">✕</button>
      </div>
    `;
  }).join('');
}

function renderExamHeatmap(plan, heatmap) {
  const container = $('#examHeatmapGrid');
  if (!container) return;

  const startDate = new Date(plan.start_date + 'T12:00:00');
  const totalDays = Math.min(365, Math.max(1, plan.total_days));

  const columns = [];
  let currentCol = [];

  for (let i = 0; i < totalDays; i++) {
    const curr = new Date(startDate);
    curr.setDate(curr.getDate() + i);
    const iso = localISO(curr);
    const dayStat = heatmap[iso] || { total: 0, completed: 0 };

    let level = 0;
    if (dayStat.completed >= 6) level = 4;
    else if (dayStat.completed >= 4) level = 3;
    else if (dayStat.completed >= 2) level = 2;
    else if (dayStat.completed >= 1) level = 1;

    currentCol.push({
      date: iso,
      completed: dayStat.completed,
      total: dayStat.total,
      level,
      isToday: iso === localISO(new Date()),
      isSelected: iso === state.selectedExamActivityDate
    });

    if (currentCol.length === 7 || i === totalDays - 1) {
      columns.push(currentCol);
      currentCol = [];
    }
  }

  container.innerHTML = columns.map((col) => {
    const cells = col.map((cell) => {
      const title = `${dateText(cell.date)}: ${cell.completed} completed (${cell.total} tasks)`;
      const activeBorder = cell.isSelected ? 'border-color:var(--primary);outline:2px solid var(--primary)' : '';
      return `<div class="heatmap-cell level-${cell.level}" data-heatmap-date="${cell.date}" title="${esc(title)}" style="${activeBorder}"></div>`;
    }).join('');
    return `<div class="heatmap-col">${cells}</div>`;
  }).join('');
}

function openNewExamPlanModal() {
  const modal = $('#newExamPlanModal');
  if (!modal) return;
  const today = localISO(new Date());
  if ($('#examPlanStartDate')) $('#examPlanStartDate').value = today;

  const target = new Date();
  target.setDate(target.getDate() + 365);
  if ($('#examPlanTargetDate')) $('#examPlanTargetDate').value = localISO(target);

  modal.classList.remove('hidden');
}

function openAddExamActivityModal() {
  const modal = $('#newExamActivityModal');
  if (!modal) return;
  if ($('#examActDate')) $('#examActDate').value = state.selectedExamActivityDate;
  if ($('#examActTitle')) $('#examActTitle').value = '';
  if ($('#examActSubject')) $('#examActSubject').value = '';
  if ($('#examActNotes')) $('#examActNotes').value = '';
  modal.classList.remove('hidden');
}

/* =========================================================
   TASKMIND SMART PLANNING, CPM, AND CONFIRMATION MODALS
   ========================================================= */

function openSmartSchedulerModal() {
  $('#smartSchedulerModal')?.classList.remove('hidden');
  runSmartScheduler(Number($('#schedulerMinutesInput')?.value) || 60);
}

function closeSmartSchedulerModal() {
  $('#smartSchedulerModal')?.classList.add('hidden');
}

async function runSmartScheduler(minutes) {
  const results = $('#schedulerResultsArea');
  if (!results) return;
  results.innerHTML = '<p class="muted small-text">Selecting highest-impact tasks...</p>';
  try {
    const r = await api('/api/tasks/smart-scheduler', {
      method: 'POST',
      body: JSON.stringify({ available_minutes: minutes })
    });
    if (!r.tasks || !r.tasks.length) {
      results.innerHTML = `<div class="empty-state"><strong>No tasks fit in ${minutes} minutes</strong>Try increasing your available time or breaking large tasks down.</div>`;
      return;
    }
    results.innerHTML = `
      <div style="background:var(--primary-soft);border-radius:10px;padding:12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <strong style="color:var(--primary);font-size:14px">✓ ${r.tasks.length} task(s) scheduled</strong>
          <p class="muted small-text" style="margin:2px 0 0">Total planned: <b>${r.total_scheduled_minutes} mins</b> • Buffer remaining: <b>${r.remaining_minutes} mins</b></p>
        </div>
      </div>
      <div class="scheduled-tasks-list" style="display:grid;gap:8px">
        ${r.tasks
          .map(
            (t, idx) => `
          <div class="scheduled-task-card">
            <div class="scheduled-task-left">
              <span class="scheduled-order-badge">${idx + 1}</span>
              <div>
                <strong style="font-size:13px">${esc(t.title)}</strong>
                <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
                  <span class="priority-tag ${t.priority.toLowerCase()}">${esc(t.priority)}</span>
                  <span class="effort-pill">⚡ Effort ${t.effort_estimate || 3}/5</span>
                  <span class="muted small-text">⏱ ${t.estimated_minutes}m</span>
                </div>
              </div>
            </div>
            <button type="button" class="outline-small" data-start-task="${t.id}">${
              t.status === 'In Progress' ? 'Active' : 'Start Task'
            }</button>
          </div>`
          )
          .join('')}
      </div>
    `;
  } catch (err) {
    results.innerHTML = `<p class="muted small-text" style="color:var(--red)">${esc(err.message)}</p>`;
  }
}

async function openCriticalPathModal() {
  $('#criticalPathModal')?.classList.remove('hidden');
  const metricsBox = $('#cpmMetricsRow');
  const chainDisplay = $('#cpmChainDisplay');
  const tableBody = $('#cpmTableBody');

  if (metricsBox) metricsBox.innerHTML = '<p class="muted small-text">Calculating Critical Path passes...</p>';
  try {
    const r = await api('/api/tasks/critical-path');
    if (metricsBox) {
      metricsBox.innerHTML = `
        <div class="cpm-metric-box">
          <span>Total Project Duration</span>
          <strong>${r.total_duration}m</strong>
          <small class="muted">${(r.total_duration / 60).toFixed(1)} hrs</small>
        </div>
        <div class="cpm-metric-box">
          <span>Critical Tasks (0 Slack)</span>
          <strong style="color:var(--red)">${r.critical_path?.length || 0}</strong>
          <small class="muted">Cannot be delayed</small>
        </div>
        <div class="cpm-metric-box">
          <span>Network Tasks</span>
          <strong>${r.all_tasks?.length || 0}</strong>
          <small class="muted">Tasks in dependency graph</small>
        </div>
      `;
    }
    if (chainDisplay) {
      if (r.critical_path && r.critical_path.length) {
        chainDisplay.innerHTML = r.critical_path
          .map(
            (t, idx) => `
          <span class="cpm-node">${esc(t.title)} (${t.duration}m)</span>
          ${idx < r.critical_path.length - 1 ? '<span class="cpm-arrow">➔</span>' : ''}
        `
          )
          .join('');
      } else {
        chainDisplay.innerHTML =
          '<span class="muted small-text">All tasks are currently unchained (or independent).</span>';
      }
    }
    if (tableBody) {
      tableBody.innerHTML =
        r.all_tasks && r.all_tasks.length
          ? r.all_tasks
              .map(
                (t) => `
            <tr class="${t.is_critical ? 'critical-row' : ''}">
              <td><b>${esc(t.title)}</b></td>
              <td>${t.duration}m</td>
              <td>${t.early_start}m</td>
              <td>${t.early_finish}m</td>
              <td>${t.late_start}m</td>
              <td>${t.late_finish}m</td>
              <td><b>${t.slack}m</b></td>
              <td><span class="status-tag ${t.is_critical ? 'late' : ''}">${
                  t.is_critical ? '🔥 Critical' : 'Flexible'
                }</span></td>
            </tr>`
              )
              .join('')
          : '<tr><td colspan="8" class="muted">No tasks available for CPM calculation.</td></tr>';
    }
  } catch (err) {
    toast(err.message, true);
  }
}

function closeCriticalPathModal() {
  $('#criticalPathModal')?.classList.add('hidden');
}

function openConfirmModal({ title, desc, okText, onConfirm }) {
  if ($('#confirmModalTitle')) $('#confirmModalTitle').textContent = title || 'Are you sure?';
  if ($('#confirmModalDesc')) $('#confirmModalDesc').textContent = desc || 'This cannot be undone.';
  if ($('#okConfirmModalBtn')) $('#okConfirmModalBtn').textContent = okText || 'Yes, Proceed';
  state.confirmAction = onConfirm;
  $('#confirmActionModal')?.classList.remove('hidden');
}

function closeConfirmModal() {
  $('#confirmActionModal')?.classList.add('hidden');
  state.confirmAction = null;
}

function setupSearchAutocomplete() {
  const searchInput = $('#taskSearch');
  const autoDropdown = $('#searchAutocompleteDropdown');
  if (!searchInput || !autoDropdown) return;

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim().toLowerCase();
    if (val.length < 1) {
      autoDropdown.classList.add('hidden');
      return;
    }
    const matches = state.tasks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(val) ||
          (t.category && t.category.toLowerCase().includes(val))
      )
      .slice(0, 6);
    if (!matches.length) {
      autoDropdown.classList.add('hidden');
      return;
    }
    autoDropdown.innerHTML = matches
      .map(
        (t) => `
      <div class="autocomplete-item" data-search-term="${esc(t.title)}">
        <span class="item-title">${esc(t.title)}</span>
        <span class="item-cat">${esc(t.category || 'General')}</span>
      </div>`
      )
      .join('');
    autoDropdown.classList.remove('hidden');
  });

  autoDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete-item');
    if (item) {
      searchInput.value = item.dataset.searchTerm;
      autoDropdown.classList.add('hidden');
      renderTasks();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-input-wrap')) {
      autoDropdown.classList.add('hidden');
    }
  });
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
          body: JSON.stringify({ identity: f.get('identity'), password: f.get('password') })
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
        toast(r.message);
        showAuth('loginForm');
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
        const r = await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: state.resetToken, password })
        });
        history.replaceState({}, '', location.pathname);
        toast(r.message);
        state.resetToken = null;
        showAuth('loginForm');
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
    } catch {}
    state.user = null;
    state.tasks = [];
    showAuth('loginForm');
    toast('You have signed out.');
  };

  if ($('#logoutBtn')) $('#logoutBtn').onclick = logout;
  if ($('#profileLogout')) $('#profileLogout').onclick = logout;
  if ($('#profileMenu')) {
    $('#profileMenu').onclick = () => $('#profileDropdown')?.classList.toggle('hidden');
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

  /* =========================================================
     EXAM & LONG-TERM ROADMAP CONTROLS
     ========================================================= */
  if ($('#openNewExamPlanBtn')) $('#openNewExamPlanBtn').onclick = openNewExamPlanModal;
  if ($('#closeNewExamPlanModal')) $('#closeNewExamPlanModal').onclick = () => $('#newExamPlanModal')?.classList.add('hidden');
  if ($('#cancelNewExamPlanModal')) $('#cancelNewExamPlanModal').onclick = () => $('#newExamPlanModal')?.classList.add('hidden');

  if ($('#examPlanDurationSelect')) {
    $('#examPlanDurationSelect').onchange = (e) => {
      const val = e.target.value;
      const startStr = $('#examPlanStartDate')?.value || localISO(new Date());
      const s = new Date(startStr + 'T12:00:00');
      let days = 30;
      if (val === '1month') days = 30;
      else if (val === '3months') days = 90;
      else if (val === '6months') days = 180;
      else if (val === '12months') days = 365;
      s.setDate(s.getDate() + days);
      if ($('#examPlanTargetDate')) $('#examPlanTargetDate').value = localISO(s);
    };
  }

  $$('[data-exam-filter]').forEach((chip) => {
    chip.onclick = () => {
      $$('[data-exam-filter]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.examFilter = chip.dataset.examFilter || '';
      renderExamPlans();
    };
  });

  if ($('#newExamPlanForm')) {
    $('#newExamPlanForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const payload = {
        title: f.get('title'),
        category: f.get('category'),
        duration_type: f.get('duration_type'),
        start_date: f.get('start_date'),
        target_date: f.get('target_date'),
        daily_hours: Number(f.get('daily_hours') || 4),
        description: f.get('description')
      };
      try {
        const res = await api('/api/exam-plans', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast('Exam & Target Roadmap created!');
        $('#newExamPlanModal')?.classList.add('hidden');
        $('#newExamPlanForm').reset();
        await loadAll();
        if (res.plan?.id) {
          setView('exam-plans');
          openExamPlanDetail(res.plan.id);
        }
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#backToPlansBtn')) {
    $('#backToPlansBtn').onclick = () => {
      $('#examPlanDetailView')?.classList.add('hidden');
      $('#examPlansListView')?.classList.remove('hidden');
      loadAll();
    };
  }

  if ($('#deletePlanBtn')) {
    $('#deletePlanBtn').onclick = async () => {
      if (!state.selectedExamPlanId) return;
      if (!confirm('Are you sure you want to delete this Roadmap and all its daily activities?')) return;
      try {
        await api(`/api/exam-plans/${state.selectedExamPlanId}`, { method: 'DELETE' });
        toast('Roadmap deleted.');
        $('#examPlanDetailView')?.classList.add('hidden');
        $('#examPlansListView')?.classList.remove('hidden');
        await loadAll();
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#examPrevDay')) {
    $('#examPrevDay').onclick = () => {
      const d = new Date(state.selectedExamActivityDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      state.selectedExamActivityDate = localISO(d);
      if (state.selectedExamPlanId) openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate);
    };
  }
  if ($('#examToday')) {
    $('#examToday').onclick = () => {
      state.selectedExamActivityDate = localISO(new Date());
      if (state.selectedExamPlanId) openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate);
    };
  }
  if ($('#examNextDay')) {
    $('#examNextDay').onclick = () => {
      const d = new Date(state.selectedExamActivityDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      state.selectedExamActivityDate = localISO(d);
      if (state.selectedExamPlanId) openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate);
    };
  }
  if ($('#examDatePicker')) {
    $('#examDatePicker').onchange = (e) => {
      if (e.target.value) {
        state.selectedExamActivityDate = e.target.value;
        if (state.selectedExamPlanId) openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate);
      }
    };
  }

  if ($('#addExamActivityBtn')) $('#addExamActivityBtn').onclick = openAddExamActivityModal;
  if ($('#closeExamActivityModal')) $('#closeExamActivityModal').onclick = () => $('#newExamActivityModal')?.classList.add('hidden');
  if ($('#cancelExamActivityModal')) $('#cancelExamActivityModal').onclick = () => $('#newExamActivityModal')?.classList.add('hidden');

  if ($('#newExamActivityForm')) {
    $('#newExamActivityForm').onsubmit = async (e) => {
      e.preventDefault();
      if (!state.selectedExamPlanId) return;
      const f = new FormData(e.target);
      const payload = {
        title: f.get('title'),
        subject: f.get('subject'),
        date: f.get('date') || state.selectedExamActivityDate,
        target_minutes: Number(f.get('target_minutes') || 60),
        notes: f.get('notes')
      };
      try {
        await api(`/api/exam-plans/${state.selectedExamPlanId}/activities`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast('Daily activity added!');
        $('#newExamActivityModal')?.classList.add('hidden');
        $('#newExamActivityForm').reset();
        await openExamPlanDetail(state.selectedExamPlanId, payload.date);
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  if ($('#shiftBacklogBtn')) {
    $('#shiftBacklogBtn').onclick = async () => {
      if (!state.selectedExamPlanId) return;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const toDate = localISO(tomorrow);
      try {
        const res = await api(`/api/exam-plans/${state.selectedExamPlanId}/backlog`, {
          method: 'POST',
          body: JSON.stringify({ to_date: toDate })
        });
        toast(res.message || 'Tasks shifted to tomorrow.');
        await openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate);
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  // Setup Autocomplete Search for tasks
  setupSearchAutocomplete();

  // Task List Tabs Switcher
  $$('.task-tab-btn').forEach((btn) => {
    btn.onclick = () => {
      state.selectedTaskTab = btn.dataset.taskTab || '';
      renderTasks();
    };
  });

  // Task Filter Controls
  if ($('#taskSearch')) $('#taskSearch').oninput = renderTasks;
  if ($('#statusFilter')) $('#statusFilter').onchange = renderTasks;
  if ($('#priorityFilter')) $('#priorityFilter').onchange = renderTasks;
  if ($('#categoryFilter')) $('#categoryFilter').onchange = renderTasks;
  if ($('#sortFilter')) $('#sortFilter').onchange = renderTasks;

  // Smart Scheduler Modal Handlers
  if ($('#openSmartSchedulerBtn')) $('#openSmartSchedulerBtn').onclick = openSmartSchedulerModal;
  if ($('#closeSmartSchedulerModal')) $('#closeSmartSchedulerModal').onclick = closeSmartSchedulerModal;
  if ($('#runSmartSchedulerBtn')) {
    $('#runSmartSchedulerBtn').onclick = () => {
      const mins = Number($('#schedulerMinutesInput')?.value) || 60;
      runSmartScheduler(mins);
    };
  }
  $$('[data-preset-min]').forEach((btn) => {
    btn.onclick = () => {
      $$('[data-preset-min]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = Number(btn.dataset.presetMin);
      if ($('#schedulerMinutesInput')) $('#schedulerMinutesInput').value = val;
      runSmartScheduler(val);
    };
  });

  // Critical Path Modal Handlers
  if ($('#openCriticalPathBtn')) $('#openCriticalPathBtn').onclick = openCriticalPathModal;
  if ($('#viewFullCpmBtn')) $('#viewFullCpmBtn').onclick = openCriticalPathModal;
  if ($('#closeCriticalPathModal')) $('#closeCriticalPathModal').onclick = closeCriticalPathModal;

  // Clear All Tasks & Notes Confirmation Modal Handlers
  if ($('#closeConfirmModal')) $('#closeConfirmModal').onclick = closeConfirmModal;
  if ($('#cancelConfirmModalBtn')) $('#cancelConfirmModalBtn').onclick = closeConfirmModal;
  if ($('#okConfirmModalBtn')) {
    $('#okConfirmModalBtn').onclick = async () => {
      if (state.confirmAction) await state.confirmAction();
      closeConfirmModal();
    };
  }

  if ($('#clearAllTasksBtn')) {
    $('#clearAllTasksBtn').onclick = () => {
      openConfirmModal({
        title: 'Clear All Tasks?',
        desc: 'This will permanently remove all tasks from your TaskMind workspace. This cannot be undone.',
        okText: 'Yes, Clear All Tasks',
        onConfirm: async () => {
          try {
            await api('/api/tasks/clear-all', { method: 'DELETE' });
            toast('All tasks have been cleared.');
            await loadAll();
          } catch (err) {
            toast(err.message, true);
          }
        }
      });
    };
  }

  // Notes Search, Filter and Clear Handlers
  if ($('#noteSearch')) $('#noteSearch').oninput = renderResources;
  if ($('#noteCategoryFilter')) $('#noteCategoryFilter').onchange = renderResources;
  if ($('#clearNoteFilters')) {
    $('#clearNoteFilters').onclick = () => {
      if ($('#noteSearch')) $('#noteSearch').value = '';
      if ($('#noteCategoryFilter')) $('#noteCategoryFilter').value = '';
      renderResources();
    };
  }

  if ($('#clearAllNotesBtn')) {
    $('#clearAllNotesBtn').onclick = () => {
      openConfirmModal({
        title: 'Clear All Notes?',
        desc: 'This will permanently delete all saved notes and research links from your library. This cannot be undone.',
        okText: 'Yes, Clear All Notes',
        onConfirm: async () => {
          try {
            await api('/api/resources/clear-all', { method: 'DELETE' });
            toast('All notes have been cleared.');
            await loadAll();
          } catch (err) {
            toast(err.message, true);
          }
        }
      });
    };
  }

  // AI Assistant Dual Mode Switcher
  $$('.assistant-mode-chip').forEach((chip) => {
    chip.onclick = () => {
      $$('.assistant-mode-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.assistantMode = chip.dataset.assistantMode || 'tasks_and_notes';
      if ($('#assistantMode')) $('#assistantMode').textContent = chip.textContent;
    };
  });

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
      state.selectedTaskTab = '';
      renderTasks();
    };
  }

  if ($('#closeModal')) $('#closeModal').onclick = closeModal;
  if ($('#modalBackdrop')) {
    $('#modalBackdrop').onclick = (e) => {
      if (e.target === $('#modalBackdrop')) closeModal();
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

    const startTask = e.target.closest('[data-start-task]');
    if (startTask) {
      const taskId = startTask.dataset.startTask;
      api(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'In Progress' })
      })
        .then(() => {
          toast('Task marked In Progress!');
          loadAll();
          runSmartScheduler(Number($('#schedulerMinutesInput')?.value) || 60);
        })
        .catch((err) => toast(err.message, true));
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

    // Open Exam Plan detail
    const oep = e.target.closest('[data-open-exam-plan]');
    if (oep) {
      setView('exam-plans');
      openExamPlanDetail(oep.dataset.openExamPlan);
      return;
    }

    // Delete Exam Plan
    const dep = e.target.closest('[data-delete-exam-plan]');
    if (dep) {
      if (confirm('Are you sure you want to delete this Roadmap and all its activities?')) {
        api(`/api/exam-plans/${dep.dataset.deleteExamPlan}`, { method: 'DELETE' })
          .then(() => {
            toast('Roadmap deleted.');
            loadAll();
          })
          .catch((err) => toast(err.message, true));
      }
      return;
    }

    // Toggle Exam Activity (Tick mark)
    const tea = e.target.closest('[data-toggle-exam-act]');
    if (tea) {
      const actId = tea.dataset.toggleExamAct;
      const currentDone = tea.dataset.actStatus === '1';
      api(`/api/exam-plans/${state.selectedExamPlanId}/activities/${actId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_completed: !currentDone })
      })
        .then(() => openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate))
        .catch((err) => toast(err.message, true));
      return;
    }

    // Delete Exam Activity
    const dea = e.target.closest('[data-delete-exam-act]');
    if (dea) {
      api(`/api/exam-plans/${state.selectedExamPlanId}/activities/${dea.dataset.deleteExamAct}`, {
        method: 'DELETE'
      })
        .then(() => {
          toast('Activity deleted.');
          openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate);
        })
        .catch((err) => toast(err.message, true));
      return;
    }

    // Heatmap cell click
    const hmc = e.target.closest('[data-heatmap-date]');
    if (hmc) {
      state.selectedExamActivityDate = hmc.dataset.heatmapDate;
      if (state.selectedExamPlanId) {
        openExamPlanDetail(state.selectedExamPlanId, state.selectedExamActivityDate);
      }
      return;
    }

    // Toggle Milestone Phase Checkbox
    const tmc = e.target.closest('[data-toggle-milestone]');
    if (tmc) {
      if (!state.selectedExamPlanDetail?.plan) return;
      const plan = state.selectedExamPlanDetail.plan;
      const milestones = [...(plan.milestones || [])];
      const mIdx = milestones.findIndex((x, i) => String(x.id || i) === String(tmc.dataset.toggleMilestone));
      if (mIdx !== -1) {
        milestones[mIdx].status = tmc.checked ? 'completed' : 'pending';
        api(`/api/exam-plans/${plan.id}`, {
          method: 'PUT',
          body: JSON.stringify({ milestones })
        })
          .then(() => openExamPlanDetail(plan.id, state.selectedExamActivityDate))
          .catch((err) => toast(err.message, true));
      }
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
