const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const all = (s, p = []) =>
  new Promise((r, j) => db.all(s, p, (e, x) => (e ? j(e) : r(x))));

function analyzeTasksAndNotes(tasks, notes, prompt, requestedMode = 'tasks_and_notes') {
  const openTasks = tasks
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => {
      const p = { High: 0, Medium: 1, Low: 2 };
      if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
      const da = a.due_date || '9999-12-31';
      const dbDate = b.due_date || '9999-12-31';
      return da.localeCompare(dbDate);
    });

  const now = new Date();
  const overdueTasks = openTasks.filter(
    (t) => t.due_date && new Date(`${t.due_date}T${t.due_time || '23:59:59'}`) < now
  );

  const upcomingTasks = openTasks.filter(
    (t) => t.due_date && new Date(`${t.due_date}T${t.due_time || '23:59:59'}`) >= now
  );

  const lower = prompt.toLowerCase();
  const sources = [];

  // Workload analysis
  const totalWorkloadMinutes = openTasks.reduce((sum, t) => sum + (t.estimated_minutes || (t.effort_estimate || 3) * 30), 0);
  const totalWorkloadHours = (totalWorkloadMinutes / 60).toFixed(1);

  // 1. Note summarization query
  if (lower.includes('summarize note') || lower.includes('summary of note') || lower.includes('summarize my note') || lower.includes('notes summary')) {
    if (!notes.length) {
      return {
        mode: 'My Tasks & Notes Mode',
        answer: 'You have no saved notes yet. Create a note in the Notes section and I will summarize it for you.',
        sources: []
      };
    }

    const noteSummaries = notes.slice(0, 5).map((n) => {
      sources.push(`Note #${n.id}: “${n.title}”`);
      const snippet = n.notes.length > 180 ? `${n.notes.slice(0, 180)}...` : (n.notes || 'No content');
      return `• **${n.title}** (${n.category || 'General'}): ${snippet}`;
    }).join('\n\n');

    return {
      mode: 'My Tasks & Notes Mode',
      answer: `Here is a summary of your key saved notes:\n\n${noteSummaries}\n\n*Key takeaway: You have ${notes.length} total note(s) captured.*`,
      sources
    };
  }

  // 2. Workload-aware Mode or workload inquiries
  if (requestedMode === 'workload_aware' || lower.includes('workload') || lower.includes('capacity') || lower.includes('how much work') || lower.includes('burnout')) {
    const highCount = openTasks.filter(t => t.priority === 'High').length;
    const medCount = openTasks.filter(t => t.priority === 'Medium').length;
    const lowCount = openTasks.filter(t => t.priority === 'Low').length;

    openTasks.slice(0, 4).forEach(t => sources.push(`Task #${t.id}: “${t.title}”`));

    return {
      mode: 'Workload-aware Mode',
      answer: `📊 **Workload Assessment:**\n- **Total Unfinished Work:** ~${totalWorkloadMinutes} minutes (${totalWorkloadHours} hours) across ${openTasks.length} open task(s).\n- **Urgency Distribution:** ${highCount} High, ${medCount} Medium, ${lowCount} Low priority.\n- **Overdue Items:** ${overdueTasks.length} task(s) currently need immediate attention.\n\n💡 **Capacity Recommendation:** Focus on a maximum of 3 core deliverables today. Start with ${openTasks[0] ? `“${openTasks[0].title}”` : 'your highest priority task'} in a focused 50-minute block.`,
      sources
    };
  }

  // 3. Overdue inquiry
  if (lower.includes('overdue')) {
    if (overdueTasks.length) {
      overdueTasks.forEach(t => sources.push(`Task #${t.id}: “${t.title}”`));
      return {
        mode: 'My Tasks & Notes Mode',
        answer: `⚠️ **You have ${overdueTasks.length} overdue task(s):**\n${overdueTasks.map((t, i) => `${i + 1}. **${t.title}** (due ${t.due_date}${t.due_time ? ' at ' + t.due_time : ''}, ${t.priority} priority)`).join('\n')}\n\n*Action: Complete or reschedule these first to restore momentum.*`,
        sources
      };
    } else {
      return {
        mode: 'My Tasks & Notes Mode',
        answer: '✅ **Great news!** You have zero overdue tasks. Everything is on schedule.',
        sources: []
      };
    }
  }

  // 4. Daily Plan & Priority recommendations
  if (lower.includes('priority') || lower.includes('plan') || lower.includes('today') || lower.includes('recommend') || lower.includes('first')) {
    if (!openTasks.length) {
      return {
        mode: 'My Tasks & Notes Mode',
        answer: 'You have no unfinished tasks. Create a new task to generate an automated daily plan.',
        sources: []
      };
    }

    const topTasks = openTasks.slice(0, 5);
    topTasks.forEach(t => sources.push(`Task #${t.id}: “${t.title}”`));

    return {
      mode: requestedMode === 'workload_aware' ? 'Workload-aware Mode' : 'My Tasks & Notes Mode',
      answer: `🎯 **Recommended Daily Priority Plan:**\n${topTasks.map((t, idx) => {
        const est = t.estimated_minutes ? `${t.estimated_minutes} min` : `Effort ${t.effort_estimate || 3}/5`;
        return `${idx + 1}. **${t.title}** [${t.priority} Priority] — ${est}${t.due_date ? ` (due ${t.due_date})` : ''}`;
      }).join('\n')}\n\n⏱ Total planned time: ~${topTasks.reduce((s, t) => s + (t.estimated_minutes || 45), 0)} mins.\n*Strategy: Work through tasks in single-tasking sprints with 5-minute rest breaks.*`,
      sources
    };
  }

  // 5. Default General Assistance about Tasks & Notes
  const urgent = openTasks[0];
  if (urgent) sources.push(`Task #${urgent.id}: “${urgent.title}”`);
  if (notes.length) sources.push(`Note #${notes[0].id}: “${notes[0].title}”`);

  return {
    mode: 'My Tasks & Notes Mode',
    answer: urgent
      ? `Based on your ${openTasks.length} pending task(s), your highest-impact focus right now is **“${urgent.title}”** (${urgent.priority} priority${urgent.due_date ? `, due ${urgent.due_date}` : ''}).\n\nAsk me anytime to **summarize your notes**, **run a workload assessment**, or **plan your day**!`
      : `You're all caught up on tasks! You have ${notes.length} saved note(s). Ask me if you want a notes summary or to brainstorm next goals.`,
    sources
  };
}

