import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Android Foreground Service & Local Notifications Manager
 * Manages sticky notification & background wake-lock for 24/7 clap listening
 */
export class KeepAliveManager {
  constructor() {
    this.wakeLock = null;
    this.isSupported = 'wakeLock' in navigator;
    this.isForegroundServiceActive = false;
  }

  async requestPermissions() {
    try {
      if (LocalNotifications) {
        const status = await LocalNotifications.checkPermissions();
        if (status.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      }
    } catch (e) {
      console.warn('LocalNotifications permission request warning:', e);
    }
  }

  async requestWakeLock() {
    await this.requestPermissions();

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
          title: 'Clap Phone Finder Active 👏',
          body: 'App is running in background and listening for claps...',
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

    // Also send an explicit Local Push Notification so user sees the notification immediately in shade
    try {
      if (LocalNotifications) {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: 'Clap Phone Finder Active 👏',
              body: 'Running in background. Clap 2 times anytime to ring your lost phone!',
              id: 9999,
              schedule: { at: new Date(Date.now() + 500) },
              sound: null,
              ongoing: true
            }
          ]
        });
      }
    } catch (e) {}
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

    try {
      if (LocalNotifications) {
        await LocalNotifications.cancel({ notifications: [{ id: 9999 }] });
      }
    } catch (e) {}
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
