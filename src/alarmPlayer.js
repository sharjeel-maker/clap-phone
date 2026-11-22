/**
 * Alarm Player & Ringtone Synthesizer
 * Generates high-pitch loud acoustic locator tones & handles vibration / visual flashing.
 */
export class AlarmPlayer {
  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    this.oscillator1 = null;
    this.oscillator2 = null;
    this.gainNode = null;
    this.soundType = 'siren'; // 'siren', 'ringtone', 'chime'
    this.volume = 1.0;
    this.strobeInterval = null;
  }

  setSoundType(type) {
    this.soundType = type;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.audioCtx.destination);

      if (this.soundType === 'siren') {
        this._playSirenPattern();
      } else if (this.soundType === 'ringtone') {
        this._playRingtonePattern();
      } else {
        this._playChimePattern();
      }

      // Trigger Device Vibration API if available
      if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 800]);
      }

      // Visual strobe flashing effect
      this._startStrobeEffect();

    } catch (e) {
      console.error('Failed to play alarm audio synthesizer:', e);
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.oscillator1) {
      try { this.oscillator1.stop(); } catch(e){}
    }
    if (this.oscillator2) {
      try { this.oscillator2.stop(); } catch(e){}
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
    if (this.strobeInterval) {
      clearInterval(this.strobeInterval);
      document.body.style.backgroundColor = '';
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  }

  _playSirenPattern() {
    this.oscillator1 = this.audioCtx.createOscillator();
    this.oscillator1.type = 'sawtooth';
    this.oscillator1.frequency.setValueAtTime(800, this.audioCtx.currentTime);

    // Frequency sweep between 800Hz and 1800Hz for high acoustic penetration
    const now = this.audioCtx.currentTime;
    for (let i = 0; i < 60; i += 0.8) {
      this.oscillator1.frequency.linearRampToValueAtTime(1800, now + i + 0.4);
      this.oscillator1.frequency.linearRampToValueAtTime(800, now + i + 0.8);
    }

    this.oscillator1.connect(this.gainNode);
    this.oscillator1.start();
  }

  _playRingtonePattern() {
    this.oscillator1 = this.audioCtx.createOscillator();
    this.oscillator2 = this.audioCtx.createOscillator();

    this.oscillator1.type = 'square';
    this.oscillator2.type = 'sine';

    this.oscillator1.frequency.setValueAtTime(1046.5, this.audioCtx.currentTime); // C6
    this.oscillator2.frequency.setValueAtTime(1318.5, this.audioCtx.currentTime); // E6

    this.oscillator1.connect(this.gainNode);
    this.oscillator2.connect(this.gainNode);

    this.oscillator1.start();
    this.oscillator2.start();
  }

  _playChimePattern() {
    this.oscillator1 = this.audioCtx.createOscillator();
    this.oscillator1.type = 'sine';
    this.oscillator1.frequency.setValueAtTime(1500, this.audioCtx.currentTime);

    this.oscillator1.connect(this.gainNode);
    this.oscillator1.start();
  }

  _startStrobeEffect() {
    let isRed = false;
    this.strobeInterval = setInterval(() => {
      if (!this.isPlaying) return;
      document.body.style.backgroundColor = isRed ? '#07090e' : '#450a0a';
      isRed = !isRed;
    }, 250);
  }
}
