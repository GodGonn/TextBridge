"use client";

import { ArrowRight, Check, Copy, FileUp, Moon, Plus, QrCode, Smartphone, Sun, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { cn, generateRoomCode } from "@/lib/utils";

const steps = [
  { icon: QrCode, title: "Create a room", detail: "สร้างห้องแล้วแชร์รหัสหรือ QR Code" },
  { icon: Smartphone, title: "Open on another device", detail: "มือถือกับคอมเข้าห้องเดียวกัน" },
  { icon: Copy, title: "Send and copy", detail: "ส่งข้อความ ไฟล์ แล้วคัดลอกได้ทันที" },
];

const supports = ["Text", "Links", "Code", "Images", "PDF", "ZIP"];

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
        setError("สร้างห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
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
    <main className="min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-slate-950 text-white shadow-soft dark:bg-white dark:text-slate-950">
              <Zap className="size-5" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">TextBridge</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Instant device handoff</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm backdrop-blur transition hover:border-bridge-500 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.03fr_0.97fr] lg:py-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-bridge-100 bg-white/80 px-3 py-1.5 text-sm font-medium text-bridge-700 shadow-sm backdrop-blur dark:border-bridge-500/20 dark:bg-slate-950/80 dark:text-bridge-100">
              <FileUp className="size-4" />
              ส่งข้อความ ลิงก์ โค้ด และไฟล์ ระหว่างมือถือกับคอม
            </div>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-6xl">
              Bridge anything you need to move.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              เปิดห้องเดียวกันบนอุปกรณ์สองเครื่อง แล้วส่งข้อความ รูป PDF ZIP หรือโค้ดได้ทันที ไม่ต้องส่งผ่านแชตส่วนตัวอีกต่อไป
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {supports.map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/75">
                    <div className="flex items-center gap-2">
                      <div className="grid size-8 place-items-center rounded-md bg-bridge-50 text-bridge-700 dark:bg-bridge-500/10 dark:text-bridge-100">
                        <Icon className="size-4" />
                      </div>
                      <span className="text-xs font-semibold text-slate-400">0{index + 1}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{step.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/90 p-5 shadow-soft backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
            <div className="mb-5 rounded-lg bg-slate-950 p-4 text-white dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">Ready room</p>
                  <p className="mt-1 text-2xl font-bold tracking-[0.22em]">A7K92P</p>
                </div>
                <div className="grid size-12 place-items-center rounded-lg bg-bridge-500">
                  <QrCode className="size-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-200">
                <Check className="size-4" />
                Realtime sync with Supabase
              </div>
            </div>

            <button
              onClick={createRoom}
              disabled={isCreating}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg bg-bridge-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-bridge-700 disabled:cursor-not-allowed disabled:opacity-70",
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

            <p className="mt-5 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {isSupabaseConfigured
                ? "Supabase พร้อมใช้งาน ถ้าเชื่อมต่อไม่ได้ระบบจะ fallback เป็น local network ให้อัตโนมัติ"
                : "Local network mode: ใช้งานได้เมื่ออุปกรณ์อยู่ Wi-Fi เดียวกัน"}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
