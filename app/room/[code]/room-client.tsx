"use client";

import {
  Copy,
  Download,
  FileText,
  FileUp,
  LinkIcon,
  Paperclip,
  Pin,
  PinOff,
  QrCode,
  Send,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { BridgeFile, BridgeMessage, Room } from "@/lib/types";
import { cn, detectMessageType, formatFileSize, formatTime } from "@/lib/utils";

type RoomClientProps = {
  code: string;
};

type BridgeMode = "supabase" | "local" | null;
type Status = "connecting" | "online" | "local" | "error";
type TimelineItem =
  | { kind: "message"; created_at: string; item: BridgeMessage }
  | { kind: "file"; created_at: string; item: BridgeFile };

const storageBucket = "textbridge-files";

export default function RoomClient({ code }: RoomClientProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [files, setFiles] = useState<BridgeFile[]>([]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<BridgeMode>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const roomUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${code}`;
  }, [code]);

  const timeline = useMemo<TimelineItem[]>(() => {
    return [
      ...messages.filter((message) => !message.deleted_at).map((item) => ({ kind: "message" as const, created_at: item.created_at, item })),
      ...files.filter((file) => !file.deleted_at).map((item) => ({ kind: "file" as const, created_at: item.created_at, item })),
    ].sort((a, b) => {
      const aPinned = a.kind === "message" && a.item.is_pinned ? 1 : 0;
      const bPinned = b.kind === "message" && b.item.is_pinned ? 1 : 0;
      return bPinned - aPinned || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [files, messages]);

  useEffect(() => {
    let isMounted = true;

    async function loadLocalRoom() {
      const roomResponse = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      if (!roomResponse.ok) throw new Error("ไม่พบห้องนี้ กรุณาสร้างห้องใหม่หรือเช็ก Room Code");

      const roomData = (await roomResponse.json()) as Room;
      const [messageResponse, fileResponse] = await Promise.all([
        fetch(`/api/rooms/${code}/messages`, { cache: "no-store" }),
        fetch(`/api/rooms/${code}/files`, { cache: "no-store" }),
      ]);

      if (!isMounted) return;
      setRoom(roomData);
      setMessages(messageResponse.ok ? ((await messageResponse.json()) as BridgeMessage[]) : []);
      setFiles(fileResponse.ok ? ((await fileResponse.json()) as BridgeFile[]) : []);
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
            const [messageResult, fileResult] = await Promise.all([
              supabase.from("messages").select("*").eq("room_id", roomData.id).is("deleted_at", null).order("created_at", { ascending: true }),
              supabase.from("files").select("*").eq("room_id", roomData.id).is("deleted_at", null).order("created_at", { ascending: true }),
            ]);

            if (messageResult.error) throw messageResult.error;
            if (fileResult.error) throw fileResult.error;
            if (!isMounted) return;

            setRoom(roomData);
            setMessages(messageResult.data ?? []);
            setFiles(fileResult.data ?? []);
            setMode("supabase");
            setStatus("online");
            return;
          }
        } catch {
          // Keep the app usable locally if Supabase is temporarily unavailable.
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
          setMessages((current) => upsertRealtimeRow(current, next, payload.eventType));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "files", filter: `room_id=eq.${room.id}` },
        (payload) => {
          const next = (payload.new || payload.old) as BridgeFile;
          setFiles((current) => upsertRealtimeRow(current, next, payload.eventType));
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
      const [messageResponse, fileResponse] = await Promise.all([
        fetch(`/api/rooms/${code}/messages`, { cache: "no-store" }),
        fetch(`/api/rooms/${code}/files`, { cache: "no-store" }),
      ]);

      if (messageResponse.ok) setMessages((await messageResponse.json()) as BridgeMessage[]);
      if (fileResponse.ok) setFiles((await fileResponse.json()) as BridgeFile[]);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [code, mode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [timeline.length]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !room || !mode) return;

    setText("");

    if (mode === "supabase" && supabase) {
      const { error } = await supabase.from("messages").insert({
        room_id: room.id,
        text: clean,
        type: detectMessageType(clean),
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

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const upload = event.target.files?.[0];
    if (!upload || !room || !mode) return;

    setUploading(true);
    setNotice("");

    try {
      if (mode === "supabase" && supabase) {
        const storagePath = `${room.id}/${crypto.randomUUID()}-${sanitizeFileName(upload.name)}`;
        const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, upload, {
          contentType: upload.type || "application/octet-stream",
          upsert: false,
        });
        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
        const { error: insertError } = await supabase.from("files").insert({
          room_id: room.id,
          file_name: upload.name,
          file_url: publicData.publicUrl,
          file_type: upload.type || "application/octet-stream",
          file_size: upload.size,
        });
        if (insertError) throw insertError;
      } else {
        const formData = new FormData();
        formData.append("file", upload);
        const response = await fetch(`/api/rooms/${code}/files`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ");
        const file = (await response.json()) as BridgeFile;
        setFiles((current) => [...current, file]);
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

  async function deleteFile(id: string) {
    const patch = { deleted_at: new Date().toISOString() };

    if (mode === "supabase" && supabase) {
      const { error } = await supabase.from("files").update(patch).eq("id", id);
      if (error) setNotice(error.message);
      return;
    }

    const response = await fetch(`/api/rooms/${code}/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (response.ok) {
      const updated = (await response.json()) as BridgeFile;
      setFiles((current) => current.map((file) => (file.id === id ? updated : file)));
    }
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-3 py-3 font-mono sm:px-5 lg:px-6">
      <GridBackground size={32} />
      <div className="relative mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-7xl gap-3 lg:grid-cols-[20rem_1fr]">
        <aside className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 shadow-sm backdrop-blur lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)]">
          <div>
            <p className="text-sm font-medium text-slate-400">Room Code</p>
            <h1 className="mt-1 text-3xl font-bold tracking-[0.2em] text-white">{code}</h1>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Messages" value={messages.filter((message) => !message.deleted_at).length} />
            <Stat label="Files" value={files.filter((file) => !file.deleted_at).length} />
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-black/40 px-3 py-2 text-sm text-slate-300">
            {status === "online" || status === "local" ? <Wifi className="size-4 text-emerald-400" /> : <WifiOff className="size-4 text-amber-400" />}
            {status === "online" && "Supabase realtime"}
            {status === "local" && "Local network online"}
            {status === "connecting" && "Connecting..."}
            {status === "error" && "Connection issue"}
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <QrCode className="size-4" />
              Scan to join
            </div>
            <div className="mt-3 grid place-items-center rounded-lg bg-white p-3">
              {roomUrl ? <QRCodeSVG value={roomUrl} size={172} /> : null}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(roomUrl)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              <LinkIcon className="size-4" />
              Copy room link
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-black/40 p-3 text-sm leading-6 text-slate-300">
            เปิดห้องนี้บนอุปกรณ์อีกเครื่อง แล้วส่งข้อความหรือไฟล์ให้แสดงทันทีใน timeline เดียวกัน
          </div>
        </aside>

        <section className="flex min-h-[75vh] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/90 shadow-sm backdrop-blur lg:h-[calc(100vh-1.5rem)]">
          <div className="border-b border-slate-800 p-3 sm:p-4">
            <form onSubmit={sendMessage} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste text, link, code, email, phone number..."
                className="min-h-24 resize-none rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-slate-500 focus:ring-4 focus:ring-slate-500/20"
              />
              <div className="grid grid-cols-2 gap-2 sm:w-14 sm:grid-cols-1">
                <button
                  disabled={!text.trim() || !room}
                  className="grid h-12 place-items-center rounded-lg border border-slate-700 bg-black text-white transition hover:border-slate-500 hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14"
                  aria-label="Send message"
                >
                  <Send className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!room || uploading}
                  className="grid h-12 place-items-center rounded-lg border border-slate-800 text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:h-14"
                  aria-label="Upload file"
                >
                  {uploading ? <FileUp className="size-5 animate-pulse" /> : <Paperclip className="size-5" />}
                </button>
              </div>
              <input ref={fileInputRef} onChange={uploadFile} type="file" className="hidden" />
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>รองรับรูปภาพ, PDF, TXT, DOCX, ZIP และไฟล์ทั่วไป</span>
              <span>{uploading ? "Uploading..." : mode === "supabase" ? "Storage: Supabase" : "Storage: Local fallback"}</span>
            </div>
            {notice ? <p className="mt-3 rounded-lg bg-amber-950/40 px-3 py-2 text-sm text-amber-100">{notice}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {timeline.length === 0 ? (
              <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-slate-700 bg-black/30 text-center">
                <div className="max-w-sm px-6">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg border border-slate-800 bg-black text-slate-100 shadow-sm">
                    <FileText className="size-6" />
                  </div>
                  <p className="mt-4 font-semibold text-slate-100">ยังไม่มีข้อความหรือไฟล์ในห้องนี้</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">ส่งลิงก์ โค้ด โน้ต หรือไฟล์แรกเพื่อเริ่ม bridge ได้เลย</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {timeline.map((entry) =>
                  entry.kind === "message" ? (
                    <MessageCard
                      key={`message-${entry.item.id}`}
                      message={entry.item}
                      copied={copiedId === entry.item.id}
                      onCopy={() => copyMessage(entry.item)}
                      onPin={() => updateMessage(entry.item.id, { is_pinned: !entry.item.is_pinned })}
                      onDelete={() => deleteMessage(entry.item.id)}
                    />
                  ) : (
                    <FileCard key={`file-${entry.item.id}`} file={entry.item} onDelete={() => deleteFile(entry.item.id)} />
                  ),
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-black/40 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function MessageCard({
  message,
  copied,
  onCopy,
  onPin,
  onDelete,
}: {
  message: BridgeMessage;
  copied: boolean;
  onCopy: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border p-3 shadow-sm transition",
        message.is_pinned ? "border-slate-500 bg-slate-900" : "border-slate-800 bg-slate-900",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-black px-2 py-1 font-medium uppercase text-slate-300">{message.type}</span>
          <span>{formatTime(message.created_at)}</span>
          {message.is_pinned ? <span className="font-medium text-slate-100">Pinned</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <IconButton label={copied ? "Copied" : "Copy"} onClick={onCopy}>
            <Copy className="size-4" />
          </IconButton>
          <IconButton label={message.is_pinned ? "Unpin" : "Pin"} onClick={onPin}>
            {message.is_pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </IconButton>
          <IconButton label="Delete" onClick={onDelete}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-100">
        {message.text}
      </pre>
    </article>
  );
}

function FileCard({ file, onDelete }: { file: BridgeFile; onDelete: () => void }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-sm transition">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-800 bg-black text-slate-100">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-black px-2 py-1 font-medium uppercase text-slate-300">file</span>
              <span>{formatTime(file.created_at)}</span>
              <span>{formatFileSize(file.file_size)}</span>
            </div>
            <p className="mt-2 break-words text-sm font-semibold text-slate-100">{file.file_name}</p>
            <p className="mt-1 break-words text-xs text-slate-400">{file.file_type || "application/octet-stream"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={file.file_url}
            download={file.file_name}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-black hover:text-white"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Download</span>
          </a>
          <IconButton label="Delete" onClick={onDelete}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
    </article>
  );
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
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-black hover:text-white"
      type="button"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function upsertRealtimeRow<T extends { id: string }>(current: T[], next: T, eventType: string) {
  if (eventType === "DELETE") return current.filter((row) => row.id !== next.id);
  const exists = current.some((row) => row.id === next.id);
  return exists ? current.map((row) => (row.id === next.id ? next : row)) : [...current, next];
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
