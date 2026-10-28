const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { occursOnDate } = require('./plans');

router.use(requireAuth);

const all = (s, p = []) =>
  new Promise((r, j) => db.all(s, p, (e, x) => (e ? j(e) : r(x))));

const get = (s, p = []) =>
  new Promise((r, j) => db.get(s, p, (e, x) => (e ? j(e) : r(x))));

function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// Comprehensive intelligent process & context engine (offline AI fallback)
function intelligentProcessEngine({ user, tasks = [], plans = [], skipDays = [], routineLogs = [] }, prompt) {
  const pLower = prompt.toLowerCase().trim();
  const today = new Date();
  const todayISO = toLocalISO(today);
  const currentMinutes = today.getHours() * 60 + today.getMinutes();
  const userName = user?.name ? user.name.split(' ')[0] : 'friend';

  // Routine & timetable context
  const isSkipToday = skipDays.some((s) => s.date === todayISO);
  const skipReason = skipDays.find((s) => s.date === todayISO)?.reason || 'Rest Day';

  const todayPlans = plans.filter((plan) => occursOnDate(plan, todayISO));
  const logMap = new Map(routineLogs.map((l) => [l.plan_id, l.status]));

  // Find next upcoming routine slot today
  let nextRoutine = null;
  let currentRoutine = null;
  for (const pl of todayPlans) {
    const [sh, sm] = pl.start_time.split(':').map(Number);
    const [eh, em] = pl.end_time.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    if (currentMinutes >= startMins && currentMinutes <= endMins) {
      currentRoutine = pl;
      break;
    } else if (currentMinutes < startMins && (!nextRoutine || startMins < nextRoutine.startMins)) {
      nextRoutine = { ...pl, startMins };
    }
  }

  // Tasks context
  const openTasks = tasks.filter((t) => t.status !== 'Completed');
  const completedTasks = tasks.filter((t) => t.status === 'Completed');
  const overdueTasks = openTasks.filter(
    (t) => t.due_date && new Date(t.due_date + 'T23:59:59') < today
  );
  const highPriority = openTasks.filter((t) => t.priority === 'High');

  // Check if user is asking for a Process / Step-by-Step Roadmap / How-To
  const isProcessQuery = [
    'process',
    'kaise',
    'step',
    'how to',
    'how do',
    'roadmap',
    'tarika',
    'strategy',
    'guide',
    'steps',
    'path',
    'kaise kare',
    'break down'
  ].some((k) => pLower.includes(k));

  if (isProcessQuery) {
    // Topic detection
    let topic = 'your goal';
    let steps = [];

    if (
      pLower.includes('dsa') ||
      pLower.includes('data structure') ||
      pLower.includes('algorithm') ||
      pLower.includes('leetcode')
    ) {
      topic = 'Mastering DSA (Data Structures & Algorithms)';
      steps = [
        {
          title: 'Pick One Primary Language',
          desc: 'Stick firmly to C++, Java, or Python. Master standard library methods (STL / Collections).'
        },
        {
          title: 'Core Linear Structures',
          desc: 'Master Arrays, Strings, HashMaps, and Two-Pointers. Solve 20–25 easy/medium problems.'
        },
        {
          title: 'Essential Non-Linear Structures',
          desc: 'Study Binary Trees, BSTs, Heaps, and Recursion/Backtracking patterns.'
        },
        {
          title: 'Advanced Algorithms & DP',
          desc: 'Learn Dynamic Programming (1D & 2D tables) and Graph BFS/DFS traversal.'
        },
        {
          title: 'Time Table Integration in Taskaro',
          desc: 'Dedicate your scheduled DSA routine slot (09:00–10:30) in Taskaro every day to solve 2 problems consistently!'
        }
      ];
    } else if (
      pLower.includes('exam') ||
      pLower.includes('study') ||
      pLower.includes('revision') ||
      pLower.includes('pariksha')
    ) {
      topic = 'Exam Preparation & High-Retention Revision';
      steps = [
        {
          title: 'Syllabus & Weightage Audit',
          desc: 'List all chapters and mark High-Weightage topics as High Priority tasks in Taskaro.'
        },
        {
          title: 'Active Recall & Feynman Technique',
          desc: 'Instead of passive reading, test yourself with closed-book summaries and teaching concepts aloud.'
        },
        {
          title: '50/10 Pomodoro Work Blocks',
          desc: 'Study in 50-minute deep focus sprints followed by a strict 10-minute mental break.'
        },
        {
          title: 'Past 5 Years Question Papers (PYQs)',
          desc: 'Solve actual previous exam papers in timed conditions to calibrate speed and accuracy.'
        },
        {
          title: 'Rest & Recovery Before Exam Day',
          desc: 'Use Taskaro’s Rest/Skip Day to recharge your mind the evening before the exam. Adequate sleep cements memory.'
        }
      ];
    } else if (
      pLower.includes('project') ||
      pLower.includes('web') ||
      pLower.includes('app') ||
      pLower.includes('fullstack')
    ) {
      topic = 'Building & Delivering a Successful Software Project';
      steps = [
        {
          title: 'Scope & Requirement Definition',
          desc: 'Define exactly what problem the app solves. Break it into 3–5 core user flows.'
        },
        {
          title: 'Database & Schema Architecture',
          desc: 'Design your data tables and relationships cleanly before writing frontend UI.'
        },
        {
          title: 'Iterative Core Implementation',
          desc: 'Build the minimal working feature first (CRUD, authentication, primary view).'
        },
        {
          title: 'Error Handling & Edge Cases',
          desc: 'Validate all inputs, add responsive mobile layout, and test thoroughly.'
        },
        {
          title: 'Deployment & CI/CD Verification',
          desc: 'Push to GitHub and deploy to Render or cloud host. Document your API in Taskaro Notes with screenshots!'
        }
      ];
    } else if (
      pLower.includes('communication') ||
      pLower.includes('english') ||
      pLower.includes('speak') ||
      pLower.includes('interview')
    ) {
      topic = 'Enhancing Communication & Interview Confidence';
      steps = [
        {
          title: 'Daily 15-Minute Read Aloud',
          desc: 'Read quality editorials or tech blogs aloud to improve pronunciation and fluency.'
        },
        {
          title: 'STAR Framework for Explanations',
          desc: 'Structure answers using: Situation, Task, Action, and Measurable Result.'
        },
        {
          title: 'Mirror or Audio Recording',
          desc: 'Record yourself explaining a project for 2 minutes, then review pace and clarity.'
        },
        {
          title: 'Active Listening & Pausing',
          desc: 'Take a 2-second pause before answering questions. Structured silence signals clarity and calm.'
        },
        {
          title: 'Daily Slot Practice in Taskaro',
          desc: 'Dedicate your 21:00–22:30 Communication slot in Taskaro every day to review and speak.'
        }
      ];
    } else if (
      pLower.includes('running') ||
      pLower.includes('fitness') ||
      pLower.includes('health') ||
      pLower.includes('workout')
    ) {
      topic = 'Sustainable Fitness & Habit Routine';
      steps = [
        {
          title: 'Night Before Preparation',
          desc: 'Keep shoes and workout gear ready by your bed to remove morning friction.'
        },
        {
          title: 'Dynamic Warmup (5 Mins)',
          desc: 'Leg swings, ankle rotations, and gentle jogging to avoid shin splints.'
        },
        {
          title: 'Couch-to-5K Interval Pace',
          desc: 'Alternate 3 minutes jogging with 2 minutes brisk walking. Build aerobic base first.'
        },
        {
          title: 'Post-Workout Hydration & Protein',
          desc: 'Hydrate well and stretch hamstrings and calves.'
        },
        {
          title: 'Streak Protection in Taskaro',
          desc: 'Mark your morning Running slot complete in Taskaro. Use Rest Days when muscles need recovery!'
        }
      ];
    } else {
      topic = prompt.length > 50 ? prompt.slice(0, 50) + '…' : prompt;
      steps = [
        {
          title: 'Clarify the Core Objective',
          desc: 'Define the exact deliverable or milestone you want to reach. Avoid vague goals.'
        },
        {
          title: 'Break into Atomic Steps',
          desc: 'Split the work into 20–45 minute actionable tasks. Log them into Taskaro My Tasks.'
        },
        {
          title: 'Remove Environmental Friction',
          desc: 'Put phone on silent, close unrelated tabs, and prepare your workspace.'
        },
        {
          title: 'Execute First Iteration Fast',
          desc: 'Do not aim for perfection initially. Complete a rough draft or prototype first.'
        },
        {
          title: 'Review & Schedule Next Sprint',
          desc: 'Inspect what worked, fix gaps, and schedule the next slot in your Time Table.'
        }
      ];
    }

    let out = `🚀 **Step-by-Step Action Process: ${topic}**\n\n`;
    steps.forEach((st, i) => {
      out += `**Step ${i + 1}: ${st.title}**\n${st.desc}\n\n`;
    });
    out += `🎯 *Next Step:* Would you like me to help you schedule these action steps into your Taskaro daily routine or tasks?`;

    return { mode: 'Taskaro Process Engine', answer: out };
  }

  // ==========================================
  // INTENT 1: ROUTINE & TIMETABLE QUERIES
  // ==========================================
  const routineKeywords = [
    'routine',
    'timetable',
    'time table',
    'schedule',
    'timing',
    'slot',
    'daily',
    'kab hai',
    'aaj kya hai',
    'kya karna hai',
    'time set',
    'timeset',
    'habit'
  ];
  const mentionsSpecificRoutine = plans.some((p) => pLower.includes(p.name.toLowerCase()));

  if (routineKeywords.some((k) => pLower.includes(k)) || mentionsSpecificRoutine) {
    let out = `⏱️ **Your Time Table & Daily Routine Overview**\n\n`;

    if (isSkipToday) {
      out += `🌴 **Rest / Skip Day Active Today:**\nReason: *${skipReason}*\nYour daily routine requirements are paused today so your consistency streaks remain 100% protected! Take time to rest and recharge.\n\n`;
    }

    if (todayPlans.length > 0) {
      out += `📅 **Scheduled for Today (${today.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      })}):**\n`;
      todayPlans.forEach((pl, idx) => {
        const status = logMap.get(pl.id);
        const icon = status === 'completed' ? '✓ [Done]' : status === 'skipped' ? '⊘ [Skipped]' : '⏱ [Pending]';
        out += `${idx + 1}. **${pl.name}** (${pl.start_time} – ${pl.end_time}) — *${pl.category || 'General'}* ${icon}\n`;
        if (pl.notes) out += `   🎯 Goal: ${pl.notes}\n`;
      });

      if (currentRoutine) {
        out += `\n🔴 **Active Right Now:** “${currentRoutine.name}” (${currentRoutine.start_time}–${currentRoutine.end_time}). Stay focused on this session!`;
      } else if (nextRoutine) {
        out += `\n⏳ **Up Next:** “${nextRoutine.name}” starts at **${nextRoutine.start_time}** (${nextRoutine.start_time}–${nextRoutine.end_time}).`;
      }
    } else if (plans.length > 0) {
      out += `You have **${plans.length} configured routine slots**, but none are scheduled specifically for today (${today.toLocaleDateString(undefined, { weekday: 'long' })}).\n\n**Your configured slots:**\n`;
      plans.forEach((pl, i) => {
        out += `${i + 1}. **${pl.name}** (${pl.start_time}–${pl.end_time}) — Repeat: *${pl.repeat}*\n`;
      });
    } else {
      out += `You don't have any routine slots in your time table yet.\n👉 Click **“Time Table”** in the sidebar or bottom bar and tap **“＋ Add Routine”** to set daily study, workout, or habit blocks!`;
    }

    out += `\n\n💡 *Pro-Tip: Click the circular tick mark in the Time Table to mark slots complete and boost your 7-Day Performance score!*`;
    return { mode: 'Taskaro Smart Engine', answer: out };
  }

  // ==========================================
  // INTENT 2: TASKS, LATEST WORK & DEADLINES
  // ==========================================
  const taskKeywords = [
    'task',
    'latest',
    'pending',
    'assignment',
    'project',
    'overdue',
    'urgent',
    'kya bacha',
    'work',
    'priority',
    'list'
  ];
  if (taskKeywords.some((k) => pLower.includes(k))) {
    let out = `📋 **Your Current Tasks & Priority Status**\n\n`;

    if (overdueTasks.length > 0) {
      out += `⚠️ **Overdue Tasks (${overdueTasks.length}):**\n`;
      overdueTasks.forEach((t) => {
        out += `• **${t.title}** (Due: ${t.due_date || 'Past'} | Priority: ${t.priority})\n`;
      });
      out += `*Action: Tackle the quickest overdue task first or reschedule its deadline.*\n\n`;
    }

    if (openTasks.length > 0) {
      out += `🎯 **Latest Unfinished Tasks (${openTasks.length}):**\n`;
      openTasks.slice(0, 6).forEach((t, i) => {
        const badge = t.status === 'In Progress' ? '⚡ In Progress' : '⏳ Pending';
        out += `${i + 1}. **${t.title}** [${t.priority}] — ${badge}${t.due_date ? ` (Due: ${t.due_date})` : ''}\n`;
      });

      const topTask = highPriority[0] || openTasks[0];
      out += `\n🌟 **Recommended Immediate Focus:**\nStart with **“${topTask.title}”**. Dedicate a single 25-minute Pomodoro session with zero distractions.`;
    } else {
      out += `🎉 **All caught up!** You have no unfinished tasks right now.\n${
        completedTasks.length > 0 ? `You have already completed ${completedTasks.length} task(s)! Great job!` : ''
      }\nTap **“＋ New task”** to plan your next milestone.`;
    }

    return { mode: 'Taskaro Smart Engine', answer: out };
  }

  // ==========================================
  // INTENT 4: GREETINGS & PERSONALIZED CHAT
  // ==========================================
  const greetKeywords = ['hi', 'hello', 'hey', 'namaste', 'kaise ho', 'sup', 'good morning', 'good evening'];
  if (greetKeywords.some((k) => pLower === k || pLower.startsWith(k + ' '))) {
    const greetingTime =
      today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';

    let out = `👋 **${greetingTime}, ${userName}!**\n\nI am your **Taskaro Intelligent Partner**. Here is where you stand right now:\n`;
    out += `• **Tasks:** ${openTasks.length} active (${highPriority.length} high priority)\n`;
    out += `• **Today's Routine:** ${todayPlans.length} slot(s) scheduled\n`;

    if (currentRoutine) {
      out += `• **Active Slot Now:** ${currentRoutine.name} (${currentRoutine.start_time}–${currentRoutine.end_time})\n`;
    } else if (nextRoutine) {
      out += `• **Next Routine:** ${nextRoutine.name} at ${nextRoutine.start_time}\n`;
    }

    out += `\n**What would you like to do?**\n`;
    out += `1. Ask *“Mera routine batao”* to review your day's schedule\n`;
    out += `2. Ask *“Latest tasks”* to check pending deadlines\n`;
    out += `3. Ask *“How to prepare [topic] step by step?”* for a custom action roadmap\n`;
    out += `4. Or ask me any question about your work or learning!`;

    return { mode: 'Taskaro Smart Engine', answer: out };
  }

  // ==========================================
  // INTENT 5: GENERAL PRODUCTIVITY & ADVICE
  // ==========================================
  let answer = `💡 **Taskaro Intelligent Analysis for:** “${prompt}”\n\n`;
  answer += `Here is how you can approach this systematically:\n\n`;
  answer += `1. **Target the Next Action:** Identify the immediate, single next physical action needed to move forward.\n`;
  answer += `2. **Time-Box It:** Allocate a dedicated 30-minute block on your calendar or Taskaro Time Table.\n`;
  answer += `3. **Track Against Context:** You currently have **${openTasks.length} open tasks** (Top priority: *“${
    openTasks[0]?.title || 'None'
  }”*). Balance this new idea with your existing commitments.\n`;
  answer += `4. **Log Notes & Learnings:** Save any links, screenshots, or reference materials into Taskaro **Notes** with attachments so they are never lost.\n\n`;
  answer += `Feel free to ask for a specific step-by-step roadmap or ask about your tasks or routine!`;

  return { mode: 'Taskaro Smart Engine', answer };
}

