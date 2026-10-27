const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const { db } = require('../database/db');
const { sendMail, configured } = require('../services/emailService');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait and try again.' } });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many OTP requests. Please wait before trying again.' } });
const emailValid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(err){err?reject(err):resolve({id:this.lastID,changes:this.changes})}));
const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)));
const cleanUser = u => ({ id:u.id, name:u.name, email:u.email });
router.post('/signup', authLimiter, async (req,res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    if (name.length < 2 || name.length > 100) return res.status(400).json({error:'Name must be between 2 and 100 characters.'});
    if (!emailValid(email)) return res.status(400).json({error:'Enter a valid email address.'});
    if (password.length < 8 || password.length > 128) return res.status(400).json({error:'Password must be at least 8 characters.'});
    if (password !== confirmPassword) return res.status(400).json({error:'Passwords do not match.'});
    if (await get('SELECT id FROM users WHERE email=?',[email])) return res.status(409).json({error:'An account with this email already exists.'});
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await run('INSERT INTO users(name,email,password_hash,email_verified) VALUES(?,?,?,1)',[name,email,passwordHash]);
    const user = {id:result.id,name,email};
    req.session.regenerate(err => {
      if (err) return res.status(500).json({error:'Could not start a secure session.'});
      req.login(user, e => e ? res.status(500).json({error:'Account created, but sign-in failed. Please sign in.'}) : res.status(201).json({message:'Account created successfully.',user:cleanUser(user)}));
    });
  } catch(e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({error:'An account with this email already exists.'});
    res.status(500).json({error:'Could not create account. Please try again.'});
  }
});
router.post('/login', authLimiter, async (req,res) => {
  try {
    const identity=String(req.body.identity||'').trim().toLowerCase(), password=String(req.body.password||'');
    if (!identity || !password) return res.status(400).json({error:'Enter your email and password.'});
    const user=await get('SELECT * FROM users WHERE email=?',[identity]);
    if (!user || !user.password_hash || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Invalid email or password.'});
    req.session.regenerate(err=>{ if(err) return res.status(500).json({error:'Could not start session.'}); req.login(user,e=>e?res.status(500).json({error:'Login failed.'}):res.json({user:cleanUser(user)})); });
  } catch(e){res.status(500).json({error:'Login failed.'});}
});
router.post('/logout',(req,res)=>req.logout(err=>{if(err)return res.status(500).json({error:'Logout failed.'});req.session.destroy(()=>res.clearCookie('connect.sid').json({message:'Signed out.'}));}));
router.post('/forgot-password', authLimiter, async (req,res)=>{
  try {
    const email=String(req.body.email||'').trim().toLowerCase();
    if(!emailValid(email))return res.status(400).json({error:'Enter a valid email address.'});
    const user=await get('SELECT id,email,password_hash FROM users WHERE email=?',[email]);
    // Always use a generic response to reduce account enumeration.
    if(user && configured() && user.password_hash) {
      const token=crypto.randomBytes(32).toString('hex'), hash=crypto.createHash('sha256').update(token).digest('hex');
      await run('DELETE FROM password_resets WHERE user_id=?',[user.id]);
      await run('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)',[user.id,hash,Date.now()+15*60*1000]);
      const url=`${process.env.APP_BASE_URL||'http://localhost:3010'}/?reset=${token}`;
      await sendMail({to:email,subject:'Reset your taskaro password',text:`Use this link within 15 minutes to reset your password: ${url}`});
    }
    res.json({message:'If an eligible account exists, password reset instructions have been sent.'});
  }catch(e){res.status(503).json({error:'Could not send reset email. Check SMTP configuration.'});}
});
router.post('/reset-password', authLimiter, async (req,res)=>{
  try {
    const token=String(req.body.token||''), password=String(req.body.password||'');
    if(!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({error:'Invalid or expired reset link.'});
    if(password.length<8||password.length>128)return res.status(400).json({error:'Password must be at least 8 characters.'});
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    const record=await get('SELECT * FROM password_resets WHERE token_hash=?',[hash]);
    if(!record||record.expires_at<Date.now())return res.status(400).json({error:'Invalid or expired reset link.'});
    await run('UPDATE users SET password_hash=? WHERE id=?',[await bcrypt.hash(password,12),record.user_id]);
    await run('DELETE FROM password_resets WHERE user_id=?',[record.user_id]);
    res.json({message:'Password updated. You can now sign in.'});
  }catch(e){res.status(500).json({error:'Could not reset password.'});}
});
router.get('/google', (req,res,next)=>{
  if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return res.status(503).send('Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.');
  passport.authenticate('google',{scope:['profile','email'],prompt:'select_account'})(req,res,next);
});
router.get('/google/callback',(req,res,next)=>{
  passport.authenticate('google',{failureRedirect:'/?authError=google'})(req,res,err=>{
    if(err)return next(err); req.session.save(()=>res.redirect('/'));
  });
});
module.exports=router;
