import { spawn } from 'node:child_process';

function fire(cmd, args) {
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Notifications are best-effort; a missing notifier must never break the factory.
  }
}

// OS-level notification with sound. The dashboard shows its own toast from the event log.
export function notifyOs(title, message) {
  if (process.platform === 'darwin') {
    const esc = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    fire('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`]);
  } else if (process.platform === 'linux') {
    fire('notify-send', ['--urgency=critical', title, message]);
    fire('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga']);
  } else if (process.platform === 'win32') {
    const ps = `[console]::beep(880,300); Add-Type -AssemblyName System.Windows.Forms; ` +
      `$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Warning; $n.Visible = $true; ` +
      `$n.ShowBalloonTip(8000, '${title.replaceAll("'", "''")}', '${message.replaceAll("'", "''")}', 'Warning'); Start-Sleep 9`;
    fire('powershell', ['-NoProfile', '-Command', ps]);
  }
}
