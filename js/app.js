/* ---------------- state ---------------- */
let profile = null;
let documents = [];
let reminders = [];
let habits = { water: false, sleep: false, steps: false, meal: false, stretch: false, screen: false };
let waterState = { date: null, count: 0 };
let sleepLog = [];
let weightLog = [];
let moodLog = [];
let gymLogs = [];
let gymPRs = [];
let docFilter = { search: '', category: 'all', sort: 'newest' };
let timerState = { remaining: 0, total: 0, running: false, handle: null };

const HEALTH_TIPS = [
  "A short walk after meals measurably improves blood sugar response compared with sitting.",
  "Consistent sleep and wake times matter as much as total hours for how rested you feel.",
  "Spreading protein across meals, rather than loading it at dinner, supports muscle maintenance better.",
  "Most people underestimate added sugar from drinks — check labels on anything you sip through the day.",
  "Ten minutes of morning daylight helps regulate your body clock more than screens can.",
  "Hydration needs rise noticeably with heat, altitude, and exercise — not just body weight."
];

/* ---------------- storage helpers ---------------- */
async function storeGet(key) {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : null;
  } catch (e) { return null; }
}
async function storeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) { console.error('storage set failed', e); return false; }
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
function speak(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------------- calculations ---------------- */
function calcBMI(weight, heightCm) { const h = heightCm / 100; return +(weight / (h * h)).toFixed(1); }
function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: '#e2a545' };
  if (bmi < 25) return { label: 'Normal range', color: '#3ecf9a' };
  if (bmi < 30) return { label: 'Overweight', color: '#e2a545' };
  return { label: 'Obese range', color: '#d9695f' };
}
function idealWeightRange(heightCm) {
  const h = heightCm / 100;
  return [Math.round(18.5 * h * h), Math.round(24.9 * h * h)];
}
function calcBMR(p) {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}
function calcTDEE(bmr) { return Math.round(bmr * 1.375); }
function waterTargetGlasses(weight) { return Math.ceil((weight * 0.035 * 1000) / 250); }

/* ---------------- login ---------------- */
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  profile = {
    name: document.getElementById('f-name').value.trim(),
    age: +document.getElementById('f-age').value,
    sex: document.getElementById('f-sex').value,
    height: +document.getElementById('f-height').value,
    weight: +document.getElementById('f-weight').value
  };
  await storeSet('profile', profile);
  weightLog = [{ date: todayStr(), weight: profile.weight }];
  await storeSet('weight-log', weightLog);
  enterDashboard();
});

async function tryAutoLogin() {
  const p = await storeGet('profile');
  if (p) { profile = p; enterDashboard(); }
}

function enterDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  const dash = document.getElementById('dashboard');
  dash.style.display = 'block';
  const bmi = calcBMI(profile.weight, profile.height);
  document.getElementById('greeting-name').textContent = 'Welcome, ' + profile.name.split(' ')[0];
  document.getElementById('v-bmi').textContent = bmi;
  document.getElementById('v-age').textContent = profile.age;
  document.getElementById('v-weight').textContent = profile.weight + ' kg';
}

document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', () => openModule(card.dataset.module));
});

