import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(value))
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let size = bytes / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function detectMessageType(text: string) {
  if (/^https?:\/\//i.test(text.trim())) return "link"
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())) return "email"
  if (/^\+?[\d\s().-]{8,}$/.test(text.trim())) return "phone"
  if (/[{};]|```|\b(const|let|function|class|import|SELECT)\b/i.test(text)) return "code"
  return "text"
}
