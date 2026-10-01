"use client";

// Web Audio API Synthesizer - 100% self-contained, zero external audio files
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

const SOUND_PREF_KEY = "textbridge:sound-enabled";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(SOUND_PREF_KEY);
  return saved === null ? true : saved === "true";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_PREF_KEY, String(enabled));
}

export function triggerHaptic(duration = 15): void {
  if (typeof window !== "undefined" && "vibrate" in navigator && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(duration);
    } catch {
      // Ignore vibration errors if blocked by permissions
    }
  }
}

/**
 * Pleasant rising digital swoosh / blip when sending text or file
 */
export function playSendSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(780, now + 0.1);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.13);
}

/**
 * Soft crystal double-chime when receiving a message/file from another device
 */
export function playReceiveSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1 (High bell)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(659.25, now); // E5

  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.exponentialRampToValueAtTime(0.13, now + 0.015);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);

  osc1.start(now);
  osc1.stop(now + 0.13);

  // Tone 2 (Higher crystal ping)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(987.77, now + 0.06); // B5

  gain2.gain.setValueAtTime(0.001, now + 0.06);
  gain2.gain.exponentialRampToValueAtTime(0.14, now + 0.075);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now + 0.06);
  osc2.stop(now + 0.29);

  triggerHaptic(25);
}

/**
 * Crisp mechanical snap / click on copy to clipboard
 */
export function playCopySound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.05);

  triggerHaptic(12);
}

/**
 * Harmonious subtle chord when peer devices connect
 */
export function playConnectSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + index * 0.04);

    gain.gain.setValueAtTime(0.001, now + index * 0.04);
    gain.gain.exponentialRampToValueAtTime(0.06, now + index * 0.04 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.04 + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + index * 0.04);
    osc.stop(now + index * 0.04 + 0.23);
  });
}

