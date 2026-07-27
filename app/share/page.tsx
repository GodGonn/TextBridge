"use client";

import { ArrowRight, FileUp, Home, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { ThemeToggle } from "@/components/theme-toggle";
import { assignPendingShareRoom, getPendingShare, getSharedText, savePendingShare, type PendingShare } from "@/lib/share-target";
import { formatFileSize } from "@/lib/utils";

export default function SharePage() {
  const router = useRouter();
  const [payload, setPayload] = useState<PendingShare | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sharedText = useMemo(() => payload ? getSharedText(payload) : "", [payload]);

  useEffect(() => {
    void getPendingShare().then(async (stored) => {
      if (stored) {
        setPayload(stored);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const fallback: PendingShare = {
        id: "pending",
        title: params.get("title") ?? "",
        text: params.get("text") ?? "",
        url: params.get("url") ?? "",
        files: [],
        createdAt: new Date().toISOString(),
        targetRoomCode: null,
      };
      if (getSharedText(fallback)) {
        await savePendingShare(fallback);
        setPayload(fallback);
      }
      if (params.get("filesLost")) setError("Open TextBridge once before sharing files so the installed app can receive them.");
      if (params.get("error")) setError("The shared item could not be prepared. Please try again.");
      setLoading(false);
    }).catch(() => {
      setError("This browser could not open the shared item.");
      setLoading(false);
    });
  }, []);

  async function continueToRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      setError("Enter a valid 4-12 character room code.");
      return;
    }
    if (!(await assignPendingShareRoom(code))) {
      setError("The shared item is no longer available.");
      return;
    }
    router.push(`/room/${code}`);
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-8 font-mono text-th-text">
      <GridBackground size={32} />
      <div className="mx-auto max-w-xl">
        <header className="mb-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-th-text-muted transition hover:text-th-text">
            <Home className="size-4" /> TextBridge
          </Link>
          <ThemeToggle />
        </header>

        <section className="rounded-xl border border-th-border/70 bg-th-card/75 p-5 shadow-soft backdrop-blur-md sm:p-7">
          <div className="grid size-12 place-items-center rounded-xl border border-th-accent/50 bg-th-accent-soft/15 text-th-accent-text">
            <Share2 className="size-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Send shared item to a room</h1>
          <p className="mt-2 text-sm leading-6 text-th-text-muted">Choose a TextBridge room. Private rooms will ask for their password before anything is sent.</p>

          <div className="mt-5 rounded-lg border border-th-border/70 bg-th-inner/30 p-4">
            {loading ? <div className="h-20 animate-pulse rounded bg-th-elevated/40" /> : payload ? (
              <div className="space-y-3">
                {sharedText ? <p className="max-h-40 overflow-auto whitespace-pre-wrap text-sm text-th-text-sub">{sharedText}</p> : null}
                {payload.files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-md border border-th-border/60 px-3 py-2 text-sm">
                    <FileUp className="size-4 shrink-0 text-th-accent-text" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-th-text-faint">{formatFileSize(file.size)}</span>
                  </div>
                ))}
                {!sharedText && payload.files.length === 0 ? <p className="text-sm text-th-text-muted">No shared content was found.</p> : null}
              </div>
            ) : <p className="text-sm text-th-text-muted">No shared content was found.</p>}
          </div>

          <form onSubmit={continueToRoom} className="mt-5 space-y-3">
            <label htmlFor="share-room-code" className="block text-sm font-semibold">Room code</label>
            <input
              id="share-room-code"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
              placeholder="A7K92P"
              autoComplete="off"
              className="w-full rounded-lg border border-th-border/70 bg-th-inner/30 px-4 py-3 text-lg font-semibold uppercase tracking-[0.22em] outline-none focus:border-th-border-strong focus:ring-4 focus:ring-th-border-strong/20"
            />
            <button disabled={loading || !payload} className="flex w-full items-center justify-center gap-2 rounded-lg border border-th-accent/60 bg-th-accent-soft/15 px-4 py-3 font-semibold transition hover:bg-th-accent-soft/25 disabled:cursor-not-allowed disabled:opacity-50">
              Continue <ArrowRight className="size-4" />
            </button>
          </form>
          {error ? <p className="mt-4 rounded-lg bg-th-warning-bg/40 px-3 py-2 text-sm text-th-warning-text">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
