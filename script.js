const state = {
  work: 60,       // seconds
  rest: 45,
  exercises: 3,
  rounds: 6,
  roundReset: 90,
  soundOn: true,
  phase: 'work',  // 'work' | 'rest' | 'roundReset'
  currentExercise: 1,
  currentRound: 1,
  timeLeft: 0,
  totalTimeLeft: 0,
  isPaused: false,
  intervalId: null,
  totalElapsed: 0,
  workoutsCompleted: parseInt(localStorage.getItem('workoutsCompleted') || '0'),
};

let modalField = null;
let modalMin = 0, modalSec = 0, modalNum = 0;

let wakeLock = null;

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function beep(freq = 880, duration = 0.12, vol = 0.4) {
  if (!state.soundOn) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

function tripleBeep() {
  beep(660, 0.1); 
  setTimeout(() => beep(660, 0.1), 150);
  setTimeout(() => beep(880, 0.2), 300);
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch(e) {}
  }
}

async function releaseWakeLock() {
  if (wakeLock) { try { await wakeLock.release(); } catch(e) {} wakeLock = null; }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.intervalId && !state.isPaused) {
    await requestWakeLock();
  }
});

function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(s) { return `${pad(Math.floor(s/60))}:${pad(s%60)}`; }

function calcTotal() {
  const workouts = state.exercises * state.rounds;
  const resets = state.rounds; 
  return (state.work + state.rest) * workouts + state.roundReset * (state.rounds - 1);
}

function updateSetupDisplay() {
  document.getElementById('fieldWork').textContent = fmtTime(state.work);
  document.getElementById('fieldRest').textContent = fmtTime(state.rest);
  document.getElementById('fieldExercises').textContent = state.exercises;
  document.getElementById('fieldRounds').textContent = state.rounds + 'X';
  document.getElementById('fieldRoundReset').textContent = fmtTime(state.roundReset);
  document.getElementById('totalTimeDisplay').textContent = fmtTime(calcTotal());
  // desktop panel
  document.getElementById('deskWork').textContent = fmtTime(state.work);
  document.getElementById('deskRest').textContent = fmtTime(state.rest);
  document.getElementById('deskExercises').textContent = state.exercises;
  document.getElementById('deskRounds').textContent = state.rounds + '×';
}

// ===== SCREENS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active'));
  document.getElementById(id).classList.add('screen--active');
}

function showSetup() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  releaseWakeLock();
  showScreen('screenSetup');
  updateSetupDisplay();
}

function openModal(field) {
  modalField = field;
  const modal = document.getElementById('editModal');
  const timePicker = document.getElementById('timePickerUI');
  const numPicker = document.getElementById('numberPickerUI');

  if (field === 'exercises' || field === 'rounds') {
    timePicker.style.display = 'none';
    numPicker.style.display = 'block';
    modalNum = field === 'exercises' ? state.exercises : state.rounds;
    document.getElementById('pickerNumber').textContent = modalNum;
    document.getElementById('modalTitle').textContent = field === 'exercises' ? 'Exercises' : 'Rounds';
  } else {
    timePicker.style.display = 'block';
    numPicker.style.display = 'none';
    const val = field === 'work' ? state.work : field === 'rest' ? state.rest : state.roundReset;
    modalMin = Math.floor(val / 60);
    modalSec = val % 60;
    document.getElementById('pickerMin').textContent = pad(modalMin);
    document.getElementById('pickerSec').textContent = pad(modalSec);
    const titles = { work: 'Work Duration', rest: 'Rest Duration', roundReset: 'Round Reset' };
    document.getElementById('modalTitle').textContent = titles[field];
  }

  modal.classList.add('modal--active');
}

function closeModal(e) {
  if (e.target === document.getElementById('editModal')) {
    document.getElementById('editModal').classList.remove('modal--active');
  }
}

function adjustTime(part, delta) {
  if (part === 'min') {
    modalMin = Math.max(0, Math.min(59, modalMin + delta));
    document.getElementById('pickerMin').textContent = pad(modalMin);
  } else {
    modalSec = (modalSec + delta + 60) % 60;
    document.getElementById('pickerSec').textContent = pad(modalSec);
  }
}

function adjustNumber(delta) {
  const min = modalField === 'exercises' ? 1 : 1;
  const max = modalField === 'exercises' ? 20 : 20;
  modalNum = Math.max(min, Math.min(max, modalNum + delta));
  document.getElementById('pickerNumber').textContent = modalNum;
}

function saveModal() {
  if (modalField === 'exercises') {
    state.exercises = modalNum;
  } else if (modalField === 'rounds') {
    state.rounds = modalNum;
  } else {
    const val = modalMin * 60 + modalSec;
    if (modalField === 'work') state.work = Math.max(5, val);
    else if (modalField === 'rest') state.rest = Math.max(0, val);
    else if (modalField === 'roundReset') state.roundReset = Math.max(0, val);
  }
  document.getElementById('editModal').classList.remove('modal--active');
  updateSetupDisplay();
}