// Call Google Gemini API if configured
async function callGemini(apiKey, systemInstruction, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1000
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini API returned an empty response.');
  return text;
}

// Call OpenAI-compatible API if configured
async function callOpenAI(apiKey, baseUrl, model, systemInstruction, userPrompt) {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI API returned empty content.');
  return text;
}

router.post('/chat', async (req, res) => {
  try {
    const prompt = String(req.body.message || '').trim().slice(0, 3000);
    if (!prompt) return res.status(400).json({ error: 'Please enter a message or question.' });

    const todayISO = toLocalISO(new Date());

    // Fetch full live user workspace context
    const [tasks, plans, skipDays, routineLogs] = await Promise.all([
      all(
        'SELECT id,title,description,due_date,priority,status,category,estimated_minutes,created_at FROM tasks WHERE user_id=? ORDER BY id DESC',
        [req.user.id]
      ),
      all('SELECT id,name,category,date,start_time,end_time,repeat,notes FROM plans WHERE user_id=? ORDER BY start_time ASC', [
        req.user.id
      ]),
      all('SELECT date,reason FROM skip_days WHERE user_id=?', [req.user.id]),
      all('SELECT plan_id,status FROM routine_logs WHERE user_id=? AND date=?', [req.user.id, todayISO])
    ]);

    const context = {
      user: req.user,
      tasks,
      plans,
      skipDays,
      routineLogs
    };

    // 1. Check for Gemini API key
    const geminiKey = process.env.GEMINI_API_KEY || (process.env.AI_BASE_URL?.includes('generativelanguage') ? process.env.AI_API_KEY : null);
    if (geminiKey) {
      try {
        const sysPrompt = `You are Taskaro Assistant, an intelligent productivity and planning partner.
User Info: Name: "${req.user.name}", Today's Date: "${todayISO}".
Active User Tasks: ${JSON.stringify(tasks.slice(0, 15))}
Configured Routine Timetable Slots: ${JSON.stringify(plans)}
Skip/Rest Days: ${JSON.stringify(skipDays)}

Instructions:
- When the user asks about routine, timetable, or schedule, use their exact configured routine slots and timings.
- When the user asks about tasks, priorities, or work, refer directly to their real tasks.
- When the user asks how to do something, prepare for an exam, learn a skill, or build a project, explain a clear, structured, step-by-step process/roadmap.
- If the user talks in Hindi or Hinglish, answer in polite, clear Hinglish.
- Keep answers practical, motivating, and actionable. Avoid repetitive boilerplate.`;

        const answer = await callGemini(geminiKey, sysPrompt, prompt);
        return res.json({ mode: 'Gemini AI', answer });
      } catch (err) {
        console.warn('Gemini API call failed, falling back to smart engine:', err.message);
      }
    }

    // 2. Check for OpenAI-compatible API key
    if (process.env.AI_API_KEY) {
      try {
        const sysPrompt = `You are Taskaro Assistant, an intelligent productivity and planning partner.
User Info: Name: "${req.user.name}", Today's Date: "${todayISO}".
Active User Tasks: ${JSON.stringify(tasks.slice(0, 15))}
Configured Routine Timetable Slots: ${JSON.stringify(plans)}
Skip/Rest Days: ${JSON.stringify(skipDays)}

Instructions:
- Use exact user tasks and routine slots when asked about their schedule or tasks.
- If asked "how to" or for a process, provide a clear, structured step-by-step roadmap.
- Reply in helpful Hinglish if asked in Hindi/Hinglish.`;

        const answer = await callOpenAI(
          process.env.AI_API_KEY,
          process.env.AI_BASE_URL,
          process.env.AI_MODEL,
          sysPrompt,
          prompt
        );
        return res.json({ mode: 'AI API', answer });
      } catch (err) {
        console.warn('AI API call failed, falling back to smart engine:', err.message);
      }
    }

    // 3. Fallback to our intelligent offline process & context engine
    const result = intelligentProcessEngine(context, prompt);
    res.json(result);
  } catch (e) {
    console.error('Assistant error:', e);
    res.status(500).json({ error: 'Assistant could not process that request.' });
  }
});

module.exports = router;
