"use client";

import { ArrowRight, Moon, Plus, Smartphone, Sun, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { cn, generateRoomCode } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("textbridge-theme");
    const shouldUseDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("textbridge-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  async function createLocalRoom() {
    const response = await fetch("/api/rooms", { method: "POST" });
    if (!response.ok) throw new Error("Create room failed");
    return (await response.json()) as { code: string };
  }

  async function createRoom() {
    setIsCreating(true);
    setError("");
    const code = generateRoomCode();

    try {
      if (isSupabaseConfigured && supabase) {
        const { error: insertError } = await supabase.from("rooms").insert({ code });
        if (!insertError) {
          router.push(`/room/${code}`);
          return;
        }
      }

      const room = await createLocalRoom();
      router.push(`/room/${room.code}`);
    } catch {
      try {
        const room = await createLocalRoom();
        router.push(`/room/${room.code}`);
      } catch {
        setError("สร้างห้องไม่สำเร็จ");
        setIsCreating(false);
      }
    }
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      setError("กรุณากรอก Room Code ให้ถูกต้อง");
      return;
    }
    router.push(`/room/${code}`);
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-bridge-600 text-white shadow-soft">
              <Zap className="size-5" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">TextBridge</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Mobile to desktop in seconds</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-bridge-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-bridge-100 bg-white px-3 py-1 text-sm text-bridge-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-bridge-100">
              <Smartphone className="size-4" />
              ส่งข้อความและไฟล์ระหว่างมือถือกับคอมได้ทันที
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
              TextBridge
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-300">
              เว็บสำหรับฝากข้อความ ลิงก์ โค้ด รูป หรือไฟล์จากอุปกรณ์หนึ่งไปยังอีกอุปกรณ์ โดยไม่ต้องส่งผ่านแชตส่วนตัวหรือคนรู้จัก
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["Create Room", "Scan or open link", "Copy instantly"].map((label, index) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                  <p className="text-sm font-semibold text-bridge-700 dark:text-bridge-100">0{index + 1}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950">
            <button
              onClick={createRoom}
              disabled={isCreating}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg bg-bridge-600 px-4 py-3 font-semibold text-white transition hover:bg-bridge-700 disabled:cursor-not-allowed disabled:opacity-70",
              )}
            >
              <Plus className="size-5" />
              {isCreating ? "Creating..." : "Create Room"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              or join
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <form onSubmit={joinRoom} className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="room-code">
                Enter Room Code
              </label>
              <input
                id="room-code"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                placeholder="A7K92P"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-lg font-semibold uppercase tracking-[0.22em] outline-none transition placeholder:tracking-normal focus:border-bridge-500 focus:ring-4 focus:ring-bridge-100 dark:border-slate-800 dark:bg-slate-900 dark:focus:ring-bridge-500/20"
              />
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 font-semibold text-slate-800 transition hover:border-bridge-500 hover:text-bridge-700 dark:border-slate-800 dark:text-slate-100 dark:hover:text-bridge-100">
                Join Room
                <ArrowRight className="size-4" />
              </button>
            </form>

            {error ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>
            ) : null}

            <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
              {isSupabaseConfigured
                ? "Supabase is configured. Local network fallback is ready if Supabase is unavailable."
                : "Local network mode: devices on the same Wi-Fi can use this computer as the bridge."}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
