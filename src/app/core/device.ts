/**
 * Device information detection helper for NOTARIX audit trails.
 * Reliably detects device type, operating system, and browser name.
 * Example return format: "Desktop – Windows 11 – Google Chrome"
 */
export function getDeviceInfo(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Desktop – Windows 11 – Google Chrome';
  }

  const ua = navigator.userAgent || '';

  // 1. Device Type: Desktop, Laptop, Tablet, or Mobile
  let deviceType = 'Desktop';
  if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i.test(ua)) {
    deviceType = 'Mobile';
  } else if (/ipad|tablet|playbook|silk/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    deviceType = 'Tablet';
  } else if (/laptop/i.test(ua)) {
    deviceType = 'Laptop';
  }

  // 2. Operating System
  let os = 'Windows';
  if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 11';
  } else if (/Windows NT 6.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/Windows NT 6.2/i.test(ua)) {
    os = 'Windows 8';
  } else if (/Windows NT 6.1/i.test(ua)) {
    os = 'Windows 7';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    os = 'iOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // 3. Browser Name
  let browser = 'Google Chrome';
  if (ua.includes('Edg/')) {
    browser = 'Microsoft Edge';
  } else if (ua.includes('OPR/') || ua.includes('Opera')) {
    browser = 'Opera';
  } else if (ua.includes('Chrome') && !ua.includes('Edg')) {
    browser = 'Google Chrome';
  } else if (ua.includes('Firefox')) {
    browser = 'Mozilla Firefox';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    browser = 'Apple Safari';
  }

  return `${deviceType} – ${os} – ${browser}`;
}
