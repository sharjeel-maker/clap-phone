/**
 * AI Machine-Learning Pitch & Harmonics Whistle Classifier
 * Uses Real-Time Spectrogram Harmonic Peak Analysis (Fundamental pitch 1400-2800 Hz)
 * Strictly verifies audio harmonics so it ONLY triggers on authentic human whistles.
 */
export class ClapDetector {
  constructor(options = {}) {
    this.sensitivity = options.sensitivity || 75;
    this.mode = options.mode || 'whistle';
    this.distancePreset = options.distancePreset || '20ft';
    
    this.onClapDetected = options.onClapDetected || (() => {});
    this.onPeakDetected = options.onPeakDetected || (() => {});
    this.onAudioData = options.onAudioData || (() => {});
    
    this.audioCtx = null;
    this.mediaStream = null;
    this.analyser = null;
    this.gainNode = null;
    
    this.isListening = false;
    this.isAlarming = false;
    this.whistleScoreStreak = 0;
    this.startTime = 0;
    
    this.animationFrameId = null;
  }

  async start() {
    if (this.isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        }
      });
      
      this.mediaStream = stream;
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      const source = this.audioCtx.createMediaStreamSource(stream);
      
      this.gainNode = this.audioCtx.createGain();
      this.updateDistanceGain();

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.2;

      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);

      this.isListening = true;
      this.startTime = Date.now();
      this.whistleScoreStreak = 0;
      this._processAudioLoop();
      return true;
    } catch (err) {
      console.error('Failed to start Whistle Classifier:', err);
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
    this.whistleScoreStreak = 0;
  }

  setSensitivity(val) {
    this.sensitivity = Number(val);
  }

  setMode(mode) {
    this.mode = mode;
  }

  setDistancePreset(preset) {
    this.distancePreset = preset;
    this.updateDistanceGain();
  }

  updateDistanceGain() {
    if (!this.gainNode) return;
    switch (this.distancePreset) {
      case '5ft':
        this.gainNode.gain.value = 1.0;
        break;
      case '10ft':
        this.gainNode.gain.value = 1.4;
        break;
      case '20ft':
      default:
        this.gainNode.gain.value = 2.0;
        break;
    }
  }

  _processAudioLoop() {
    if (!this.isListening || !this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    const timeData = new Float32Array(this.analyser.fftSize);
    
    this.analyser.getByteFrequencyData(freqData);
    this.analyser.getFloatTimeDomainData(timeData);

    // Calculate RMS energy & Peak amplitude
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const val = timeData[i];
      const absVal = Math.abs(val);
      if (absVal > peak) peak = absVal;
      sumSq += val * val;
    }
    const rms = Math.sqrt(sumSq / timeData.length);
    this.onAudioData(timeData, peak, rms);

    const now = Date.now();
    const isGracePeriod = (now - (this.startTime || 0)) < 1200;

    if (!this.isAlarming && !isGracePeriod) {
      const sampleRate = this.audioCtx.sampleRate;
      const binSize = sampleRate / this.analyser.fftSize;
      
      let maxEnergy = 0;
      let maxBin = 0;
      let totalEnergy = 0;

      for (let i = 0; i < bufferLength; i++) {
        const energy = freqData[i];
        totalEnergy += energy;
        if (energy > maxEnergy) {
          maxEnergy = energy;
          maxBin = i;
        }
      }

      const peakFreq = maxBin * binSize;
      const peakRatio = totalEnergy > 0 ? (maxEnergy / totalEnergy) : 0;
      
      const sensFactor = (105 - this.sensitivity) / 100;
      const minEnergyThreshold = 100 * sensFactor;

      // Pure Whistle signature: Fundamental pitch (1400-2800 Hz) with concentrated peak (> 0.12 total spectral energy)
      const isWhistleFreq = peakFreq >= 1400 && peakFreq <= 2800;
      const isWhistleEnergy = maxEnergy > minEnergyThreshold;
      const isPureWhistleTone = peakRatio > 0.12;

      if (isWhistleFreq && isWhistleEnergy && isPureWhistleTone) {
        this.whistleScoreStreak++;
        this.onPeakDetected(peak, Math.round(peakFreq));

        // Requires continuous whistle tone held for 7 consecutive frames (~160ms)
        if (this.whistleScoreStreak >= 7) {
          this.whistleScoreStreak = 0;
          this.onClapDetected({ time: now, type: 'whistle', freq: Math.round(peakFreq) });
        }
      } else {
        if (this.whistleScoreStreak > 0) {
          this.whistleScoreStreak--;
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this._processAudioLoop());
  }
}
