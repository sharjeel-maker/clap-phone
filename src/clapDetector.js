/**
 * Acoustic Clap Detector Engine
 * High-sensitivity real-time audio analyzer for detecting claps at 10-20ft distance.
 */
export class ClapDetector {
  constructor(options = {}) {
    this.sensitivity = options.sensitivity || 75; // 0 - 100
    this.mode = options.mode || 'triple'; // Default to 3 claps minimum
    this.distancePreset = options.distancePreset || '20ft'; // '5ft', '10ft', '20ft'
    
    this.onClapDetected = options.onClapDetected || (() => {});
    this.onPeakDetected = options.onPeakDetected || (() => {});
    this.onAudioData = options.onAudioData || (() => {});
    
    this.audioCtx = null;
    this.mediaStream = null;
    this.analyser = null;
    this.gainNode = null;
    this.filterNode = null;
    
    this.isListening = false;
    this.lastClapTime = 0;
    this.clapCount = 0;
    this.clapWindowTimer = null;
    
    this.animationFrameId = null;
  }

  async start() {
    if (this.isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      this.mediaStream = stream;
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      const source = this.audioCtx.createMediaStreamSource(stream);
      
      // Gain node tuned for clean pickup
      this.gainNode = this.audioCtx.createGain();
      this.updateDistanceGain();

      // Highpass filter (800 Hz) to eliminate speech, ambient noise, rumbles, and background sounds
      const highPass = this.audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 800;

      // Bandpass filter centered strictly around sharp clap frequency (2400 Hz, Q=2.0)
      this.filterNode = this.audioCtx.createBiquadFilter();
      this.filterNode.type = 'bandpass';
      this.filterNode.frequency.value = 2400;
      this.filterNode.Q.value = 2.0; // Sharp quality factor to filter out non-clap audio

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.1;

      // Connect pipeline: source -> gain -> highPass -> bandpass -> analyser
      source.connect(this.gainNode);
      this.gainNode.connect(highPass);
      highPass.connect(this.filterNode);
      this.filterNode.connect(this.analyser);

      this.isListening = true;
      this.startTime = Date.now(); // Activation timestamp for 800ms grace period
      this._processAudioLoop();
      return true;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      throw err;
    }
  }

  stop() {
    this.isListening = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
    this.clapCount = 0;
  }

  setSensitivity(val) {
    this.sensitivity = Number(val);
  }

  setMode(mode) {
    this.mode = mode;
    this.clapCount = 0;
  }

  setDistancePreset(preset) {
    this.distancePreset = preset;
    this.updateDistanceGain();
  }

  updateDistanceGain() {
    if (!this.gainNode) return;
    // Calibrated pre-amp gain levels
    switch (this.distancePreset) {
      case '5ft':
        this.gainNode.gain.value = 1.0;
        break;
      case '10ft':
        this.gainNode.gain.value = 1.6;
        break;
      case '20ft':
      default:
        this.gainNode.gain.value = 2.4; // 2.4x gain provides long-range pickup without saturating noise
        break;
    }
  }

  _processAudioLoop() {
    if (!this.isListening || !this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const timeData = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(timeData);

    // Calculate RMS energy & Peak amplitude
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = timeData[i];
      const absVal = Math.abs(val);
      if (absVal > peak) peak = absVal;
      sumSq += val * val;
    }

    const rms = Math.sqrt(sumSq / bufferLength);
    const par = rms > 0.001 ? (peak / rms) : 0; // Peak-to-Average Ratio

    // Callback for visualization
    this.onAudioData(timeData, peak, rms);

    // Calculate dynamic threshold based on sensitivity slider (0-100)
    const sensFactor = (105 - this.sensitivity) / 100;
    const thresholdPeak = 0.42 * sensFactor; // Requires strong transient spike (real clap)
    const minPAR = 4.2; // Real claps have extremely sharp PAR ratio (> 4.2), continuous noise/talking is < 2.5

    const now = Date.now();
    const isGracePeriod = (now - (this.startTime || 0)) < 1000; // 1000ms activation grace period

    // Check transient clap signature (only process if alarm is not actively ringing and past grace period)
    if (!this.isAlarming && !isGracePeriod && peak > thresholdPeak && par > minPAR) {
      // Debounce rapid multi-frames of same clap (must be > 180ms apart)
      if (now - this.lastClapTime > 180) {
        this.lastClapTime = now;
        this.onPeakDetected(peak, par);

        if (this.mode === 'single') {
          this.onClapDetected({ time: now, count: 1 });
        } else if (this.mode === 'double') {
          this.clapCount++;
          if (this.clapCount === 1) {
            clearTimeout(this.clapWindowTimer);
            this.clapWindowTimer = setTimeout(() => {
              this.clapCount = 0;
            }, 1500);
          } else if (this.clapCount >= 2) {
            clearTimeout(this.clapWindowTimer);
            this.clapCount = 0;
            this.onClapDetected({ time: now, count: 2 });
          }
        } else {
          // Triple clap detection logic (3 distinct claps within 2000ms window)
          this.clapCount++;
          if (this.clapCount === 1) {
            clearTimeout(this.clapWindowTimer);
            this.clapWindowTimer = setTimeout(() => {
              this.clapCount = 0;
            }, 2000);
          } else if (this.clapCount >= 3) {
            clearTimeout(this.clapWindowTimer);
            this.clapCount = 0;
            this.onClapDetected({ time: now, count: 3 });
          }
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this._processAudioLoop());
  }
}
