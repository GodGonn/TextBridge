import type { DeviceProfile } from "@/lib/types";

const DEVICE_PROFILE_KEY = "textbridge-device-profile:v1";
const DEFAULT_ROOM_KEY = "textbridge-default-room:v1";
const colors = ["#34d399", "#60a5fa", "#a78bfa", "#fb7185", "#fbbf24", "#22d3ee"];

function isDeviceProfile(value: unknown): value is DeviceProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<DeviceProfile>;
  return Boolean(
    profile.id && /^[0-9a-f-]{36}$/i.test(profile.id) &&
    profile.name && profile.name.trim().length <= 32 &&
    profile.color && /^#[0-9a-f]{6}$/i.test(profile.color),
  );
}

export function getDeviceProfile(): DeviceProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEVICE_PROFILE_KEY) ?? "null") as unknown;
    return isDeviceProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createDeviceProfile(name: string): DeviceProfile {
  const profile = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 32) || "Guest device",
    color: colors[Math.floor(Math.random() * colors.length)],
  };
  saveDeviceProfile(profile);
  return profile;
}

export function saveDeviceProfile(profile: DeviceProfile) {
  window.localStorage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(profile));
}

export function getDefaultRoomCode() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DEFAULT_ROOM_KEY) ?? "";
}

export function setDefaultRoomCode(code: string) {
  window.localStorage.setItem(DEFAULT_ROOM_KEY, code.trim().toUpperCase());
}

export function getDeviceHeaders(profile: DeviceProfile | null): Record<string, string> {
  if (!profile) return {};
  return {
    "x-device-id": profile.id,
    "x-device-name": encodeURIComponent(profile.name),
    "x-device-color": profile.color,
  };
}
