const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeTasksAndNotes } = require('../routes/assistant');

test('AI Assistant provides note summarization with sources', () => {
  const tasks = [{ id: 1, title: 'Exam Prep', priority: 'High', status: 'Pending' }];
  const notes = [
    { id: 101, title: 'Physics Formulae', notes: 'E = mc^2 and kinematics equations.', category: 'Science' },
    { id: 102, title: 'Interview Tips', notes: 'Prepare STAR method stories.', category: 'Career' }
  ];

  const res = analyzeTasksAndNotes(tasks, notes, 'Please summarize my notes');
  assert.equal(res.mode, 'My Tasks & Notes Mode');
  assert.ok(res.answer.includes('Physics Formulae'));
  assert.ok(res.answer.includes('Interview Tips'));
  assert.ok(res.sources.length >= 2);
  assert.ok(res.sources.some(s => s.includes('Note #101')));
});

test('AI Assistant provides Workload-aware assessment', () => {
  const tasks = [
    { id: 1, title: 'Heavy Report', priority: 'High', status: 'Pending', estimated_minutes: 120, effort_estimate: 4 },
    { id: 2, title: 'Quick Call', priority: 'Low', status: 'Pending', estimated_minutes: 15, effort_estimate: 1 }
  ];
  const notes = [];

  const res = analyzeTasksAndNotes(tasks, notes, 'What is my current workload?', 'workload_aware');
  assert.equal(res.mode, 'Workload-aware Mode');
  assert.ok(res.answer.includes('Workload Assessment'));
  assert.ok(res.answer.includes('135 minutes'));
  assert.ok(res.sources.length > 0);
});

test('AI Assistant recommends daily priorities and identifies overdue tasks', () => {
  const tasks = [
    { id: 1, title: 'Past Task', priority: 'High', status: 'Pending', due_date: '2020-01-01' },
    { id: 2, title: 'Future Task', priority: 'Medium', status: 'Pending', due_date: '2099-01-01' }
  ];

  const overdueRes = analyzeTasksAndNotes(tasks, [], 'Show my overdue tasks');
  assert.ok(overdueRes.answer.includes('Past Task'));
  assert.ok(overdueRes.sources.some(s => s.includes('Task #1')));

  const priorityRes = analyzeTasksAndNotes(tasks, [], 'Recommend daily priorities');
  assert.ok(priorityRes.answer.includes('Past Task'));
  assert.ok(priorityRes.answer.includes('Priority Plan'));
});
