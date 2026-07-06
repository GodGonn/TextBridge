"use client";

import { ArrowRight, BookOpen, Check, MonitorSmartphone, Plus, Shuffle, TabletSmartphone, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { cn, generateRoomCode } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [error, setError] = useState("");

  async function createLocalRoom(code: string) {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) throw new Error("Create room failed");
    return (await response.json()) as { code: string };
  }

  function randomizeRoomCode() {
    setError("");
    setIsRandomizing(true);
    let steps = 0;

    const intervalId = window.setInterval(() => {
      steps += 1;
      setSelectedRoomCode(generateRoomCode());

      if (steps >= 16) {
        window.clearInterval(intervalId);
        setSelectedRoomCode(generateRoomCode());
        setIsRandomizing(false);
      }
    }, 55);
  }

  async function createRoom() {
    if (!selectedRoomCode || isRandomizing) {
      setError("สุ่มหมายเลขห้องก่อนสร้างห้อง");
      return;
    }

    setIsCreating(true);
    setError("");
    const code = selectedRoomCode;
    const loadingDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 900));

    try {
      if (isSupabaseConfigured && supabase) {
        const { error: insertError } = await supabase.from("rooms").insert({ code });
        if (!insertError) {
          await loadingDelay;
          router.push(`/room/${code}`);
          return;
        }
      }

      const room = await createLocalRoom(code);
      await loadingDelay;
      router.push(`/room/${room.code}`);
    } catch {
      try {
        const room = await createLocalRoom(code);
        await loadingDelay;
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
    <main className="relative isolate grid min-h-screen overflow-hidden px-4 py-6 font-mono text-white">
      <GridBackground size={32} />

      <div className="mx-auto flex w-full max-w-xl flex-col justify-center">
        <header className="mb-7 text-center">
          <TextBridgeMark />
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">TextBridge</h1>
          <p className="mt-2 text-sm text-slate-400">Send text and files between your devices instantly.</p>
        </header>

        <section className="rounded-xl border border-neutral-700/70 bg-neutral-950/55 p-5 shadow-soft backdrop-blur-md">
          <div className="mb-5 rounded-lg border border-neutral-700/70 bg-neutral-800/30 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-neutral-300">{selectedRoomCode ? "Ready room" : "Random room"}</p>
                <p
                  className={cn(
                    "mt-1 flex h-8 items-center gap-1 text-2xl font-bold tracking-[0.24em] text-white",
                    isRandomizing && "text-neutral-200",
                  )}
                >
                  {(selectedRoomCode || "------").split("").map((character, index) => (
                    <span
                      key={`${character}-${index}`}
                      className={cn("inline-block", isRandomizing && "animate-bounce")}
                      style={{ animationDelay: `${index * 45}ms` }}
                    >
                      {character}
                    </span>
                  ))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="grid size-12 place-items-center rounded-lg border border-neutral-700 bg-black/70 text-white transition hover:border-neutral-500 hover:bg-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-500/20"
                aria-label="Open usage guide"
              >
                <BookOpen className="size-6" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-200">
              <Check className="size-4" />
              {selectedRoomCode ? "Room number ready" : "Randomize a room number first"}
            </div>
          </div>

          <button
            type="button"
            onClick={randomizeRoomCode}
            disabled={isRandomizing || isCreating}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700/70 bg-neutral-950/30 px-4 py-3 font-semibold text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Shuffle className={cn("size-5", isRandomizing && "animate-spin")} />
            {isRandomizing ? "Randomizing..." : selectedRoomCode ? "Randomize Again" : "Randomize Room Number"}
          </button>

          <button
            onClick={createRoom}
            disabled={isCreating || isRandomizing || !selectedRoomCode}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950/60 px-4 py-3 font-semibold text-white shadow-sm transition hover:border-neutral-500 hover:bg-neutral-900/60 disabled:cursor-not-allowed disabled:opacity-70",
            )}
          >
            <Plus className="size-5" />
            {isCreating ? "Creating..." : "Create Room"}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-neutral-800" />
            or join
            <span className="h-px flex-1 bg-neutral-800" />
          </div>

          <form onSubmit={joinRoom} className="space-y-3">
            <label className="block text-sm font-medium text-slate-200" htmlFor="room-code">
              Enter Room Code
            </label>
            <input
              id="room-code"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="A7K92P"
              className="w-full rounded-lg border border-neutral-700/70 bg-neutral-800/30 px-4 py-3 text-lg font-semibold uppercase tracking-[0.22em] text-white outline-none backdrop-blur-sm transition placeholder:tracking-normal placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-4 focus:ring-neutral-500/20"
            />
            <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700/70 bg-neutral-950/30 px-4 py-3 font-semibold text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900/40 hover:text-white">
              Join Room
              <ArrowRight className="size-4" />
            </button>
          </form>

          {error ? <p className="mt-4 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        </section>
      </div>

      {isGuideOpen ? <UsageGuide onClose={() => setIsGuideOpen(false)} /> : null}
      {isCreating ? <CreatingRoomLoading code={selectedRoomCode} /> : null}
    </main>
  );
}

