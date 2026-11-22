import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

/**
 * Android Foreground Service Manager
 * Manages sticky notification & background wake-lock for 24/7 clap listening
 */
export class KeepAliveManager {
  constructor() {
    this.wakeLock = null;
    this.isSupported = 'wakeLock' in navigator;
    this.isForegroundServiceActive = false;
  }

  async requestWakeLock() {
    if (this.isSupported) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake Lock request warning:', err);
      }
    }
    await this.startForegroundService();
  }

  async releaseWakeLock() {
    if (this.wakeLock !== null) {
      try {
        await this.wakeLock.release();
      } catch (e) {}
      this.wakeLock = null;
    }
    await this.stopForegroundService();
  }

  async startForegroundService() {
    try {
      if (ForegroundService) {
        await ForegroundService.start({
          id: 1001,
          title: 'Clap Phone Finder Active',
          body: 'Listening in background... Clap to ring phone.',
          smallIcon: 'ic_launcher',
          buttons: [
            {
              id: 'stop_service',
              title: 'Stop Listening'
            }
          ]
        });
        this.isForegroundServiceActive = true;
      }
    } catch (e) {
      console.warn('Foreground service start error (Web platform fallback):', e);
    }
  }

  async stopForegroundService() {
    try {
      if (ForegroundService && this.isForegroundServiceActive) {
        await ForegroundService.stop();
        this.isForegroundServiceActive = false;
      }
    } catch (e) {
      console.warn('Foreground service stop error:', e);
    }
  }

  onNotificationAction(callback) {
    try {
      if (ForegroundService) {
        ForegroundService.addListener('buttonClicked', (event) => {
          if (event.action === 'stop_service' || event.id === 'stop_service') {
            callback();
          }
        });
      }
    } catch (e) {}
  }
}
