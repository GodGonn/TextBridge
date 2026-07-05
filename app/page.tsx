"use client";

import { ArrowRight, Check, Plus, QrCode, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { cn, generateRoomCode } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

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

        <section className="rounded-xl border border-slate-800 bg-slate-950/90 p-5 shadow-soft backdrop-blur">
          <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-300">Ready room</p>
                <p className="mt-1 text-2xl font-bold tracking-[0.24em] text-white">A7K92P</p>
              </div>
              <div className="grid size-12 place-items-center rounded-lg border border-slate-700 bg-black text-white">
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
              "flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-black px-4 py-3 font-semibold text-white shadow-sm transition hover:border-slate-500 hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-70",
            )}
          >
            <Plus className="size-5" />
            {isCreating ? "Creating..." : "Create Room"}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-slate-800" />
            or join
            <span className="h-px flex-1 bg-slate-800" />
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
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-lg font-semibold uppercase tracking-[0.22em] text-white outline-none transition placeholder:tracking-normal placeholder:text-slate-500 focus:border-slate-500 focus:ring-4 focus:ring-slate-500/20"
            />
            <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 px-4 py-3 font-semibold text-slate-100 transition hover:border-slate-500 hover:text-white">
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