function CreatingRoomLoading({ code }: { code: string }) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/80 px-4 py-6 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-xl border border-neutral-700/70 bg-neutral-950/95 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-24 w-56 items-center justify-center">
          <div className="relative flex w-full items-center justify-between">
            <div className="grid size-14 place-items-center rounded-lg border border-neutral-600 bg-neutral-900">
              <MonitorSmartphone className="size-7 text-neutral-100" />
            </div>

            <div className="relative mx-3 h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
              <span className="absolute inset-y-0 left-0 w-1/2 animate-[bridge-load_1.1s_ease-in-out_infinite] rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.85)]" />
            </div>

            <div className="grid size-14 place-items-center rounded-lg border border-emerald-300/60 bg-neutral-900 shadow-[0_0_28px_rgba(52,211,153,0.16)]">
              <TabletSmartphone className="size-7 text-emerald-200" />
            </div>

            <span className="absolute left-[4.25rem] top-1/2 size-2 -translate-y-1/2 animate-ping rounded-full bg-emerald-300" />
            <span className="absolute right-[4.25rem] top-1/2 size-2 -translate-y-1/2 animate-pulse rounded-full bg-emerald-200" />
          </div>
        </div>

        <h2 className="mt-2 text-xl font-bold text-white">กำลังสร้างห้อง</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-400">เตรียมห้อง {code} และเชื่อมอุปกรณ์ของคุณ</p>

        <div className="mt-5 flex justify-center gap-2">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="size-2 animate-bounce rounded-full bg-emerald-300"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageGuide({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      title: "สร้างห้อง",
      body: "กด Randomize Room Number เพื่อสุ่มรหัสห้อง แล้วกด Create Room เพื่อเข้าใช้งาน",
    },
    {
      title: "เปิดอีกเครื่อง",
      body: "ใช้มือถือ คอม หรือ iPad เปิดเว็บเดียวกัน จากนั้นกรอกรหัสห้องหรือสแกน QR ในหน้าห้อง",
    },
    {
      title: "ส่งข้อความและไฟล์",
      body: "วางข้อความ ลิงก์ โค้ด หรืออัปโหลดไฟล์ ทุกอุปกรณ์ในห้องเดียวกันจะเห็น timeline เดียวกัน",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-guide-title"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-950/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <TabletSmartphone className="size-4" />
              ใช้ได้ทุกอุปกรณ์
            </div>
            <h2 id="usage-guide-title" className="mt-2 text-xl font-bold text-white">
              วิธีใช้ TextBridge
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-neutral-700/70 text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-900 hover:text-white"
            aria-label="Close usage guide"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-lg border border-neutral-700/70 bg-neutral-800/30 p-4">
              <div className="grid size-9 place-items-center rounded-lg bg-neutral-950/70 text-sm font-bold text-emerald-200">
                {index + 1}
              </div>
              <h3 className="mt-3 font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-800 px-5 py-4">
          <div className="flex items-start gap-3 rounded-lg bg-neutral-900/50 p-3 text-sm leading-6 text-neutral-300">
            <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-emerald-200" />
            <p>เหมาะสำหรับส่งข้อความหรือไฟล์ระหว่างมือถือ คอมพิวเตอร์ และ iPad โดยไม่ต้องล็อกอิน</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextBridgeMark() {
  return (
    <svg
      className="mx-auto size-20 overflow-visible"
      viewBox="0 0 80 80"
      role="img"
      aria-label="TextBridge logo"
    >
      <defs>
        <linearGradient id="bridge-stroke" x1="12" y1="18" x2="68" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fafafa" />
          <stop offset="1" stopColor="#a3a3a3" />
        </linearGradient>
        <linearGradient id="bridge-accent" x1="18" y1="20" x2="62" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d4d4d4" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <path
        d="M28 31C34 25 46 25 52 31M28 49C34 55 46 55 52 49"
        fill="none"
        stroke="url(#bridge-stroke)"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M32 40H48"
        fill="none"
        stroke="url(#bridge-accent)"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <rect
        x="13"
        y="23"
        width="22"
        height="34"
        rx="6"
        fill="#0a0a0a"
        stroke="#d4d4d4"
        strokeWidth="2"
      />
      <rect
        x="45"
        y="23"
        width="22"
        height="34"
        rx="6"
        fill="#0a0a0a"
        stroke="#d4d4d4"
        strokeWidth="2"
      />
      <path d="M20 32H28M20 38H29M20 44H26" stroke="#fafafa" strokeLinecap="round" strokeWidth="2" />
      <path d="M52 32H60M51 38H60M54 44H60" stroke="#fafafa" strokeLinecap="round" strokeWidth="2" />
      <circle cx="24" cy="51" r="1.8" fill="#34d399" />
      <circle cx="56" cy="51" r="1.8" fill="#34d399" />
    </svg>
  );
}
