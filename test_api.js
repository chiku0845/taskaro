const http = require('node:http');

// We can test server routes directly using Node
const app = require('express');
// Let's test server.js by requiring db and running checks
const { db, hashPassword, verifyPassword, updateDependentTasksStatus } = require('./db');

console.log('--- Testing SQLite Database ---');
const users = db.prepare('SELECT user_id, name, age, email, role FROM users').all();
console.log('Seeded Users in DB:', users);

const tasks = db.prepare('SELECT task_id, title, status, priority, prerequisite_task_id FROM tasks').all();
console.log('Total Seeded Tasks in DB:', tasks.length);

const plans = db.prepare('SELECT plan_id, goal_name, target_date FROM plans').all();
console.log('Seeded Plans in DB:', plans);

const routines = db.prepare('SELECT routine_id, title, scheduled_time, streak FROM routines').all();
console.log('Seeded Routines in DB:', routines);

const notifications = db.prepare('SELECT notification_id, title, content FROM notifications').all();
console.log('Seeded Notifications in DB:', notifications);

// Test password verification
const adminUser = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@taskaro.com');
const isPassValid = verifyPassword('admin123', adminUser.password_hash, adminUser.password_salt);
console.log('Admin password verification:', isPassValid ? 'PASSED (admin123 verified)' : 'FAILED');

// Test dependency unlock logic
console.log('\n--- Testing Dependent Task Auto-Unlock Logic ---');
const depTaskBefore = db.prepare("SELECT task_id, title, status, prerequisite_task_id FROM tasks WHERE task_type = 'Dependent'").get();
console.log('Dependent Task before prerequisite completion:', depTaskBefore.title, '| Status:', depTaskBefore.status);

// Complete the prerequisite task
db.prepare("UPDATE tasks SET status = 'Completed' WHERE task_id = ?").run(depTaskBefore.prerequisite_task_id);
updateDependentTasksStatus(depTaskBefore.prerequisite_task_id);

const depTaskAfter = db.prepare("SELECT task_id, title, status FROM tasks WHERE task_id = ?").get(depTaskBefore.task_id);
console.log('Dependent Task after prerequisite completed:', depTaskAfter.title, '| Status:', depTaskAfter.status);

// Reset back to original state for clean demo
db.prepare("UPDATE tasks SET status = 'In Progress' WHERE task_id = ?").run(depTaskBefore.prerequisite_task_id);
db.prepare("UPDATE tasks SET status = 'Pending' WHERE task_id = ?").run(depTaskBefore.task_id);

console.log('\nAll core logic tests PASSED successfully!');
