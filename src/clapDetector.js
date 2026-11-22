/**
 * AI Ultra-Precision Whistle & Single-Frequency Classifier
 * Isolates single peak pitch target (e.g. ~1800 Hz pitch tone) with high spectral purity (> 0.25).
 * Prevents false positives from ambient noise or small sounds.
 */
export class ClapDetector {
  constructor(options = {}) {
    this.sensitivity = options.sensitivity || 75;
    this.targetFreq = options.targetFreq || 1800; // Target single whistle frequency bin (Hz)
    this.freqTolerance = options.freqTolerance || 250; // Allowed variance: +/- 250 Hz (1550 - 2050 Hz)
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
          autoGainControl: false, // Turn off AGC to avoid amplifying background whispers/small sounds
        }
      });
      
      this.mediaStream = stream;
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      const source = this.audioCtx.createMediaStreamSource(stream);
      
      this.gainNode = this.audioCtx.createGain();
      this.updateDistanceGain();

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 4096; // Higher FFT resolution (~10.7 Hz per bin at 44.1kHz)
      this.analyser.smoothingTimeConstant = 0.3;

      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);

      this.isListening = true;
      this.startTime = Date.now();
      this.whistleScoreStreak = 0;
      this._processAudioLoop();
      return true;
    } catch (err) {
      console.error('Failed to start Ultra-Precision Whistle Classifier:', err);
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

  setTargetFreq(freq) {
    this.targetFreq = Number(freq);
  }

  setDistancePreset(preset) {
    this.distancePreset = preset;
    this.updateDistanceGain();
  }

  updateDistanceGain() {
    if (!this.gainNode) return;
    switch (this.distancePreset) {
      case '5ft':
        this.gainNode.gain.value = 0.8;
        break;
      case '10ft':
        this.gainNode.gain.value = 1.0;
        break;
      case '20ft':
      default:
        this.gainNode.gain.value = 1.2;
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
    const isGracePeriod = (now - (this.startTime || 0)) < 1500;

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
      
      // Sensitivity thresholding
      const sensFactor = (100 - this.sensitivity) / 100;
      const minEnergyThreshold = 140 + (sensFactor * 60); // Requires strong clear signal (140-200 amplitude out of 255)

      // Strict Single Frequency Match (Target: 1800 Hz +/- 250 Hz -> 1550Hz to 2050Hz)
      const minFreq = this.targetFreq - this.freqTolerance;
      const maxFreq = this.targetFreq + this.freqTolerance;
      const isTargetFrequency = peakFreq >= minFreq && peakFreq <= maxFreq;

      // Requires high spectral purity (> 0.25 of total spectrum in single frequency bin)
      const isPureSingleFrequencyTone = peakRatio >= 0.25;
      const isAboveNoiseFloor = maxEnergy >= minEnergyThreshold;

      if (isTargetFrequency && isPureSingleFrequencyTone && isAboveNoiseFloor) {
        this.whistleScoreStreak++;
        this.onPeakDetected(peakRatio, Math.round(peakFreq));

        // Must sustain single tone for 10 continuous frames (~250ms)
        if (this.whistleScoreStreak >= 10) {
          this.whistleScoreStreak = 0;
          this.onClapDetected({ time: now, type: 'single_frequency', freq: Math.round(peakFreq) });
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