// POST /api/assistant/chat - Interactive AI Chatbot
router.post('/chat', async (req, res) => {
  try {
    const prompt = String(req.body.message || '').trim().slice(0, 2000);
    const mode = String(req.body.mode || 'tasks_and_notes');
    if (!prompt) return res.status(400).json({ error: 'Please enter a question or prompt.' });

    const [tasks, notes] = await Promise.all([
      all('SELECT * FROM tasks WHERE user_id=? ORDER BY due_date ASC', [req.user.id]),
      all('SELECT * FROM resources WHERE user_id=? ORDER BY updated_at DESC', [req.user.id])
    ]);

    const result = analyzeTasksAndNotes(tasks, notes, prompt, mode);

    if (process.env.AI_API_KEY) {
      try {
        const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
        const taskSummary = JSON.stringify(tasks.map(function(t) {
          return { id: t.id, title: t.title, priority: t.priority, status: t.status, due_date: t.due_date, due_time: t.due_time, effort: t.effort_estimate };
        }));
        const noteSummary = JSON.stringify(notes.map(function(n) {
          return { id: n.id, title: n.title, notes: n.notes };
        }));

        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.AI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  "You are TaskMind Assistant. You have two modes: 'My Tasks & Notes Mode' and 'Workload-aware Mode'. Use the provided user tasks and notes to answer questions, prioritize tasks, analyze workload, and summarize notes. At the end of your answer, list 'Sources Used: [Task/Note IDs and titles]' for the data referenced."
              },
              {
                role: 'user',
                content: `Mode: ${mode}\nTasks: ${taskSummary}\nNotes: ${noteSummary}\n\nUser Question: ${prompt}`
              }
            ],
            temperature: 0.3
          })
        });

        if (!response.ok) throw new Error('AI provider request failed');
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || result.answer;

        return res.json({
          mode: mode === 'workload_aware' ? 'Workload-aware Mode (AI)' : 'My Tasks & Notes Mode (AI)',
          answer: content,
          sources: result.sources
        });
      } catch (e) {
        return res.json({
          ...result,
          notice: 'AI API unavailable; using intelligent local task & note engine.'
        });
      }
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Assistant could not process that request: ' + e.message });
  }
});

module.exports = router;
module.exports.analyzeTasksAndNotes = analyzeTasksAndNotes;
