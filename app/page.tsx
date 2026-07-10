"use client";

import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  LogIn,
  Lock,
  MonitorSmartphone,
  Plus,
  Shuffle,
  TabletSmartphone,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, FormEvent, useEffect, useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { AuthButton } from "@/components/auth-button";
import { cn, generateRoomCode } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuthSession } from "@/lib/use-auth";
import type { RoomView } from "@/lib/types";

const expiryOptions = [
  { label: "10 min", value: 10 },
  { label: "1 hour", value: 60 },
  { label: "24 hours", value: 1440 },
  { label: "Never", value: 0 },
];

export default function HomePage() {
  const router = useRouter();
  const auth = useAuthSession();
  const [roomCode, setRoomCode] = useState("");
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState(60);
  const [error, setError] = useState("");
  const [myRooms, setMyRooms] = useState<RoomView[]>([]);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [savedRoomsError, setSavedRoomsError] = useState("");

  useEffect(() => {
    if (!auth.session) {
      setMyRooms([]);
      return;
    }

    void fetch("/api/rooms/mine", { headers: { Authorization: `Bearer ${auth.session.access_token}` } })
      .then((response) => response.ok ? response.json() : [])
      .then((rooms: RoomView[]) => setMyRooms(rooms));
  }, [auth.session]);

  async function removeRoomFromSaved(room: RoomView) {
    if (!auth.session || deletingRoomId) return;

    setDeletingRoomId(room.id);
    setSavedRoomsError("");
    const response = await fetch(`/api/rooms/mine/${room.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.session.access_token}` },
    });

    if (response.ok) {
      setMyRooms((rooms) => rooms.filter((savedRoom) => savedRoom.id !== room.id));
    } else {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setSavedRoomsError(payload.error ?? "Could not remove the saved room.");
    }
    setDeletingRoomId(null);
  }

  async function createRoom() {
    if (!selectedRoomCode || isRandomizing) {
      setError("Randomize a room code before creating a room.");
      return;
    }

    if (isPrivate && roomPassword.trim().length < 4) {
      setError("Private rooms need a password with at least 4 characters.");
      return;
    }

    setIsCreating(true);
    setError("");

    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth.session ? { Authorization: `Bearer ${auth.session.access_token}` } : {}),
      },
      body: JSON.stringify({
        code: selectedRoomCode,
        isPrivate,
        password: isPrivate ? roomPassword.trim() : null,
        expiresInMinutes,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Could not create room.");
      setIsCreating(false);
      return;
    }

    const room = (await response.json()) as { code: string };
    if (isPrivate && roomPassword.trim()) {
      window.sessionStorage.setItem(`textbridge-room-password:${room.code}`, roomPassword.trim());
    }
    router.push(`/room/${room.code}`);
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

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      setError("Please enter a valid room code.");
      return;
    }
    router.push(`/room/${code}`);
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-6 font-mono text-th-text">
      <GridBackground size={32} />

      <div className="mx-auto grid w-full max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="mx-auto flex w-full max-w-xl flex-col justify-center xl:max-w-none">
          <header className="mb-7 text-center">
            <div className="flex items-center justify-end gap-2"><AuthButton /><ThemeToggle /></div>
            <TextBridgeMark />
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-th-text sm:text-5xl">TextBridge</h1>
            <p className="mt-2 text-sm text-th-text-muted">Send text and files between your devices instantly.</p>
          </header>

          <section className="rounded-xl border border-th-border/70 bg-th-card/55 p-5 shadow-soft backdrop-blur-md">
            <div className="mb-5 rounded-lg border border-th-border/70 bg-th-inner/30 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-th-text-muted">{selectedRoomCode ? "Ready room" : "Random room"}</p>
                <p
                  className={cn(
                    "mt-1 flex h-8 items-center gap-1 text-2xl font-bold tracking-[0.24em] text-th-text",
                    isRandomizing && "text-th-text-sub",
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
                className="group relative grid size-12 place-items-center overflow-hidden rounded-lg border border-th-border bg-th-overlay/70 text-th-text transition hover:animate-[guide-button-hover_720ms_ease-in-out_infinite] hover:border-th-accent/70 hover:bg-th-elevated active:scale-95 focus:outline-none focus:ring-4 focus:ring-th-border-strong/20"
                aria-label="Open usage guide"
              >
                <span className="absolute inset-0 rounded-lg bg-emerald-300/0 transition group-hover:animate-[guide-button-glow_720ms_ease-in-out_infinite]" />
                <BookOpen
                  className="relative size-6 transition-transform group-hover:animate-[guide-icon-hover_720ms_ease-in-out_infinite]"
                />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-th-accent-text">
              <Check className="size-4" />
              {selectedRoomCode ? "Room code ready" : "Randomize a room number first"}
            </div>
            </div>

            <button
              type="button"
              onClick={randomizeRoomCode}
              disabled={isRandomizing || isCreating}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-th-border/70 bg-th-card/30 px-4 py-3 font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Shuffle className={cn("size-5", isRandomizing && "animate-spin")} />
              {isRandomizing ? "Randomizing..." : selectedRoomCode ? "Randomize Again" : "Randomize Room Number"}
            </button>

            <div className="mb-3 grid gap-3 rounded-lg border border-th-border/70 bg-th-card/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-th-text">Privacy controls</p>
                  <p className="mt-1 text-xs leading-5 text-th-text-muted">Turn on a password when the room should stay private.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isPrivate;
                    setIsPrivate(next);
                    if (!next) setRoomPassword("");
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition",
                    isPrivate
                      ? "border-th-accent/70 bg-th-accent-soft/15 text-th-accent-text"
                      : "border-th-border bg-th-elevated/60 text-th-text-sub",
                  )}
                >
                  {isPrivate ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                  {isPrivate ? "Private" : "Open"}
                </button>
              </div>

              {isPrivate ? (
                <input
                  value={roomPassword}
                  onChange={(event) => setRoomPassword(event.target.value)}
                  type="password"
                  placeholder="Room password"
                  className="w-full rounded-lg border border-th-border/70 bg-th-inner/30 px-4 py-3 text-th-text-sub outline-none transition placeholder:text-th-text-faint focus:border-th-border-strong focus:ring-4 focus:ring-th-border-strong/20"
                />
              ) : null}

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-th-text">
                  <Clock3 className="size-4" />
                  Auto-expire
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {expiryOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setExpiresInMinutes(option.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition",
                        expiresInMinutes === option.value
                          ? "border-th-accent/70 bg-th-accent-soft/15 text-th-accent-text"
                          : "border-th-border bg-th-elevated/40 text-th-text-muted hover:border-th-border-strong hover:text-th-text",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={createRoom}
              disabled={isCreating || isRandomizing || !selectedRoomCode}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-th-border bg-th-card/60 px-4 py-3 font-semibold text-th-text shadow-sm transition hover:border-th-border-strong hover:bg-th-elevated/60 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Plus className="size-5" />
              {isCreating ? "Creating..." : "Create Room"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-th-text-faint">
              <span className="h-px flex-1 bg-th-border-subtle" />
              or join
              <span className="h-px flex-1 bg-th-border-subtle" />
            </div>

            <form onSubmit={joinRoom} className="space-y-3">
              <label className="block text-sm font-medium text-th-text-sub" htmlFor="room-code">
                Enter Room Code
              </label>
              <input
                id="room-code"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                placeholder="A7K92P"
                className="w-full rounded-lg border border-th-border/70 bg-th-inner/30 px-4 py-3 text-lg font-semibold uppercase tracking-[0.22em] text-th-text outline-none backdrop-blur-sm transition placeholder:tracking-normal placeholder:text-th-text-faint focus:border-th-border-strong focus:ring-4 focus:ring-th-border-strong/20"
              />
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-th-border/70 bg-th-card/30 px-4 py-3 font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text">
                Join Room
                <ArrowRight className="size-4" />
              </button>
            </form>

            {error ? <p className="mt-4 rounded-lg bg-th-error-bg/40 px-3 py-2 text-sm text-th-error-text">{error}</p> : null}
          </section>
        </div>

        <aside className="xl:pt-24">
          <section className="rounded-xl border border-th-border/70 bg-th-card/55 p-5 shadow-soft backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-th-text-faint">Saved Rooms</p>
                <h2 className="mt-2 text-xl font-bold text-th-text">Rooms you can come back to</h2>
              </div>
              <div className="rounded-full border border-th-border/70 bg-th-inner/30 px-2.5 py-1 text-xs text-th-text-muted">
                {myRooms.length} saved
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-th-text-muted">
              Permanent rooms opened while signed in will appear here automatically.
            </p>

            <div className="mt-4 space-y-3">
              {!auth.isConfigured ? (
                <EmptySavedRoomsState
                  title="Login is not configured"
                  body="Connect Supabase auth to keep rooms tied to each account."
                />
              ) : auth.loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="h-24 animate-pulse rounded-lg border border-th-border/60 bg-th-inner/20" />
                  ))}
                </div>
              ) : !auth.session ? (
                <EmptySavedRoomsState
                  icon={<LogIn className="size-4" />}
                  title="Sign in to save rooms"
                  body="After your first login, TextBridge will remember your session and keep permanent rooms on this side."
                />
              ) : myRooms.length === 0 ? (
                <EmptySavedRoomsState
                  title="No saved rooms yet"
                  body="Create or open a room with the expiry set to Never, and it will be saved here automatically."
                />
              ) : (
                myRooms.map((savedRoom) => (
                  <div
                    key={savedRoom.id}
                    className="group relative rounded-xl border border-th-border/70 bg-th-inner/25 p-4 transition hover:border-th-border-strong hover:bg-th-elevated/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/room/${savedRoom.code}`)}
                        className="min-w-0 flex-1 text-left focus:outline-none"
                        aria-label={`Open room ${savedRoom.code}`}
                      >
                        <p className="text-lg font-bold tracking-[0.22em] text-th-text">{savedRoom.code}</p>
                        <p className="mt-1 text-xs text-th-text-muted">
                          {savedRoom.is_owner ? "Your room" : "Saved room"}
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="rounded-full border border-th-border/70 bg-th-card/50 px-2.5 py-1 text-[11px] text-th-text-muted">
                          {savedRoom.is_locked ? "Locked" : savedRoom.requires_password ? "Password" : "Open"}
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeRoomFromSaved(savedRoom)}
                          disabled={deletingRoomId !== null}
                          className="grid size-8 place-items-center rounded-lg border border-th-border/70 bg-th-card/50 text-th-text-muted transition hover:border-th-error-text/50 hover:bg-th-error-bg/40 hover:text-th-error-text disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Remove room ${savedRoom.code} from saved rooms`}
                          title="Remove from saved rooms"
                        >
                          <Trash2 className={cn("size-4", deletingRoomId === savedRoom.id && "animate-pulse")} />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => router.push(`/room/${savedRoom.code}`)}
                      className="mt-4 flex w-full items-center justify-between text-xs text-th-text-faint focus:outline-none"
                      aria-label={`Open room ${savedRoom.code}`}
                    >
                      <span>Saved forever</span>
                      <span>{savedRoom.created_at.slice(0, 10)}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
            {savedRoomsError ? (
              <p className="mt-4 rounded-lg bg-th-error-bg/40 px-3 py-2 text-sm text-th-error-text">{savedRoomsError}</p>
            ) : null}
          </section>
        </aside>
      </div>

      {isGuideOpen ? <UsageGuide onClose={() => setIsGuideOpen(false)} /> : null}
      {isCreating ? <CreatingRoomLoading code={selectedRoomCode} /> : null}
    </main>
  );
}

