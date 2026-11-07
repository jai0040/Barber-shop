/**
 * Synthesizes a gentle, melodic two-tone notification chime using the standard
 * Web Audio API. Zero external audio file dependencies; works 100% offline in PWAs.
 */

export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;

  // Check if sound is muted by user preference
  const isMuted = localStorage.getItem('barber_sound_enabled') === 'false';
  if (isMuted) return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz) - bright bell-like sine wave
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.32);

    // Tone 2: B5 (987.77 Hz) - harmonic resolution chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.11);
    gain2.gain.setValueAtTime(0.15, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.11);
    osc2.stop(now + 0.52);
  } catch {
    // Browsers safely suppress audio if the user has not interacted with the page yet
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('barber_sound_enabled') !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('barber_sound_enabled', enabled ? 'true' : 'false');
}