/* ---------------- overlay control ---------------- */
async function openModule(name) {
  const overlay = document.getElementById('overlay');
  const inner = document.getElementById('overlay-inner');
  overlay.style.display = 'block';
  window.scrollTo(0, 0);

  if (name === 'health') {
    waterState = (await storeGet('water-state')) || { date: todayStr(), count: 0 };
    if (waterState.date !== todayStr()) waterState = { date: todayStr(), count: 0 };
    sleepLog = (await storeGet('sleep-log')) || [];
    weightLog = (await storeGet('weight-log')) || [{ date: todayStr(), weight: profile.weight }];
    moodLog = (await storeGet('mood-log')) || [];
    inner.innerHTML = renderHealth();
  }
  if (name === 'gym') {
    gymLogs = (await storeGet('gym-logs')) || [];
    gymPRs = (await storeGet('gym-prs')) || [];
    inner.innerHTML = renderGymShell();
  }
  if (name === 'documents') { documents = (await storeGet('documents')) || []; inner.innerHTML = renderDocuments(); }
  if (name === 'alarm') { reminders = (await storeGet('reminders')) || []; inner.innerHTML = renderReminders(); }

  document.getElementById('back-btn')?.addEventListener('click', closeModule);
  wireModuleEvents(name);
}
function closeModule() {
  document.getElementById('overlay').style.display = 'none';
  window.speechSynthesis.cancel();
}
function overlayHead(title, colorAccent, colorDim, iconSvg) {
  return `<div class="overlay-head">
    <button class="back-btn" id="back-btn">&larr;</button>
    <div class="icon-wrap" style="background:${colorDim}; color:${colorAccent};">${iconSvg}</div>
    <h2>${title}</h2>
  </div>`;
}
function switchTab(scopeSel, idx) {
  document.querySelectorAll(scopeSel + ' .tab-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  document.querySelectorAll(scopeSel + ' .tab-content').forEach((c, i) => c.classList.toggle('active', i === idx));
}

/* ================= HEALTH MODULE ================= */
function renderHealth() {
  const bmi = calcBMI(profile.weight, profile.height);
  const cat = bmiCategory(bmi);
  const bmr = calcBMR(profile);
  const tdee = calcTDEE(bmr);
  const waterTarget = waterTargetGlasses(profile.weight);
  const idealRange = idealWeightRange(profile.height);
  const tip = HEALTH_TIPS[new Date().getDate() % HEALTH_TIPS.length];

  const habitList = [
    { k: 'water', label: `Drink ${waterTarget} glasses of water`, freq: 'Daily' },
    { k: 'sleep', label: 'Sleep 7–9 hours', freq: 'Daily' },
    { k: 'steps', label: 'Walk at least 7,000 steps', freq: 'Daily' },
    { k: 'meal', label: 'Eat a protein source with each meal', freq: 'Daily' },
    { k: 'stretch', label: 'Stretch or mobility work', freq: 'Daily' },
    { k: 'screen', label: 'Screen-free hour before bed', freq: 'Daily' },
  ];

  return overlayHead('Health unit', '#3ecf9a', '#173029',
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6c-1.6-1.6-4.2-1.6-5.8 0L12 7.6l-3-3c-1.6-1.6-4.2-1.6-5.8 0-1.6 1.6-1.6 4.2 0 5.8L12 19l8.8-8.6c1.6-1.6 1.6-4.2 0-5.8z"></path></svg>`)
    + `
  <div class="tab-row" id="health-tabs">
    <button class="tab-btn active">Overview</button>
    <button class="tab-btn">Trackers</button>
    <button class="tab-btn">Mood log</button>
  </div>

  <div class="tab-content active">
    <div class="section-block">
      <h4>Your vitals, from the profile you entered</h4>
      <div class="stat-row">
        <div class="stat-box"><div class="num">${bmi}</div><div class="lbl">Body mass index</div>
          <span class="tag" style="background:${cat.color}22; color:${cat.color};">${cat.label}</span></div>
        <div class="stat-box"><div class="num">${bmr}</div><div class="lbl">Base metabolic rate (kcal/day)</div></div>
        <div class="stat-box"><div class="num">${tdee}</div><div class="lbl">Daily calorie need</div></div>
        <div class="stat-box"><div class="num">${idealRange[0]}–${idealRange[1]} kg</div><div class="lbl">Healthy weight range for your height</div></div>
      </div>
    </div>
    <div class="section-block">
      <h4>Tip of the day</h4>
      <div class="tip-box">${tip}</div>
    </div>
    <div class="section-block">
      <h4>Daily habits — sized to your numbers above</h4>
      <div class="habit-list" id="habit-list">
        ${habitList.map(h => `<label class="habit-item" data-k="${h.k}"><input type="checkbox" data-k="${h.k}"><span>${h.label}</span><span class="freq">${h.freq}</span></label>`).join('')}
      </div>
    </div>
    <div class="section-block">
      <h4>Note</h4>
      <p style="color:var(--text-dim); font-size:13px; line-height:1.6; margin:0;">These figures are general estimates from standard formulas (Mifflin–St Jeor), not medical advice. For any existing condition, medication, or persistent symptom, this agent should point you to a qualified clinician rather than replace one.</p>
    </div>
  </div>

  <div class="tab-content">
    <div class="tracker-card">
      <div class="tc-head"><h5>Water intake</h5><span class="val" id="water-val">${waterState.count} / ${waterTarget} glasses</span></div>
      <div class="progress-bar-track"><div class="progress-bar-fill" id="water-bar" style="width:${Math.min(100, waterState.count / waterTarget * 100)}%; background:#3ecf9a;"></div></div>
      <div class="counter-row" style="margin-top:14px;">
        <button class="counter-btn" id="water-minus">–</button>
        <div class="counter-num" id="water-count">${waterState.count}</div>
        <button class="counter-btn" id="water-plus">+</button>
        <span style="font-size:12px; color:var(--text-faint);">resets automatically each day</span>
      </div>
    </div>

    <div class="tracker-card">
      <div class="tc-head"><h5>Sleep log</h5><span class="val">Last 7 entries</span></div>
      <div class="bar-chart" id="sleep-chart">${sleepBars()}</div>
      <div class="inline-form" style="margin-top:12px;">
        <div class="field"><label>Hours slept last night</label><input type="number" step="0.5" min="0" max="14" id="sleep-input" placeholder="7.5"></div>
        <button class="btn primary small" id="sleep-add">Log sleep</button>
      </div>
    </div>

    <div class="tracker-card">
      <div class="tc-head"><h5>Weight trend</h5><span class="val" id="weight-trend-val">${weightTrendText()}</span></div>
      <div class="bar-chart" id="weight-chart">${weightBars()}</div>
      <div class="inline-form" style="margin-top:12px;">
        <div class="field"><label>Today's weight (kg)</label><input type="number" step="0.1" id="weight-input" placeholder="${profile.weight}"></div>
        <button class="btn primary small" id="weight-add">Log weight</button>
      </div>
    </div>
  </div>

  <div class="tab-content">
    <div class="section-block">
      <h4>How are you feeling right now?</h4>
      <div class="mood-row" id="mood-row">
        ${['Good', 'Okay', 'Low'].map(m => `<div class="mood-chip" data-mood="${m}">${m}</div>`).join('')}
      </div>
      <textarea id="mood-note" rows="2" style="width:100%; background:var(--bg); border:1px solid var(--line); color:var(--text); border-radius:6px; padding:10px 12px; font-size:13.5px; resize:vertical;" placeholder="Optional note — symptoms, energy, anything worth remembering"></textarea>
      <button class="btn primary small" id="mood-add" style="margin-top:10px;">Save entry</button>
    </div>
    <div class="section-block">
      <h4>Recent entries</h4>
      <div class="log-list" id="mood-list">${renderMoodLog()}</div>
    </div>
  </div>`;
}

function sleepBars() {
  const last7 = sleepLog.slice(-7);
  if (!last7.length) return `<div class="empty-note" style="padding:8px 0;">No sleep logged yet</div>`;
  return last7.map(e => {
    const h = Math.max(3, Math.min(100, (e.hours / 10) * 100));
    return `<div class="bar-col"><div class="bar" style="height:${h}%;"></div><div class="bar-lbl">${e.hours}h</div></div>`;
  }).join('');
}
function weightBars() {
  const last7 = weightLog.slice(-7);
  if (!last7.length) return `<div class="empty-note" style="padding:8px 0;">No weight logged yet</div>`;
  const min = Math.min(...last7.map(e => e.weight)) - 1;
  const max = Math.max(...last7.map(e => e.weight)) + 1;
  return last7.map(e => {
    const h = Math.max(6, ((e.weight - min) / (max - min)) * 100);
    return `<div class="bar-col"><div class="bar" style="height:${h}%; background:#7fa8ff;"></div><div class="bar-lbl">${e.weight}</div></div>`;
  }).join('');
}
function weightTrendText() {
  if (weightLog.length < 2) return 'Not enough data yet';
  const delta = +(weightLog[weightLog.length - 1].weight - weightLog[0].weight).toFixed(1);
  if (delta === 0) return 'Stable';
  return (delta > 0 ? '+' : '') + delta + ' kg over logged period';
}
function renderMoodLog() {
  if (!moodLog.length) return `<div class="empty-note" style="padding:10px 0;">No entries yet</div>`;
  return moodLog.slice().reverse().slice(0, 6).map(e => `
    <div class="log-item"><strong>${e.mood}</strong>${e.note ? ' — ' + e.note : ''}<div class="meta">${e.date}</div></div>
  `).join('');
}

/* ================= GYM MODULE ================= */
const EXERCISE_POOL = {
  'Full body A': ['Back Squat', 'Bench Press', 'Bent-over Row', 'Plank'],
  'Full body B': ['Deadlift', 'Overhead Press', 'Lat Pulldown', 'Hanging Leg Raise'],
  'Full body C': ['Front Squat', 'Incline Dumbbell Press', 'Seated Cable Row', 'Side Plank'],
  'Upper body': ['Bench Press', 'Barbell Row', 'Overhead Press', 'Lat Pulldown', 'Bicep Curl', 'Tricep Pushdown'],
  'Lower body': ['Back Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise', 'Hanging Leg Raise'],
  'Push (chest/shoulders/triceps)': ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Tricep Dip'],
  'Pull (back/biceps)': ['Deadlift', 'Pull-up / Lat Pulldown', 'Barbell Row', 'Face Pull', 'Bicep Curl'],
  'Push': ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Tricep Dip'],
  'Pull': ['Deadlift', 'Pull-up / Lat Pulldown', 'Barbell Row', 'Face Pull', 'Bicep Curl'],
  'Legs': ['Back Squat', 'Romanian Deadlift', 'Walking Lunge', 'Leg Curl', 'Calf Raise'],
  'Rest': []
};
function schemeFor(level) {
  if (level === 'beginner') return '3 x 10–12';
  if (level === 'intermediate') return '3–4 x 8–12';
  return '4–5 x 6–10';
}

function renderGymShell() {
  return overlayHead('Gym agent', '#e2a545', '#332413',
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M2 9.5v5M22 9.5v5M6.5 12h11"></path></svg>`)
    + `
  <div class="tab-row" id="gym-tabs">
    <button class="tab-btn active">Plan</button>
    <button class="tab-btn">Workout log</button>
    <button class="tab-btn">Rest timer</button>
  </div>

  <div class="tab-content active">
    <div class="section-block">
      <h4>Tell it your goal and level</h4>
      <div class="form-grid">
        <div class="field"><label>Goal</label>
          <select id="g-goal">
            <option value="fatloss">Fat loss</option>
            <option value="muscle">Muscle gain</option>
            <option value="maintain">General fitness / maintain</option>
          </select>
        </div>
        <div class="field"><label>Experience</label>
          <select id="g-level">
            <option value="beginner">Beginner (0–6 months)</option>
            <option value="intermediate">Intermediate (6 mo–2 yrs)</option>
            <option value="advanced">Advanced (2+ yrs)</option>
          </select>
        </div>
        <div class="field"><label>Days per week available</label>
          <select id="g-days">
            <option value="3">3 days</option>
            <option value="4" selected>4 days</option>
            <option value="5">5 days</option>
            <option value="6">6 days</option>
          </select>
        </div>
      </div>
      <button class="btn primary" id="g-generate" style="margin-top:16px;">Generate my plan</button>
    </div>
    <div id="g-output"></div>
  </div>

  <div class="tab-content">
    <div class="section-block">
      <h4>Log a set</h4>
      <div class="inline-form">
        <div class="field"><label>Exercise</label><input type="text" id="log-exercise" placeholder="e.g. Bench Press"></div>
        <div class="field" style="max-width:90px;"><label>Weight (kg)</label><input type="number" id="log-weight"></div>
        <div class="field" style="max-width:80px;"><label>Reps</label><input type="number" id="log-reps"></div>
        <div class="field" style="max-width:80px;"><label>Sets</label><input type="number" id="log-sets" value="3"></div>
        <button class="btn primary small" id="log-add">Add</button>
      </div>
    </div>
    <div class="section-block">
      <h4>Personal records</h4>
      <div class="pr-list" id="pr-list">${renderPRs()}</div>
    </div>
    <div class="section-block">
      <h4>Recent sessions</h4>
      <div class="log-list" id="gym-log-list">${renderGymLog()}</div>
    </div>
  </div>

  <div class="tab-content">
    <div class="section-block">
      <div class="timer-display" id="timer-display">00:00</div>
      <div class="timer-presets">
        <button class="btn small" data-secs="60">60s</button>
        <button class="btn small" data-secs="90">90s</button>
        <button class="btn small" data-secs="120">120s</button>
        <button class="btn small" data-secs="180">180s</button>
      </div>
      <div class="timer-controls">
        <button class="btn primary" id="timer-start">Start</button>
        <button class="btn" id="timer-pause">Pause</button>
        <button class="btn" id="timer-reset">Reset</button>
      </div>
      <p style="text-align:center; color:var(--text-faint); font-size:12.5px; margin-top:16px;">The agent announces "Rest complete" out loud when the countdown finishes.</p>
    </div>
  </div>`;
}

function generateGymPlan() {
  const goal = document.getElementById('g-goal').value;
  const level = document.getElementById('g-level').value;
  const days = +document.getElementById('g-days').value;
  const bmr = calcBMR(profile);
  const tdee = calcTDEE(bmr);
  const bmiCat = bmiCategory(calcBMI(profile.weight, profile.height));

  let calorieTarget, proteinPerKg, note;
  if (goal === 'fatloss') { calorieTarget = tdee - 400;
    proteinPerKg = 1.8;
    note = 'a moderate deficit, kept gradual so strength holds up'; } else if (goal === 'muscle') { calorieTarget = tdee + 300;
    proteinPerKg = 2.0;
    note = 'a modest surplus to support recovery and growth'; } else { calorieTarget = tdee;
    proteinPerKg = 1.6;
    note = 'maintenance calories, focused on consistency'; }
  const protein = Math.round(profile.weight * proteinPerKg);

  const splits = {
    3: ['Full body A', 'Rest', 'Full body B', 'Rest', 'Full body C', 'Rest', 'Rest'],
    4: ['Upper body', 'Lower body', 'Rest', 'Push (chest/shoulders/triceps)', 'Pull (back/biceps)', 'Rest', 'Rest'],
    5: ['Push', 'Pull', 'Legs', 'Rest', 'Upper body', 'Lower body', 'Rest'],
    6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest']
  };
  const scheme = schemeFor(level);
  const dayNames = splits[days];

  const daysHtml = dayNames.map((dname, i) => {
    if (dname === 'Rest') return `<div class="day-card"><div class="day-head"><span class="dname">Day ${i + 1} · Rest</span></div><div class="rest-day">Active recovery — light walk, mobility work, or full rest.</div></div>`;
    const exs = EXERCISE_POOL[dname] || [];
    return `<div class="day-card"><div class="day-head"><span class="dname">Day ${i + 1} · ${dname}</span><span class="dnum">${exs.length} exercises</span></div>
      ${exs.map(ex => `<div class="ex-row"><span>${ex}</span><span class="ex-scheme">${scheme}</span></div>`).join('')}
    </div>`;
  }).join('');

  const caution = bmiCat.label === 'Obese range' ? `\n\nSince your current BMI falls in the higher range, start with lower-impact variations (leg press over back squat, incline treadmill over running) for the first few weeks and progress load gradually.` : '';

  document.getElementById('g-output').innerHTML = `
  <div class="section-block">
    <h4>Targets, based on ${profile.weight} kg and a ${goal === 'fatloss' ? 'fat loss' : goal === 'muscle' ? 'muscle gain' : 'general fitness'} goal</h4>
    <div class="stat-row">
      <div class="stat-box"><div class="num">${calorieTarget}</div><div class="lbl">kcal/day (${note})</div></div>
      <div class="stat-box"><div class="num">${protein} g</div><div class="lbl">Protein/day (~${proteinPerKg} g/kg)</div></div>
      <div class="stat-box"><div class="num">2 x 20–30 min</div><div class="lbl">Low-intensity cardio, on rest or light days</div></div>
    </div>
    ${caution ? `<p style="color:var(--amber); font-size:12.5px; margin-top:10px; white-space:pre-line;">${caution.trim()}</p>` : ''}
  </div>
  <div class="section-block">
    <h4>Weekly split — ${days} training days, ${level} intensity</h4>
    ${daysHtml}
  </div>`;
}

function renderPRs() {
  if (!gymPRs.length) return `<div class="empty-note" style="padding:10px 0;">No personal records yet — log a set to start tracking.</div>`;
  return gymPRs.slice().sort((a, b) => a.exercise.localeCompare(b.exercise)).map(pr => `
    <div class="pr-item"><span>${pr.exercise}</span><span class="pr-val">${pr.weight} kg</span></div>
  `).join('');
}
function renderGymLog() {
  if (!gymLogs.length) return `<div class="empty-note" style="padding:10px 0;">No sessions logged yet.</div>`;
  return gymLogs.slice().reverse().slice(0, 8).map(l => `
    <div class="log-item"><strong>${l.exercise}</strong> — ${l.sets} x ${l.reps} @ ${l.weight} kg<div class="meta">${l.date}</div></div>
  `).join('');
}

/* ================= DOCUMENT WALLET ================= */
const DOC_CATEGORIES = ['ID', 'Financial', 'Medical', 'Certificate', 'Other'];
function fileIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>`;
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}
function filteredDocs() {
  let list = documents.map((d, i) => ({ ...d, _idx: i }));
  if (docFilter.category !== 'all') list = list.filter(d => (d.category || 'Other') === docFilter.category);
  if (docFilter.search) list = list.filter(d => d.name.toLowerCase().includes(docFilter.search.toLowerCase()));
  if (docFilter.sort === 'newest') list.sort((a, b) => b._idx - a._idx);
  if (docFilter.sort === 'oldest') list.sort((a, b) => a._idx - b._idx);
  if (docFilter.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}
function renderDocList() {
  const list = filteredDocs();
  if (!list.length) return `<div class="empty-note">No documents match — try a different search or filter.</div>`;
  return list.map(d => {
    const isImg = (d.type || '').startsWith('image/');
    const dLeft = daysUntil(d.expiry);
    let expBadge = '';
    if (dLeft !== null) {
      if (dLeft < 0) expBadge = `<span class="exp-badge expired">Expired</span>`;
      else if (dLeft <= 30) expBadge = `<span class="exp-badge soon">Expires in ${dLeft}d</span>`;
    }
    return `
    <div class="doc-item" data-idx="${d._idx}" data-name="${d.name.toLowerCase()}">
      <div class="doc-icon">${isImg ? `<img src="${d.dataUrl}" alt="">` : fileIconSvg()}</div>
      <div class="doc-meta">
        <div class="name">${d.name}</div>
        <div class="sub"><span>Added ${d.addedAt}</span><span class="cat-badge">${d.category || 'Other'}</span>${expBadge}</div>
      </div>
      <div class="doc-actions">
        <button class="icon-btn share-doc" data-idx="${d._idx}" title="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"></line></svg>
        </button>
        <button class="icon-btn delete-doc" data-idx="${d._idx}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"></path></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}
function renderDocuments() {
  return overlayHead('Document wallet', '#7fa8ff', '#1a2440',
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"></path></svg>`)
    + `
  <div class="section-block">
    <div class="doc-add-row">
      <label class="doc-add-btn" for="doc-file-input">+</label>
      <input type="file" id="doc-file-input" style="display:none;">
      <button class="mic-btn" id="doc-mic-btn"><span class="dot"></span> Ask for a document</button>
    </div>
    <div class="doc-toolbar">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="doc-search" placeholder="Search documents by name...">
      </div>
      <select class="sort-select" id="doc-sort">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="name">By name</option>
      </select>
    </div>
    <div class="chip-row" id="doc-chips">
      <div class="chip active" data-cat="all">All</div>
      ${DOC_CATEGORIES.map(c => `<div class="chip" data-cat="${c}">${c}</div>`).join('')}
    </div>
    <div class="doc-list" id="doc-list">${renderDocList()}</div>
  </div>
  <div class="section-block">
    <h4>How this module works</h4>
    <p style="color:var(--text-dim); font-size:13px; line-height:1.6; margin:0;">Tap + to upload a file, name it, tag it with a category, and optionally set an expiry date for IDs or certificates — it will flag anything expiring within 30 days. Use the search bar to filter instantly, or tap "Ask for a document" and say its name to have the agent find and speak it back. Files are kept under ~1.5 MB for this prototype and stored privately to your profile.</p>
  </div>`;
}

/* ================= REMINDERS ================= */
const REM_CATEGORIES = { General: '#8a97a1', Medicine: '#3ecf9a', Bill: '#e2a545', Appointment: '#7fa8ff' };
function renderReminders() {
  const now = new Date();
  const sorted = reminders.map((r, i) => ({ ...r, _idx: i })).sort((a, b) => new Date(a.time) - new Date(b.time));
  const listHtml = sorted.length ? sorted.map(r => {
    const due = new Date(r.time) <= now;
    const color = REM_CATEGORIES[r.category || 'General'];
    return `<div class="rem-item ${due ? 'due' : ''}">
      <div class="cat-dot" style="background:${color};"></div>
      <div class="rem-time">${new Date(r.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      <div class="rem-title">${r.title}</div>
      <div class="rem-badges">
        <span>${r.category || 'General'}</span>
        ${r.recurring && r.recurring !== 'once' ? `<span>${r.recurring}</span>` : ''}
        ${r.priority ? `<span style="color:var(--amber);">Important</span>` : ''}
      </div>
      ${due ? `<button class="icon-btn snooze-rem" data-idx="${r._idx}" title="Snooze 10 min"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 2.5M9 3h6"></path></svg></button>` : ''}
      <button class="icon-btn speak-rem" data-idx="${r._idx}" title="Speak now">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path></svg>
      </button>
      <button class="icon-btn delete-rem" data-idx="${r._idx}" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"></path></svg>
      </button>
    </div>`;
  }).join('') : `<div class="empty-note">No reminders yet — add one below.</div>`;

  return overlayHead('Voice reminders', '#d98fd0', '#301c2e',
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path></svg>`)
    + `
  <div class="section-block">
    <div class="rem-form">
      <div class="field"><label>Reminder</label><input type="text" id="rem-title" placeholder="e.g. Take medicine"></div>
      <div class="field"><label>When</label><input type="datetime-local" id="rem-time"></div>
      <div class="field"><label>Category</label>
        <select id="rem-category">${Object.keys(REM_CATEGORIES).map(c => `<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Repeats</label>
        <select id="rem-recurring">
          <option value="once">One-time</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
      <button class="btn primary" id="rem-add">Add</button>
    </div>
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-dim); margin-bottom:18px;">
      <input type="checkbox" id="rem-priority" style="accent-color:var(--violet);"> Mark as important
    </label>
    <div class="rem-list" id="rem-list">${listHtml}</div>
  </div>
  <div class="section-block">
    <h4>How this behaves</h4>
    <p style="color:var(--text-dim); font-size:13px; line-height:1.6; margin:0;">While this tab is open, the agent checks reminders every 20 seconds and speaks any that have come due. Daily and weekly reminders automatically reschedule to their next occurrence once delivered; snooze pushes a due reminder 10 minutes.</p>
  </div>`;
}

/* ---------------- module event wiring ---------------- */
function wireModuleEvents(name) {
  if (name === 'health') {
    document.querySelectorAll('#health-tabs .tab-btn').forEach((btn, i) => btn.addEventListener('click', () => switchTab('#overlay', i)));
    document.querySelectorAll('#habit-list input[type=checkbox]').forEach(cb => {
      cb.checked = !!habits[cb.dataset.k];
      cb.closest('.habit-item').classList.toggle('done', cb.checked);
      cb.addEventListener('change', () => {
        habits[cb.dataset.k] = cb.checked;
        cb.closest('.habit-item').classList.toggle('done', cb.checked);
      });
    });
    document.getElementById('water-plus').addEventListener('click', () => adjustWater(1));
    document.getElementById('water-minus').addEventListener('click', () => adjustWater(-1));
    document.getElementById('sleep-add').addEventListener('click', addSleep);
    document.getElementById('weight-add').addEventListener('click', addWeight);
    document.querySelectorAll('.mood-chip').forEach(c => c.addEventListener('click', () => {
      document.querySelectorAll('.mood-chip').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
    }));
    document.getElementById('mood-add').addEventListener('click', addMood);
  }

  if (name === 'gym') {
    document.querySelectorAll('#gym-tabs .tab-btn').forEach((btn, i) => btn.addEventListener('click', () => switchTab('#overlay', i)));
    document.getElementById('g-generate').addEventListener('click', generateGymPlan);
    document.getElementById('log-add').addEventListener('click', addGymLog);
    document.querySelectorAll('.timer-presets .btn').forEach(b => b.addEventListener('click', () => setTimerPreset(+b.dataset.secs)));
    document.getElementById('timer-start').addEventListener('click', startTimer);
    document.getElementById('timer-pause').addEventListener('click', pauseTimer);
    document.getElementById('timer-reset').addEventListener('click', resetTimer);
    updateTimerDisplay();
  }

  if (name === 'documents') {
    document.getElementById('doc-file-input').addEventListener('change', handleDocUpload);
    document.getElementById('doc-mic-btn').addEventListener('click', handleDocVoiceSearch);
    document.getElementById('doc-search').addEventListener('input', (e) => { docFilter.search = e.target.value;
      refreshDocList(); });
    document.getElementById('doc-sort').addEventListener('change', (e) => { docFilter.sort = e.target.value;
      refreshDocList(); });
    document.querySelectorAll('#doc-chips .chip').forEach(chip => chip.addEventListener('click', () => {
      document.querySelectorAll('#doc-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      docFilter.category = chip.dataset.cat;
      refreshDocList();
    }));
    wireDocListButtons();
  }

  if (name === 'alarm') {
    document.getElementById('rem-add').addEventListener('click', addReminder);
    wireReminderButtons();
  }
}
function wireDocListButtons() {
  document.querySelectorAll('.share-doc').forEach(b => b.addEventListener('click', () => shareDoc(+b.dataset.idx)));
  document.querySelectorAll('.delete-doc').forEach(b => b.addEventListener('click', () => deleteDoc(+b.dataset.idx)));
}
function wireReminderButtons() {
  document.querySelectorAll('.speak-rem').forEach(b => b.addEventListener('click', () => speak(reminders[+b.dataset.idx].title)));
  document.querySelectorAll('.delete-rem').forEach(b => b.addEventListener('click', () => deleteReminder(+b.dataset.idx)));
  document.querySelectorAll('.snooze-rem').forEach(b => b.addEventListener('click', () => snoozeReminder(+b.dataset.idx)));
}
function refreshDocList() {
  document.getElementById('doc-list').innerHTML = renderDocList();
  wireDocListButtons();
}

/* --- health tracker logic --- */
async function adjustWater(delta) {
  waterState.count = Math.max(0, waterState.count + delta);
  waterState.date = todayStr();
  await storeSet('water-state', waterState);
  const target = waterTargetGlasses(profile.weight);
  document.getElementById('water-count').textContent = waterState.count;
  document.getElementById('water-val').textContent = `${waterState.count} / ${target} glasses`;
  document.getElementById('water-bar').style.width = Math.min(100, waterState.count / target * 100) + '%';
  if (waterState.count === target) toast('Water target reached for today');
}
async function addSleep() {
  const val = +document.getElementById('sleep-input').value;
  if (!val) { toast('Enter hours slept first.'); return; }
  const existing = sleepLog.findIndex(e => e.date === todayStr());
  if (existing > -1) sleepLog[existing].hours = val;
  else sleepLog.push({ date: todayStr(), hours: val });
  await storeSet('sleep-log', sleepLog);
  document.getElementById('sleep-chart').innerHTML = sleepBars();
  document.getElementById('sleep-input').value = '';
  toast('Sleep logged');
}
async function addWeight() {
  const val = +document.getElementById('weight-input').value;
  if (!val) { toast('Enter a weight first.'); return; }
  const existing = weightLog.findIndex(e => e.date === todayStr());
  if (existing > -1) weightLog[existing].weight = val;
  else weightLog.push({ date: todayStr(), weight: val });
  await storeSet('weight-log', weightLog);
  document.getElementById('weight-chart').innerHTML = weightBars();
  document.getElementById('weight-trend-val').textContent = weightTrendText();
  document.getElementById('weight-input').value = '';
  toast('Weight logged');
}
async function addMood() {
  const sel = document.querySelector('.mood-chip.selected');
  if (!sel) { toast('Pick a mood first.'); return; }
  const note = document.getElementById('mood-note').value.trim();
  moodLog.push({ date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), mood: sel.dataset.mood, note });
  await storeSet('mood-log', moodLog);
  document.getElementById('mood-list').innerHTML = renderMoodLog();
  document.getElementById('mood-note').value = '';
  sel.classList.remove('selected');
  toast('Entry saved');
}

/* --- gym logic --- */
async function addGymLog() {
  const exercise = document.getElementById('log-exercise').value.trim();
  const weight = +document.getElementById('log-weight').value;
  const reps = +document.getElementById('log-reps').value;
  const sets = +document.getElementById('log-sets').value || 3;
  if (!exercise || !weight || !reps) { toast('Fill in exercise, weight and reps.'); return; }
  gymLogs.push({ date: todayStr(), exercise, weight, reps, sets });
  await storeSet('gym-logs', gymLogs);
  const prIdx = gymPRs.findIndex(p => p.exercise.toLowerCase() === exercise.toLowerCase());
  if (prIdx === -1) { gymPRs.push({ exercise, weight, date: todayStr() });
    toast('New PR: ' + exercise); } else if (weight > gymPRs[prIdx].weight) { gymPRs[prIdx] = { exercise, weight, date: todayStr() };
    toast('New PR: ' + exercise); } else toast('Set logged');
  await storeSet('gym-prs', gymPRs);
  document.getElementById('pr-list').innerHTML = renderPRs();
  document.getElementById('gym-log-list').innerHTML = renderGymLog();
  ['log-exercise', 'log-weight', 'log-reps'].forEach(id => document.getElementById(id).value = '');
}
function setTimerPreset(secs) { timerState.total = secs;
  timerState.remaining = secs;
  updateTimerDisplay(); }
function updateTimerDisplay() {
  const m = Math.floor(timerState.remaining / 60).toString().padStart(2, '0');
  const s = (timerState.remaining % 60).toString().padStart(2, '0');
  const el = document.getElementById('timer-display');
  if (el) el.textContent = `${m}:${s}`;
}
function startTimer() {
  if (timerState.running) return;
  if (timerState.remaining <= 0) { toast('Choose a preset first.'); return; }
  timerState.running = true;
  timerState.handle = setInterval(() => {
    timerState.remaining--;
    updateTimerDisplay();
    if (timerState.remaining <= 0) {
      clearInterval(timerState.handle);
      timerState.running = false;
      speak('Rest complete');
      toast('Rest complete');
    }
  }, 1000);
}
function pauseTimer() { clearInterval(timerState.handle);
  timerState.running = false; }
function resetTimer() { clearInterval(timerState.handle);
  timerState.running = false;
  timerState.remaining = timerState.total;
  updateTimerDisplay(); }

/* --- documents logic --- */
async function handleDocUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1.5 * 1024 * 1024) { toast('Please choose a file under 1.5 MB for this prototype.');
    e.target.value = '';
    return; }
  const name = prompt('Save this document as:', file.name.replace(/\.[^/.]+$/, ''));
  if (!name) { e.target.value = ''; return; }
  const category = prompt(`Category (${DOC_CATEGORIES.join(' / ')}):`, 'Other') || 'Other';
  const expiry = prompt('Expiry date, if any (YYYY-MM-DD) — leave blank if none:', '') || '';
  const reader = new FileReader();
  reader.onload = async () => {
    documents.push({
      name: name.trim(),
      type: file.type,
      dataUrl: reader.result,
      category: DOC_CATEGORIES.includes(category) ? category : 'Other',
      expiry: expiry.trim(),
      addedAt: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
    });
    await storeSet('documents', documents);
    refreshDocList();
    toast(`Saved "${name.trim()}"`);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}
function dataUrlToFile(dataUrl, filename) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}
async function shareDoc(idx) {
  const d = documents[idx];
  try {
    const file = dataUrlToFile(d.dataUrl, d.name);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: d.name });
      return;
    }
  } catch (err) {}
  const a = document.createElement('a');
  a.href = d.dataUrl;
  a.download = d.name;
  a.click();
  toast(`Downloaded "${d.name}" (sharing not supported on this browser)`);
}
async function deleteDoc(idx) {
  const name = documents[idx].name;
  documents.splice(idx, 1);
  await storeSet('documents', documents);
  refreshDocList();
  toast(`Removed "${name}"`);
}
function handleDocVoiceSearch() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('doc-mic-btn');
  if (!Rec) {
    const q = prompt('Voice recognition isn\'t available in this browser. Type the document name instead:');
    if (q) matchAndOpenDoc(q);
    return;
  }
  const rec = new Rec();
  rec.lang = 'en-IN';
  rec.onstart = () => btn.classList.add('listening');
  rec.onend = () => btn.classList.remove('listening');
  rec.onresult = (ev) => matchAndOpenDoc(ev.results[0][0].transcript);
  rec.onerror = () => btn.classList.remove('listening');
  rec.start();
}
function matchAndOpenDoc(query) {
  const q = query.toLowerCase();
  const idx = documents.findIndex(d => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase()));
  if (idx === -1) { speak(`I couldn't find a document called ${query}`);
    toast(`No document matching "${query}"`); return; }
  speak(`Here is your ${documents[idx].name}`);
  document.getElementById('doc-search').value = '';
  docFilter.search = '';
  docFilter.category = 'all';
  document.querySelectorAll('#doc-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.cat === 'all'));
  refreshDocList();
  const el = document.querySelector(`.doc-item[data-idx="${idx}"]`);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight');
    setTimeout(() => el.classList.remove('highlight'), 2200); }
}

/* --- reminders logic --- */
async function addReminder() {
  const title = document.getElementById('rem-title').value.trim();
  const time = document.getElementById('rem-time').value;
  const category = document.getElementById('rem-category').value;
  const recurring = document.getElementById('rem-recurring').value;
  const priority = document.getElementById('rem-priority').checked;
  if (!title || !time) { toast('Add both a title and a time.'); return; }
  reminders.push({ title, time: new Date(time).toISOString(), category, recurring, priority, spoken: false });
  await storeSet('reminders', reminders);
  document.getElementById('rem-list').innerHTML = document.getElementById('overlay-inner').innerHTML;
  openModule('alarm');
  toast('Reminder saved');
}
async function deleteReminder(idx) {
  reminders.splice(idx, 1);
  await storeSet('reminders', reminders);
  openModule('alarm');
}
async function snoozeReminder(idx) {
  const r = reminders[idx];
  r.time = new Date(Date.now() + 10 * 60000).toISOString();
  r.spoken = false;
  await storeSet('reminders', reminders);
  openModule('alarm');
  toast('Snoozed for 10 minutes');
}
function nextOccurrence(iso, recurring) {
  const d = new Date(iso);
  if (recurring === 'daily') d.setDate(d.getDate() + 1);
  if (recurring === 'weekly') d.setDate(d.getDate() + 7);
  return d.toISOString();
}

/* background check for due reminders */
setInterval(async () => {
  if (!reminders.length) return;
  const now = new Date();
  let changed = false;
  for (const r of reminders) {
    if (!r.spoken && new Date(r.time) <= now) {
      speak(`Reminder: ${r.title}`);
      toast(`Reminder: ${r.title}`);
      if (r.recurring && r.recurring !== 'once') {
        r.time = nextOccurrence(r.time, r.recurring);
        r.spoken = false;
      } else {
        r.spoken = true;
      }
      changed = true;
    }
  }
  if (changed) await storeSet('reminders', reminders);
}, 20000);

// ========== AI CHAT LOGIC ==========

// Toggle chat window
document.getElementById('chat-toggle').addEventListener('click', () => {
  const win = document.getElementById('chat-window');
  win.style.display = win.style.display === 'none' ? 'flex' : 'none';
});
document.getElementById('chat-close').addEventListener('click', () => {
  document.getElementById('chat-window').style.display = 'none';
});

// Send message
document.getElementById('chat-send').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  addChatMessage('user', msg);
  const response = await getAgentResponse(msg);
  addChatMessage('agent', response);
}

function addChatMessage(sender, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${sender}`;
  div.innerHTML = `${text}<span class="timestamp">${new Date().toLocaleTimeString()}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ----- AGENT RESPONSE (Rule-Based Demo) -----
async function getAgentResponse(userMessage) {
  // Build context from user data if logged in
  let context = '';
  if (profile) {
    const bmi = calcBMI(profile.weight, profile.height);
    context += `User: age ${profile.age}, weight ${profile.weight}kg, height ${profile.height}cm, BMI ${bmi}. `;
    if (sleepLog.length) {
      const avgSleep = sleepLog.reduce((a, b) => a + b.hours, 0) / sleepLog.length;
      context += `Average sleep: ${avgSleep.toFixed(1)}h. `;
    }
    if (waterState.count) {
      const target = waterTargetGlasses(profile.weight);
      context += `Water today: ${waterState.count}/${target} glasses. `;
    }
  }

  const lower = userMessage.toLowerCase();

  // Simple pattern matching – feel free to expand
  if (lower.includes('hello') || lower.includes('hi')) {
    return "Hello! I'm your LifeSync agent. How can I assist you today?";
  }
  if (lower.includes('bmi')) {
    if (profile) {
      const bmi = calcBMI(profile.weight, profile.height);
      const cat = bmiCategory(bmi);
      return `Your BMI is ${bmi} (${cat.label}). Based on your weight and height.`;
    }
    return "Please log in first so I can see your profile.";
  }
  if (lower.includes('sleep')) {
    if (sleepLog.length) {
      const last = sleepLog[sleepLog.length - 1];
      return `Your last logged sleep was ${last.hours} hours on ${last.date}. ` +
        (last.hours < 7 ? "That's below the recommended 7-9 hours. Try to sleep earlier." : "Great! Keep it consistent.");
    }
    return "You haven't logged any sleep yet. Use the Health module to track it.";
  }
  if (lower.includes('water')) {
    const target = waterTargetGlasses(profile.weight);
    return `Today you've had ${waterState.count} glasses. Target: ${target}. ` +
      (waterState.count < target ? `You need ${target - waterState.count} more.` : "Well done, goal met!");
  }
  if (lower.includes('workout') || lower.includes('gym')) {
    return "I can help you plan a workout. Tell me your goal (fat loss, muscle gain, or general) and how many days you can train.";
  }
  if (lower.includes('reminder')) {
    return "To set a reminder, go to the Voice Reminders module. I'll also remind you when the time comes.";
  }
  if (lower.includes('document')) {
    return "You can upload documents in the Document Wallet. I can also find them by name if you ask.";
  }
  if (lower.includes('mood')) {
    return "You can log your mood in the Health module. It helps me understand your wellbeing.";
  }
  if (lower.includes('help')) {
    return "I can answer questions about your health stats, suggest workouts, set reminders, and help with documents. Try asking about BMI, sleep, water, workouts, or reminders.";
  }

  // Fallback
  return "I'm still learning! For now, you can ask about your BMI, sleep, water, workouts, reminders, or documents. Or use the modules above.";
}

/* ---------------- init ---------------- */
tryAutoLogin();