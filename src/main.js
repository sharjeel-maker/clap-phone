import { ClapDetector } from './clapDetector.js';
import { AlarmPlayer } from './alarmPlayer.js';
import { KeepAliveManager } from './keepAlive.js';
import confetti from 'canvas-confetti';

// State Management & DOM Elements
const detector = new ClapDetector({
  sensitivity: 75,
  mode: 'triple', // Minimum 3 claps
  distancePreset: '20ft'
});

const alarm = new AlarmPlayer();
const keepAlive = new KeepAliveManager();

// Elements
const heroCard = document.getElementById('heroCard');
const orbWrapper = document.getElementById('orbWrapper');
const toggleBtn = document.getElementById('toggleBtn');
const btnLabel = document.getElementById('btnLabel');
const micIcon = document.getElementById('micIcon');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const statusBadge = document.getElementById('statusBadge');

const sensitivitySlider = document.getElementById('sensitivitySlider');
const sensitivityVal = document.getElementById('sensitivityVal');
const peakValueDisplay = document.getElementById('peakValueDisplay');
const logFeed = document.getElementById('logFeed');

const testAlarmBtn = document.getElementById('testAlarmBtn');
const stopAlarmBtn = document.getElementById('stopAlarmBtn');

const canvas = document.getElementById('oscilloscope');
const ctx = canvas.getContext('2d');

let isAlarming = false;

// Initialize Canvas Size
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Visualizer Waveform Drawer
detector.onAudioData = (timeData, peak, rms) => {
  peakValueDisplay.textContent = `Peak: ${peak.toFixed(2)} | PAR: ${(rms > 0 ? (peak / rms) : 0).toFixed(1)}`;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = detector.isListening ? (isAlarming ? '#ef4444' : '#38bdf8') : '#64748b';
  ctx.beginPath();

  const sliceWidth = canvas.width / timeData.length;
  let x = 0;

  for (let i = 0; i < timeData.length; i++) {
    const v = timeData[i];
    const y = (v + 1) * (canvas.height / 2);

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    x += sliceWidth;
  }

  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
};

// Event Logging Helper
function addLog(message, type = 'info') {
  const timeStr = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.innerHTML = `<span>${message}</span><span>${timeStr}</span>`;
  logFeed.insertBefore(item, logFeed.firstChild);
}

// Clap Detection Trigger Callback
detector.onPeakDetected = (peak, par) => {
  addLog(`Transient peak detected (${(peak * 100).toFixed(0)}%)`, 'clap');
};

detector.onClapDetected = (data) => {
  addLog(`👏 CLAP DETECTED! (${data.count} clap trigger)`, 'trigger');
  triggerAlarm();
};

// Listen for notification action click to stop listening from background notification
keepAlive.onNotificationAction(() => {
  if (detector.isListening) {
    detector.stop();
    keepAlive.releaseWakeLock();
    
    orbWrapper.classList.remove('listening');
    statusTitle.textContent = 'Listening Disabled';
    statusDesc.textContent = 'Turn on listener and place phone in your room. When you clap, phone will ring loudly.';
    btnLabel.textContent = 'ACTIVATE CLAP FINDER';
    statusBadge.textContent = 'Standby';
    statusBadge.className = 'badge';
    addLog('Listening stopped from background notification.');
  }
});

// Start / Stop Listening Logic
toggleBtn.addEventListener('click', async () => {
  if (isAlarming) {
    stopAlarm();
    return;
  }

  if (detector.isListening) {
    detector.stop();
    keepAlive.releaseWakeLock();
    
    orbWrapper.classList.remove('listening');
    statusTitle.textContent = 'Listening Disabled';
    statusDesc.textContent = 'Turn on listener and place phone in your room. When you clap, phone will ring loudly.';
    btnLabel.textContent = 'ACTIVATE CLAP FINDER';
    statusBadge.textContent = 'Standby';
    statusBadge.className = 'badge';
    addLog('Listening stopped.');
  } else {
    try {
      await detector.start();
      await keepAlive.requestWakeLock();
      
      orbWrapper.classList.add('listening');
      statusTitle.textContent = 'Actively Listening in Background';
      statusDesc.textContent = `Monitoring room acoustics (${detector.distancePreset} range). You can lock screen now!`;
      btnLabel.textContent = 'DEACTIVATE CLAP FINDER';
      statusBadge.textContent = 'Active Background Monitoring';
      statusBadge.className = 'badge active';
      addLog(`Mic active (${detector.distancePreset} gain). Background service started.`);
    } catch (err) {
      alert('Microphone access is required for clap detection. Please allow permissions.');
      addLog('Error: Microphone permission denied.', 'trigger');
    }
  }
});

// Alarm Controls
function triggerAlarm() {
  if (isAlarming) return;
  isAlarming = true;
  detector.isAlarming = true;

  alarm.start();
  orbWrapper.classList.add('alarm-active');
  heroCard.classList.add('alarm-active');
  btnLabel.textContent = 'STOP ALARM';
  statusTitle.textContent = '🚨 PHONE LOCATED! ALARM RINGING';
  statusBadge.textContent = 'ALARM TRIGGERED';
  statusBadge.className = 'badge alarm';
  
  testAlarmBtn.style.display = 'none';
  stopAlarmBtn.style.display = 'flex';

  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 }
  });
}

function stopAlarm() {
  isAlarming = false;
  detector.isAlarming = false;
  alarm.stop();

  orbWrapper.classList.remove('alarm-active');
  heroCard.classList.remove('alarm-active');
  
  testAlarmBtn.style.display = 'flex';
  stopAlarmBtn.style.display = 'none';

  if (detector.isListening) {
    btnLabel.textContent = 'DEACTIVATE CLAP FINDER';
    statusTitle.textContent = 'Actively Listening in Background';
    statusBadge.textContent = 'Active Background Monitoring';
    statusBadge.className = 'badge active';
  } else {
    btnLabel.textContent = 'ACTIVATE CLAP FINDER';
    statusTitle.textContent = 'Listening Disabled';
    statusBadge.textContent = 'Standby';
    statusBadge.className = 'badge';
  }

  addLog('Alarm stopped.');
}

testAlarmBtn.addEventListener('click', () => {
  addLog('Manual alarm test triggered.');
  triggerAlarm();
});

stopAlarmBtn.addEventListener('click', () => {
  stopAlarm();
});

// UI Control Listeners
sensitivitySlider.addEventListener('input', (e) => {
  const val = e.target.value;
  sensitivityVal.textContent = `${val}%`;
  detector.setSensitivity(val);
});

// Distance Selector Group
document.getElementById('distanceGroup').addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-option')) {
    document.querySelectorAll('#distanceGroup .btn-option').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    const dist = e.target.dataset.dist;
    detector.setDistancePreset(dist);
    addLog(`Distance preset updated: ${dist}`);
    if (detector.isListening) {
      statusDesc.textContent = `Monitoring room acoustics (${dist} range). Clap clearly to trigger alarm.`;
    }
  }
});

// Pattern Mode Group
document.getElementById('modeGroup').addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-option')) {
    document.querySelectorAll('#modeGroup .btn-option').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    const mode = e.target.dataset.mode;
    detector.setMode(mode);
    addLog(`Clap pattern mode: ${mode === 'double' ? 'Double Clap' : 'Single Clap'}`);
  }
});

// Sound Selector Group
document.getElementById('soundGroup').addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-option')) {
    document.querySelectorAll('#soundGroup .btn-option').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    const sound = e.target.dataset.sound;
    alarm.setSoundType(sound);
    addLog(`Ringtone sound set to: ${sound}`);
  }
});
