"use client";

import { ArrowRight, Check, Plus, QrCode, Shuffle, Zap } from "lucide-react";
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

    try {
      if (isSupabaseConfigured && supabase) {
        const { error: insertError } = await supabase.from("rooms").insert({ code });
        if (!insertError) {
          router.push(`/room/${code}`);
          return;
        }
      }

      const room = await createLocalRoom(code);
      router.push(`/room/${room.code}`);
    } catch {
      try {
        const room = await createLocalRoom(code);
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
          <div className="mx-auto grid size-12 place-items-center rounded-lg border border-slate-700 bg-black text-slate-100 shadow-soft">
            <Zap className="size-5" />
          </div>
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
              <div className="grid size-12 place-items-center rounded-lg border border-neutral-700 bg-black/70 text-white">
                <QrCode className="size-6" />
              </div>
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
    </main>
  );
}
