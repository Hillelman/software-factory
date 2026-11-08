// Per-task notification preference, sound and OS notifications.

const key = (id: string) => `factory.notify.${id}`;

export function notificationsEnabled(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationsEnabled(id: string, enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(key(id));
    else localStorage.setItem(key(id), 'off');
  } catch {
    // Storage blocked: the toggle still applies until reload.
  }
}

let audio: AudioContext | null = null;

// Browsers only allow audio after a user gesture, so unlock on the first interaction.
export function unlockAudio(): void {
  if (audio) return;
  try {
    audio = new AudioContext();
  } catch {
    audio = null;
  }
}

const TONES: Record<string, number[]> = {
  error: [440, 330],
  stuck: [660, 660],
  approved: [523, 659],
  merged: [523, 659, 784],
};

export function chime(kind: string): void {
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const notes = TONES[kind] ?? [600];
  notes.forEach((freq, i) => {
    if (!audio) return;
    const t = audio.currentTime + i * 0.14;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  });
}

// The Notification API needs a secure context, so it works on localhost but not over plain-http LAN.
export const osNotificationsSupported = () => typeof Notification !== 'undefined' && window.isSecureContext;

export function requestOsNotifications(): void {
  if (osNotificationsSupported() && Notification.permission === 'default') void Notification.requestPermission();
}

export function osNotify(title: string, body: string): void {
  if (osNotificationsSupported() && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    new Notification(title, { body, tag: title });
  }
}