function EmptySavedRoomsState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-th-border/70 bg-th-inner/20 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-th-text-sub">
        {icon ? <span className="text-th-accent-text">{icon}</span> : null}
        <span>{title}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-th-text-muted">{body}</p>
    </div>
  );
}

function CreatingRoomLoading({ code }: { code: string }) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-th-overlay/80 px-4 py-6 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-xl border border-th-border/70 bg-th-card/95 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-24 w-56 items-center justify-center">
          <div className="relative flex w-full items-center justify-between">
            <div className="grid size-14 place-items-center rounded-lg border border-th-border bg-th-elevated">
              <MonitorSmartphone className="size-7 text-th-text-sub" />
            </div>

            <div className="relative mx-3 h-1 flex-1 overflow-hidden rounded-full bg-th-border-subtle">
              <span className="absolute inset-y-0 left-0 w-1/2 animate-[bridge-load_1.1s_ease-in-out_infinite] rounded-full bg-th-accent shadow-[0_0_18px_rgba(52,211,153,0.85)]" />
            </div>

            <div className="grid size-14 place-items-center rounded-lg border border-th-accent/60 bg-th-elevated shadow-[0_0_28px_rgba(52,211,153,0.16)]">
              <TabletSmartphone className="size-7 text-th-accent-text" />
            </div>

            <span className="absolute left-[4.25rem] top-1/2 size-2 -translate-y-1/2 animate-ping rounded-full bg-th-accent" />
            <span className="absolute right-[4.25rem] top-1/2 size-2 -translate-y-1/2 animate-pulse rounded-full bg-th-accent" />
          </div>
        </div>

        <h2 className="mt-2 text-xl font-bold text-th-text">Creating room</h2>
        <p className="mt-2 text-sm leading-6 text-th-text-muted">Preparing room {code} and getting your devices ready.</p>

        <div className="mt-5 flex justify-center gap-2">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="size-2 animate-bounce rounded-full bg-th-accent"
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
      title: "Create a room",
      body: "Randomize a code, choose privacy and auto-expire, then create the room.",
    },
    {
      title: "Open another device",
      body: "Use the same website on your phone, tablet, or laptop, then enter the room code or scan the QR code.",
    },
    {
      title: "Share instantly",
      body: "Send text, links, code, or files and every device in the room will see the same timeline.",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-th-overlay/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-guide-title"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-th-border/70 bg-th-card/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-th-border-subtle px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-th-accent-text">
              <TabletSmartphone className="size-4" />
              Works across devices
            </div>
            <h2 id="usage-guide-title" className="mt-2 text-xl font-bold text-th-text">
              How TextBridge works
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-th-border/70 text-th-text-muted transition hover:border-th-border-strong hover:bg-th-elevated hover:text-th-text"
            aria-label="Close usage guide"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-lg border border-th-border/70 bg-th-inner/30 p-4">
              <div className="grid size-9 place-items-center rounded-lg bg-th-card/70 text-sm font-bold text-th-accent-text">
                {index + 1}
              </div>
              <h3 className="mt-3 font-semibold text-th-text">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-th-text-muted">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-th-border-subtle px-5 py-4">
          <div className="flex items-start gap-3 rounded-lg bg-th-elevated/50 p-3 text-sm leading-6 text-th-text-muted">
            <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-th-accent-text" />
            <p>Great for sending notes or files between phone, computer, and tablet without needing an account.</p>
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