function startTimer() {
  getAudioCtx(); 
  state.currentExercise = 1;
  state.currentRound = 1;
  state.phase = 'work';
  state.timeLeft = state.work;
  state.totalElapsed = 0;
  state.isPaused = false;
  const total = calcTotal();
  state.totalTimeLeft = total;

  showScreen('screenTimer');
  applyPhaseStyle();
  updateTimerUI();
  requestWakeLock();

  clearInterval(state.intervalId);
  state.intervalId = setInterval(tick, 1000);
}

function tick() {
  if (state.isPaused) return;

  state.timeLeft--;
  state.totalElapsed++;
  state.totalTimeLeft = Math.max(0, state.totalTimeLeft - 1);

  // Beep last 3 seconds
  if (state.timeLeft <= 3 && state.timeLeft > 0) beep(440 + state.timeLeft * 100, 0.08);

  updateTimerUI();

  if (state.timeLeft <= 0) {
    tripleBeep();
    nextPhase();
  }
}

function nextPhase() {
  if (state.phase === 'work') {
    state.phase = 'rest';
    state.timeLeft = state.rest;
    applyPhaseStyle();
    updateTimerUI();
    return;
  }

  if (state.phase === 'rest') {
    state.currentExercise++;
    if (state.currentExercise > state.exercises) {
      state.currentRound++;
      if (state.currentRound > state.rounds) {
        finishWorkout();
        return;
      }
      state.currentExercise = 1;
      state.phase = 'roundReset';
      state.timeLeft = state.roundReset;
    } else {
      state.phase = 'work';
      state.timeLeft = state.work;
    }
    applyPhaseStyle();
    updateTimerUI();
    return;
  }

  if (state.phase === 'roundReset') {
    state.phase = 'work';
    state.timeLeft = state.work;
    applyPhaseStyle();
    updateTimerUI();
  }
}

function applyPhaseStyle() {
  const timer = document.getElementById('screenTimer');
  timer.classList.remove('timer--work', 'timer--rest', 'timer--reset');
  const map = { work: 'timer--work', rest: 'timer--rest', roundReset: 'timer--reset' };
  timer.classList.add(map[state.phase]);
}

function updateTimerUI() {
  const phaseLabels = { work: 'WORK', rest: 'REST', roundReset: 'ROUND RESET' };
  const phaseTitles = { work: 'Work', rest: 'Rest', roundReset: 'Round Reset' };

  document.getElementById('timerPhaseTitle').textContent = phaseTitles[state.phase];
  document.getElementById('timerPhaseLabel').textContent = phaseLabels[state.phase];
  document.getElementById('timerCountdown').textContent = fmtTime(state.timeLeft);
  document.getElementById('timerTotalRemaining').textContent = fmtTime(state.totalTimeLeft);
  document.getElementById('badgeExercise').textContent = `${state.currentExercise}/${state.exercises}`;
  document.getElementById('badgeRound').textContent = `${state.currentRound}/${state.rounds}`;
  document.getElementById('timerExerciseName').textContent = `EXERCISE ${state.currentExercise}`;

  const nextEx = state.currentExercise < state.exercises ? state.currentExercise + 1 : 1;
  const nextLabel = state.phase === 'roundReset' ? `EXERCISE 1` : `EXERCISE ${nextEx}`;
  document.getElementById('timerUpNext').textContent = nextLabel;

  const totalPhaseTime = state.phase === 'work' ? state.work : state.phase === 'rest' ? state.rest : state.roundReset;
  const progress = totalPhaseTime > 0 ? state.timeLeft / totalPhaseTime : 0;
  const circumference = 2 * Math.PI * 110;
  const offset = circumference * (1 - progress);
  document.getElementById('timerProgress').style.strokeDasharray = circumference;
  document.getElementById('timerProgress').style.strokeDashoffset = offset;
}

function togglePause() {
  state.isPaused = !state.isPaused;
  const icon = document.getElementById('playIcon');
  if (state.isPaused) {
    releaseWakeLock();
    icon.innerHTML = '<path d="M5 3l14 9-14 9V3z"/>';
  } else {
    requestWakeLock();
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  }
}

function skipPhase() {
  state.timeLeft = 0;
  nextPhase();
}

function toggleSound() {
  state.soundOn = !state.soundOn;
  const btn = document.getElementById('soundBtn');
  btn.style.opacity = state.soundOn ? '1' : '0.4';
}

function finishWorkout() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  releaseWakeLock();

  state.workoutsCompleted++;
  localStorage.setItem('workoutsCompleted', state.workoutsCompleted);

  document.getElementById('completedWorkouts').textContent = state.workoutsCompleted;
  document.getElementById('completeTotalTime').textContent = fmtTime(state.totalElapsed);

  showScreen('screenComplete');
  launchConfetti();
}

// ===== CONFETTI =====
function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  container.innerHTML = '';
  const colors = ['#fff', '#00D68F', '#FF4757', '#FFA000', '#4ecdc4', '#FFD700'];
  for (let i = 0; i < 40; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    dot.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 40 - 20}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${4 + Math.random() * 8}px;
      height: ${4 + Math.random() * 8}px;
      animation-delay: ${Math.random() * 1.5}s;
      animation-duration: ${2 + Math.random() * 2}s;
    `;
    container.appendChild(dot);
  }
}

updateSetupDisplay();