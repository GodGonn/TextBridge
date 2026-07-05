"use client";

import { Copy, LinkIcon, Moon, Pin, PinOff, QrCode, Send, Sun, Trash2, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { BridgeMessage, Room } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

type RoomClientProps = {
  code: string;
};

type BridgeMode = "supabase" | "local" | null;

export default function RoomClient({ code }: RoomClientProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<BridgeMode>(null);
  const [status, setStatus] = useState<"connecting" | "online" | "local" | "error">("connecting");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [dark, setDark] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const roomUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${code}`;
  }, [code]);

  const sortedMessages = useMemo(() => {
    return [...messages]
      .filter((message) => !message.deleted_at)
      .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages]);

  useEffect(() => {
    const stored = localStorage.getItem("textbridge-theme");
    const shouldUseDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadLocalRoom() {
      const roomResponse = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      if (!roomResponse.ok) {
        throw new Error("ไม่พบห้องนี้ กรุณาสร้างห้องใหม่หรือเช็ก Room Code");
      }

      const roomData = (await roomResponse.json()) as Room;
      const messageResponse = await fetch(`/api/rooms/${code}/messages`, { cache: "no-store" });
      const messageData = messageResponse.ok ? ((await messageResponse.json()) as BridgeMessage[]) : [];

      if (!isMounted) return;
      setRoom(roomData);
      setMessages(messageData);
      setMode("local");
      setStatus("local");
      setNotice("ใช้ Local network mode เพราะ Supabase ยังติดต่อไม่ได้");
    }

    async function loadRoom() {
      setStatus("connecting");
      setNotice("");

      if (isSupabaseConfigured && supabase) {
        try {
          const { data: roomData, error: roomError } = await supabase
            .from("rooms")
            .select("*")
            .eq("code", code)
            .maybeSingle();

          if (roomError) throw roomError;
          if (roomData) {
            const { data: messageData, error: messageError } = await supabase
              .from("messages")
              .select("*")
              .eq("room_id", roomData.id)
              .is("deleted_at", null)
              .order("created_at", { ascending: true });

            if (messageError) throw messageError;
            if (!isMounted) return;
            setRoom(roomData);
            setMessages(messageData ?? []);
            setMode("supabase");
            setStatus("online");
            return;
          }
        } catch {
          // Fall through to the local network API so the app remains usable while Supabase is unavailable.
        }
      }

      try {
        await loadLocalRoom();
      } catch (caught) {
        if (!isMounted) return;
        setStatus("error");
        setNotice(caught instanceof Error ? caught.message : "ไม่พบห้องนี้");
      }
    }

    loadRoom();
    return () => {
      isMounted = false;
    };
  }, [code]);

  useEffect(() => {
    if (!room || mode !== "supabase" || !supabase) return;
    const client = supabase;

    const channel = client
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const next = (payload.new || payload.old) as BridgeMessage;
          setMessages((current) => {
            if (payload.eventType === "DELETE") return current.filter((message) => message.id !== next.id);
            const exists = current.some((message) => message.id === next.id);
            return exists ? current.map((message) => (message.id === next.id ? next : message)) : [...current, next];
          });
        },
      )
      .subscribe((nextStatus) => {
        if (nextStatus === "SUBSCRIBED") setStatus("online");
      });

    return () => {
      client.removeChannel(channel);
    };
  }, [mode, room]);

  useEffect(() => {
    if (mode !== "local") return;

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/rooms/${code}/messages`, { cache: "no-store" });
      if (response.ok) {
        setMessages((await response.json()) as BridgeMessage[]);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [code, mode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("textbridge-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !room || !mode) return;

    setText("");

    if (mode === "supabase" && supabase) {
      const { error } = await supabase.from("messages").insert({
        room_id: room.id,
        text: clean,
        type: detectMessageKind(clean),
        is_pinned: false,
      });
      if (error) {
        setNotice(error.message);
        setText(clean);
      }
      return;
    }

    const response = await fetch(`/api/rooms/${code}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });

    if (!response.ok) {
      setNotice("ส่งข้อความไม่สำเร็จ");
      setText(clean);
      return;
    }

    const message = (await response.json()) as BridgeMessage;
    setMessages((current) => [...current, message]);
  }

  async function copyMessage(message: BridgeMessage) {
    await navigator.clipboard.writeText(message.text);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1100);
  }

  async function updateMessage(id: string, patch: Partial<BridgeMessage>) {
    if (mode === "supabase" && supabase) {
      const { error } = await supabase.from("messages").update(patch).eq("id", id);
      if (error) setNotice(error.message);
      return;
    }

    const response = await fetch(`/api/rooms/${code}/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (response.ok) {
      const updated = (await response.json()) as BridgeMessage;
      setMessages((current) => current.map((message) => (message.id === id ? updated : message)));
    }
  }

  async function deleteMessage(id: string) {
    await updateMessage(id, { deleted_at: new Date().toISOString() });
  }

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-7xl gap-4 lg:grid-cols-[22rem_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Room Code</p>
              <h1 className="mt-1 text-3xl font-bold tracking-[0.18em] text-slate-950 dark:text-white">{code}</h1>
            </div>
            <button
              onClick={toggleTheme}
              className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-bridge-500 dark:border-slate-800 dark:text-slate-200"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            {status === "online" || status === "local" ? <Wifi className="size-4 text-emerald-500" /> : <WifiOff className="size-4 text-amber-500" />}
            {status === "online" && "Supabase realtime"}
            {status === "local" && "Local network online"}
            {status === "connecting" && "Connecting..."}
            {status === "error" && "Connection issue"}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <QrCode className="size-4" />
              Scan to join
            </div>
            <div className="mt-3 grid place-items-center rounded-lg bg-white p-3">
              {roomUrl ? <QRCodeSVG value={roomUrl} size={176} /> : null}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(roomUrl)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold transition hover:border-bridge-500 dark:border-slate-700"
            >
              <LinkIcon className="size-4" />
              Copy room link
            </button>
          </div>

          <div className="mt-4 rounded-lg bg-bridge-50 p-3 text-sm text-bridge-900 dark:bg-bridge-500/10 dark:text-bridge-100">
            เปิดหน้านี้บนคอม แล้วสแกน QR ด้วยมือถือ จากนั้นส่งข้อความเพื่อให้ขึ้นทันทีบนอีกเครื่อง
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:h-[calc(100vh-2rem)]">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <form onSubmit={sendMessage} className="flex gap-3">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste text, link, code, email, phone number..."
                className="min-h-14 flex-1 resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-bridge-500 focus:ring-4 focus:ring-bridge-100 dark:border-slate-800 dark:bg-slate-900 dark:focus:ring-bridge-500/20"
              />
              <button
                disabled={!text.trim() || !room}
                className="grid size-14 shrink-0 place-items-center rounded-lg bg-bridge-600 text-white transition hover:bg-bridge-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="size-5" />
              </button>
            </form>
            {notice ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-100">{notice}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {sortedMessages.length === 0 ? (
              <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-slate-300 text-center dark:border-slate-700">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">ยังไม่มีข้อความในห้องนี้</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ส่งลิงก์ โค้ด หรือโน้ตแรกเพื่อเริ่ม bridge ได้เลย</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMessages.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      "rounded-lg border p-3 transition",
                      message.is_pinned
                        ? "border-bridge-200 bg-bridge-50 dark:border-bridge-500/30 dark:bg-bridge-500/10"
                        : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="rounded-full bg-white px-2 py-1 font-medium uppercase dark:bg-slate-950">{message.type}</span>
                        <span>{formatTime(message.created_at)}</span>
                        {message.is_pinned ? <span className="text-bridge-700 dark:text-bridge-100">Pinned</span> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <IconButton label={copiedId === message.id ? "Copied" : "Copy"} onClick={() => copyMessage(message)}>
                          <Copy className="size-4" />
                        </IconButton>
                        <IconButton label={message.is_pinned ? "Unpin" : "Pin"} onClick={() => updateMessage(message.id, { is_pinned: !message.is_pinned })}>
                          {message.is_pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                        </IconButton>
                        <IconButton label="Delete" onClick={() => deleteMessage(message.id)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-800 dark:text-slate-100">
                      {message.text}
                    </pre>
                  </article>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function detectMessageKind(text: string) {
  if (/^https?:\/\//i.test(text.trim())) return "link";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())) return "email";
  if (/^\+?[\d\s().-]{8,}$/.test(text.trim())) return "phone";
  if (/[{};]|```|\b(const|let|function|class|import|SELECT)\b/i.test(text)) return "code";
  return "text";
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-bridge-700 dark:text-slate-300 dark:hover:bg-slate-950 dark:hover:text-bridge-100"
      type="button"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
