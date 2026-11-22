/**
 * Screen Wake Lock & Background Listening Helper
 * Keeps Web Audio context active and prevents browser display sleep during monitoring.
 */
export class KeepAliveManager {
  constructor() {
    this.wakeLock = null;
    this.isSupported = 'wakeLock' in navigator;
  }

  async requestWakeLock() {
    if (!this.isSupported) {
      console.warn('Screen Wake Lock API not supported in this browser.');
      return false;
    }

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock activated.');

      this.wakeLock.addEventListener('release', () => {
        console.log('Screen Wake Lock released.');
      });

      return true;
    } catch (err) {
      console.error(`Wake Lock request failed: ${err.name}, ${err.message}`);
      return false;
    }
  }

  releaseWakeLock() {
    if (this.wakeLock !== null) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }
}
