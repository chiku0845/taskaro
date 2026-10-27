const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const all = (s, p = []) =>
  new Promise((r, j) => db.all(s, p, (e, x) => (e ? j(e) : r(x))));

function fallback(tasks, prompt) {
  const open = tasks
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => {
      const p = { High: 0, Medium: 1, Low: 2 };
      if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
      const da = a.due_date || '9999-12-31';
      const dbDate = b.due_date || '9999-12-31';
      return da.localeCompare(dbDate);
    });

  const overdue = open.filter(
    (t) => t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
  );
  const urgent = open[0];
  const lower = prompt.toLowerCase();

  if (lower.includes('break') || lower.includes('subtask') || lower.includes('split')) {
    return {
      mode: 'rule-based fallback',
      answer: urgent
        ? `For “${urgent.title}”, try these steps:\n1. Define the expected outcome.\n2. Gather notes, materials, and dependencies.\n3. Complete the smallest first deliverable.\n4. Review the result and fix gaps.\n5. Submit or mark complete.`
        : 'Add a task first, then I can suggest steps for it.'
    };
  }

  if (lower.includes('overdue')) {
    return {
      mode: 'rule-based fallback',
      answer: overdue.length
        ? `You have ${overdue.length} overdue unfinished task(s): ${overdue
            .map((t) => t.title)
            .join(
              ', '
            )}. Review deadlines and either finish the smallest urgent item or update the due date.`
        : 'Good news: no overdue unfinished tasks were found.'
    };
  }

  if (lower.includes('plan') || lower.includes('today') || lower.includes('daily')) {
    return {
      mode: 'rule-based fallback',
      answer: open.length
        ? `Suggested plan:\n${open
            .slice(0, 5)
            .map(
              (t, i) =>
                `${i + 1}. ${t.title} (${t.priority} priority${t.due_date ? `, due ${t.due_date}` : ''})`
            )
            .join(
              '\n'
            )}\n\nStart with the first task, work in 25–50 minute blocks, and leave a short review break between tasks.`
        : 'No unfinished tasks yet. Add tasks to build a daily plan.'
    };
  }

  return {
    mode: 'rule-based fallback',
    answer: urgent
      ? `Recommended next task: “${urgent.title}” (${urgent.priority} priority${
          urgent.due_date ? `, due ${urgent.due_date}` : ''
        }). ${
          overdue.some((t) => t.id === urgent.id)
            ? 'It is overdue, so review it first.'
            : 'Start with a small, clearly defined action and reassess after one work block.'
        }`
      : 'You have no unfinished tasks. Add a task and I can help prioritize it.'
  };
}

router.post('/chat', async (req, res) => {
  try {
    const prompt = String(req.body.message || '').trim().slice(0, 2000);
    if (!prompt) return res.status(400).json({ error: 'Write a question first.' });

    const tasks = await all(
      'SELECT id,title,description,due_date,priority,status,category,estimated_minutes FROM tasks WHERE user_id=? ORDER BY due_date',
      [req.user.id]
    );

    if (process.env.AI_API_KEY) {
      try {
        const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
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
                  'You are taskaro assistant. Use only the provided user task data for claims about tasks. Give practical, concise prioritization and planning advice. Do not expose data outside this request.'
              },
              {
                role: 'user',
                content: `User tasks (private context): ${JSON.stringify(tasks)}\n\nRequest: ${prompt}`
              }
            ],
            temperature: 0.4
          })
        });

        if (!response.ok) throw new Error('AI provider request failed');
        const data = await response.json();
        return res.json({
          mode: 'AI API',
          answer: data.choices?.[0]?.message?.content || 'The AI provider returned no answer.'
        });
      } catch (e) {
        return res.json({
          ...fallback(tasks, prompt),
          notice: 'AI API failed or was unavailable; using the rule-based fallback.'
        });
      }
    }

    res.json(fallback(tasks, prompt));
  } catch (e) {
    res.status(500).json({ error: 'Assistant could not process that request.' });
  }
});

module.exports = router;
