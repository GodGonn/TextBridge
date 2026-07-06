"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  Home,
  ImageIcon,
  LinkIcon,
  Lock,
  Phone,
  Pin,
  PinOff,
  QrCode,
  Send,
  TimerReset,
  Trash2,
  Unlock,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { GridBackground } from "@/components/grid-background";
import { ThemeToggle } from "@/components/theme-toggle";
import { ImagesBadge } from "@/components/ui/images-badge";
import { Terminal } from "@/components/ui/terminal";
import type { BridgeFile, BridgeMessage, RoomView } from "@/lib/types";
import { cn, formatFileSize, formatTime } from "@/lib/utils";

type RoomClientProps = {
  code: string;
};

type Status = "connecting" | "online" | "local" | "error" | "expired" | "locked";
type TimelineItem =
  | { kind: "message"; created_at: string; item: BridgeMessage }
  | { kind: "file"; created_at: string; item: BridgeFile };

const uploadBadgeImages = [
  "https://assets.aceternity.com/pro/agenforce-1.webp",
  "https://assets.aceternity.com/pro/agenforce-2.webp",
  "https://assets.aceternity.com/pro/agenforce-3.webp",
];

export default function RoomClient({ code }: RoomClientProps) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [files, setFiles] = useState<BridgeFile[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [isRoomLinkCopied, setIsRoomLinkCopied] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
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
    const savedPassword = window.sessionStorage.getItem(`textbridge-room-password:${code}`) ?? "";
    if (savedPassword) {
      setRoomPassword(savedPassword);
      void loadRoom(savedPassword);
      return;
    }

    void loadRoom();
  }, [code]);

  useEffect(() => {
    if (!room) return;

    const interval = window.setInterval(() => {
      void loadTimeline(roomPassword);
    }, 1500);

    return () => window.clearInterval(interval);
  }, [code, room, roomPassword]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [timeline.length]);

  useEffect(() => {
    if (!room) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (uploading) return;

      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
      const pastedImage = imageItem?.getAsFile();

      if (!pastedImage) return;

      event.preventDefault();
      const extension = pastedImage.type.split("/")[1] || "png";
      const upload =
        pastedImage.name && pastedImage.name.trim()
          ? pastedImage
          : new File([pastedImage], `clipboard-${Date.now()}.${extension}`, { type: pastedImage.type });

      void uploadSelectedFile(upload);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [room, uploading]);

  function getRoomHeaders(password = roomPassword) {
    const headers: HeadersInit = {};
    if (password) headers["x-room-password"] = password;
    return headers;
  }

  async function loadRoom(password?: string) {
    setStatus("connecting");
    const response = await fetch(`/api/rooms/${code}`, {
      cache: "no-store",
      headers: getRoomHeaders(password),
    });

    if (response.status === 401 || response.status === 403) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setRoom(null);
      setMessages([]);
      setFiles([]);
      setStatus("locked");
      setNotice(payload.error ?? "This room is locked.");
      return false;
    }

    if (response.status === 410) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setRoom(null);
      setMessages([]);
      setFiles([]);
      setStatus("expired");
      setNotice(payload.error ?? "This room has expired.");
      return false;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setRoom(null);
      setStatus("error");
      setNotice(payload.error ?? "Room not found.");
      return false;
    }

    const roomData = (await response.json()) as RoomView;
    setRoom(roomData);
    setStatus(roomData.storage_mode === "supabase" ? "online" : "local");
    setNotice(
      roomData.storage_mode === "supabase"
        ? roomData.expired_at
          ? `Live sync enabled. Room expires ${formatTime(roomData.expired_at)}.`
          : "Live sync enabled."
        : roomData.expired_at
          ? `Local mode active. Room expires ${formatTime(roomData.expired_at)}.`
          : "Local mode active.",
    );

    await loadTimeline(password ?? roomPassword, roomData);
    return true;
  }

  async function loadTimeline(password = roomPassword, roomData?: RoomView) {
    const [messageResponse, fileResponse] = await Promise.all([
      fetch(`/api/rooms/${code}/messages`, { cache: "no-store", headers: getRoomHeaders(password) }),
      fetch(`/api/rooms/${code}/files`, { cache: "no-store", headers: getRoomHeaders(password) }),
    ]);

    if (messageResponse.status === 410 || fileResponse.status === 410) {
      setStatus("expired");
      setRoom(null);
      setMessages([]);
      setFiles([]);
      setNotice("This room has expired.");
      return;
    }

    if (messageResponse.status === 401 || fileResponse.status === 401 || messageResponse.status === 403 || fileResponse.status === 403) {
      setStatus("locked");
      setRoom(null);
      setMessages([]);
      setFiles([]);
      setNotice("Password required to open this room.");
      return;
    }

    if (messageResponse.ok) setMessages((await messageResponse.json()) as BridgeMessage[]);
    if (fileResponse.ok) setFiles((await fileResponse.json()) as BridgeFile[]);
    if (roomData) setRoom(roomData);
  }

  async function unlockRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordInput.trim()) return;

    setIsUnlocking(true);
    setNotice("");

    try {
      const nextPassword = passwordInput.trim();
      const unlocked = await loadRoom(nextPassword);
      if (unlocked) {
        setRoomPassword(nextPassword);
        window.sessionStorage.setItem(`textbridge-room-password:${code}`, nextPassword);
        setPasswordInput("");
      }
    } finally {
      setIsUnlocking(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !room) return;

    setText("");
    const response = await fetch(`/api/rooms/${code}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getRoomHeaders(),
      },
      body: JSON.stringify({ text: clean }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(payload.error ?? "Unable to send message.");
      setText(clean);
      return;
    }

    const message = (await response.json()) as BridgeMessage;
    setMessages((current) => [...current, message]);
  }

  async function uploadSelectedFile(upload: File) {
    if (!room) return;

    setUploading(true);
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", upload);
      const response = await fetch(`/api/rooms/${code}/files`, {
        method: "POST",
        headers: getRoomHeaders(),
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Upload failed.");
      }

      const file = (await response.json()) as BridgeFile;
      setFiles((current) => [...current, file]);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const upload = event.target.files?.[0];
    if (!upload) return;
    await uploadSelectedFile(upload);
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!room || uploading) return;
    setIsDraggingFile(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!room || uploading) return;
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFile(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDraggingFile(false);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    if (!room || uploading) return;

    const upload = event.dataTransfer.files?.[0];
    if (!upload) return;

    await uploadSelectedFile(upload);
  }

  async function copyMessage(message: BridgeMessage) {
    await navigator.clipboard.writeText(message.text);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1100);
  }

  async function copyRoomLink() {
    if (!roomUrl) return;

    try {
      await navigator.clipboard.writeText(roomUrl);
      setIsRoomLinkCopied(true);
      window.setTimeout(() => setIsRoomLinkCopied(false), 1200);
    } catch {
      setNotice("Could not copy room link.");
    }
  }

  async function updateMessage(id: string, patch: Partial<BridgeMessage>) {
    const response = await fetch(`/api/rooms/${code}/messages/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getRoomHeaders(),
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(payload.error ?? "Unable to update message.");
      return;
    }

    const updated = (await response.json()) as BridgeMessage;
    setMessages((current) => current.map((message) => (message.id === id ? updated : message)));
  }

  async function deleteMessage(id: string) {
    await updateMessage(id, { deleted_at: new Date().toISOString() });
  }

  async function deleteFile(id: string) {
    const response = await fetch(`/api/rooms/${code}/files/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getRoomHeaders(),
      },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(payload.error ?? "Unable to delete file.");
      return;
    }

    const updated = (await response.json()) as BridgeFile;
    setFiles((current) => current.map((file) => (file.id === id ? updated : file)));
  }

  if (status === "locked" && !room) {
    return (
      <main className="relative isolate grid min-h-screen overflow-hidden px-4 py-6 font-mono text-th-text">
        <GridBackground size={32} />
        <div className="mx-auto flex w-full max-w-md flex-col justify-center">
          <div className="rounded-xl border border-th-border/70 bg-th-card/80 p-6 shadow-2xl backdrop-blur-md">
            <div className="mx-auto grid size-14 place-items-center rounded-xl border border-th-border bg-th-elevated text-th-text-sub">
              <Lock className="size-6" />
            </div>
            <h1 className="mt-4 text-center text-2xl font-bold text-th-text">Private Room</h1>
            <p className="mt-2 text-center text-sm leading-6 text-th-text-muted">
              Room <span className="font-semibold tracking-[0.2em] text-th-text-sub">{code}</span> needs a password before it can load.
            </p>
            <form onSubmit={unlockRoom} className="mt-5 space-y-3">
              <input
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                type="password"
                placeholder="Enter room password"
                className="w-full rounded-lg border border-th-border/70 bg-th-inner/30 px-4 py-3 text-th-text-sub outline-none transition placeholder:text-th-text-faint focus:border-th-border-strong focus:ring-4 focus:ring-th-border-strong/20"
              />
              <button
                type="submit"
                disabled={isUnlocking || !passwordInput.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-th-border bg-th-card/60 px-4 py-3 font-semibold text-th-text transition hover:border-th-border-strong hover:bg-th-elevated/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Unlock className="size-4" />
                {isUnlocking ? "Unlocking..." : "Unlock Room"}
              </button>
            </form>
            {notice ? <p className="mt-4 rounded-lg bg-th-warning-bg/40 px-3 py-2 text-sm text-th-warning-text">{notice}</p> : null}
            <Link
              href="/"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-th-border/70 bg-th-card/30 px-4 py-3 text-sm font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text"
            >
              <Home className="size-4" />
              Back Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (status === "expired") {
    return (
      <main className="relative isolate grid min-h-screen overflow-hidden px-4 py-6 font-mono text-th-text">
        <GridBackground size={32} />
        <div className="mx-auto flex w-full max-w-md flex-col justify-center">
          <div className="rounded-xl border border-th-border/70 bg-th-card/80 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto grid size-14 place-items-center rounded-xl border border-th-border bg-th-elevated text-th-text-sub">
              <TimerReset className="size-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-th-text">Room Expired</h1>
            <p className="mt-2 text-sm leading-6 text-th-text-muted">{notice || "This room is no longer available."}</p>
            <Link
              href="/"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-th-border bg-th-card/60 px-4 py-3 font-semibold text-th-text transition hover:border-th-border-strong hover:bg-th-elevated/60"
            >
              <Home className="size-4" />
              Create a New Room
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-3 py-3 font-mono sm:px-5 lg:px-6">
      <GridBackground size={32} />
      <div className="relative mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-7xl gap-3 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-th-border/70 bg-th-card/55 p-4 shadow-sm backdrop-blur-md lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-th-text-muted">Room Code</p>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-lg border border-th-border/70 bg-th-card/30 px-3 py-2 text-sm font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text"
                >
                  <Home className="size-4" />
                  Home
                </Link>
              </div>
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-[0.2em] text-th-text">{code}</h1>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Messages" value={messages.filter((message) => !message.deleted_at).length} />
            <Stat label="Files" value={files.filter((file) => !file.deleted_at).length} />
          </div>

          <div className="mt-4 rounded-lg border border-th-border/70 bg-th-inner/30 p-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setIsQrOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-th-text-sub"
              aria-expanded={isQrOpen}
              aria-controls="room-qr-panel"
            >
              <span className="flex items-center gap-2">
                <QrCode className="size-4" />
                Scan to join
              </span>
              <span className="flex items-center gap-2 text-xs text-th-text-muted">
                {isQrOpen ? "Hide" : "Show"}
                <ChevronDown className={cn("size-4 transition-transform duration-200", isQrOpen && "rotate-180")} />
              </span>
            </button>
            {isQrOpen ? (
              <div id="room-qr-panel" className="mt-3 grid place-items-center rounded-lg bg-white p-3">
                {roomUrl ? <QRCodeSVG value={roomUrl} size={172} /> : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={copyRoomLink}
              disabled={!roomUrl}
              className={cn(
                "mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
                isRoomLinkCopied
                  ? "animate-[copy-confirm_420ms_ease-out] border-th-accent/70 bg-th-accent-soft/15 text-th-accent-text shadow-[0_0_22px_rgba(52,211,153,0.16)]"
                  : "border-th-border text-th-text-sub hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text",
              )}
              aria-live="polite"
            >
              {isRoomLinkCopied ? <Check className="size-4" /> : <LinkIcon className="size-4" />}
              {isRoomLinkCopied ? "Copied!" : "Copy room link"}
            </button>
          </div>

          <div className="mt-4 space-y-2 rounded-lg border border-th-border/70 bg-th-card/30 p-3 text-sm leading-6 text-th-text-muted backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-th-text-muted" />
              <span>{room?.requires_password ? "Password protected" : "Open room"}</span>
            </div>
            <div className="flex items-center gap-2">
              <TimerReset className="size-4 text-th-text-muted" />
              <span>{room?.expired_at ? `Expires ${formatTime(room.expired_at)}` : "No auto-expire"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-th-accent" />
              <span>{status === "online" ? "Supabase live sync" : status === "local" ? "Local mode sync" : "Connecting..."}</span>
            </div>
          </div>

          <div className="mt-4 hidden lg:block">
            <div className="overflow-hidden rounded-xl border border-th-border/70 bg-th-card/30 shadow-sm backdrop-blur-md">
              <Terminal
                className="max-w-none min-w-0 px-0"
                panelClassName="rounded-none border-0 shadow-none"
                contentClassName="h-[20.5rem] overflow-x-hidden px-3 py-4"
                username="TextBridge"
                commands={[
                  "tb room",
                  "tb pair phone",
                  "tb send note.txt",
                  "tb paste otp.txt",
                  "echo 'self-DM retired'",
                ]}
                outputs={{
                  0: ["room ready."],
                  1: ["phone linked."],
                  2: ["sent: note.txt"],
                  3: ["pasted: otp.txt"],
                  4: ["self-DM retired."],
                }}
                typingSpeed={45}
                delayBetweenCommands={1000}
                initialDelay={250}
                enableSound={false}
              />
            </div>
          </div>
        </aside>

        <section
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(event) => void handleDrop(event)}
          className={cn(
            "relative flex min-h-[75vh] flex-col overflow-hidden rounded-xl border border-th-border/70 bg-th-card/55 shadow-sm backdrop-blur-md lg:h-[calc(100vh-1.5rem)]",
            isDraggingFile && "border-th-accent/70 bg-th-accent-soft/5 shadow-[0_0_0_1px_rgba(110,231,183,0.2)]",
          )}
        >
          {isDraggingFile ? (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-th-overlay/65 backdrop-blur-sm">
              <div className="rounded-2xl border border-th-accent/60 bg-th-card/90 px-8 py-6 text-center shadow-2xl">
                <div className="mx-auto grid size-14 place-items-center rounded-xl border border-th-accent/40 bg-th-accent-soft/10 text-th-accent-text">
                  <FileUp className="size-6" />
                </div>
                <p className="mt-4 text-lg font-semibold text-th-text">Drop file to upload</p>
                <p className="mt-1 text-sm text-th-text-muted">Images, PDFs, notes, and other files will be added to this room.</p>
              </div>
            </div>
          ) : null}
          <div className="border-b border-th-border-subtle/80 p-3 sm:p-4">
            <form onSubmit={sendMessage} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste text, link, code, email, phone number..."
                className="min-h-24 resize-none rounded-lg border border-th-border/70 bg-th-inner/30 px-4 py-3 text-th-text-sub outline-none backdrop-blur-sm transition placeholder:text-th-text-faint focus:border-th-border-strong focus:ring-4 focus:ring-th-border-strong/20"
              />
              <div className="grid grid-cols-2 gap-2 sm:w-14 sm:grid-cols-1">
                <button
                  disabled={!text.trim() || !room}
                  className="grid h-12 place-items-center rounded-lg border border-th-border bg-th-card/60 text-th-text transition hover:border-th-border-strong hover:bg-th-elevated/60 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14"
                  aria-label="Send message"
                >
                  <Send className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!room || uploading}
                  className="grid h-12 place-items-center rounded-lg border border-th-border/70 bg-th-card/30 text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text disabled:cursor-not-allowed disabled:opacity-50 sm:h-14"
                  aria-label="Upload file"
                >
                  {uploading ? (
                    <FileUp className="size-5 animate-pulse" />
                  ) : (
                    <ImagesBadge images={uploadBadgeImages} />
                  )}
                </button>
              </div>
              <input ref={fileInputRef} onChange={uploadFile} type="file" className="hidden" />
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-th-text-muted">
              <span>Supports images, PDF, TXT, DOCX, ZIP, and most common file types.</span>
              <span className="text-th-accent-text/90">Tip: drag a file here or paste an image with Ctrl+V.</span>
            </div>
            {notice ? <p className="mt-3 rounded-lg bg-th-warning-bg/40 px-3 py-2 text-sm text-th-warning-text">{notice}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {timeline.length === 0 ? (
              <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-th-border/70 bg-th-card/25 text-center backdrop-blur-sm">
                <div className="max-w-sm px-6">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg border border-th-border/70 bg-th-card/60 text-th-text-sub shadow-sm">
                    <FileText className="size-6" />
                  </div>
                  <p className="mt-4 font-semibold text-th-text-sub">Nothing has been shared in this room yet.</p>
                  <p className="mt-1 text-sm leading-6 text-th-text-muted">Drop in a note, link, code snippet, or file to start the bridge.</p>
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
                    <FileCard
                      key={`file-${entry.item.id}`}
                      file={entry.item}
                      onDelete={() => deleteFile(entry.item.id)}
                      onNotice={setNotice}
                    />
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
    <div className="rounded-lg border border-th-border/70 bg-th-card/30 p-3 backdrop-blur-sm">
      <p className="text-xs text-th-text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-th-text">{value}</p>
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
        message.is_pinned ? "border-th-border-strong bg-th-inner/40" : "border-th-border/70 bg-th-inner/30",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-th-text-muted">
          <span className="rounded-full bg-th-card/70 px-2 py-1 font-medium uppercase text-th-text-muted">{message.type}</span>
          <span>{formatTime(message.created_at)}</span>
          {message.is_pinned ? <span className="font-medium text-th-text-sub">Pinned</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <IconButton label={copied ? "Copied" : "Copy"} onClick={onCopy} tone={copied ? "success" : "info"}>
            <Copy className="size-4" />
          </IconButton>
          <IconButton label={message.is_pinned ? "Unpin" : "Pin"} onClick={onPin} tone={message.is_pinned ? "accent" : "neutral"}>
            {message.is_pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </IconButton>
          <IconButton label="Delete" onClick={onDelete}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-th-text-sub">
        {message.text}
      </pre>
      <MessagePreview message={message} />
    </article>
  );
}

function FileCard({
  file,
  onDelete,
  onNotice,
}: {
  file: BridgeFile;
  onDelete: () => void;
  onNotice: (message: string) => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function downloadFile() {
    if (isDownloading) return;

    setIsDownloading(true);
    onNotice("");

    try {
      const response = await fetch(file.file_url);
      if (!response.ok) {
        throw new Error("Download failed.");
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (caught) {
      onNotice(caught instanceof Error ? caught.message : "Download failed.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <article className="rounded-lg border border-th-border/70 bg-th-inner/30 p-3 shadow-sm transition backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-th-border/70 bg-th-card/60 text-th-text-sub">
            {isImageFile(file) ? <ImageIcon className="size-5" /> : <FileText className="size-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-th-text-muted">
              <span className="rounded-full bg-th-card/70 px-2 py-1 font-medium uppercase text-th-text-muted">file</span>
              <span>{formatTime(file.created_at)}</span>
              <span>{formatFileSize(file.file_size)}</span>
            </div>
            <p className="mt-2 break-words text-sm font-semibold text-th-text-sub">{file.file_name}</p>
            <p className="mt-1 break-words text-xs text-th-text-muted">{file.file_type || "application/octet-stream"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void downloadFile()}
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 rounded-md border border-th-accent/20 bg-th-accent-soft/10 px-2.5 py-1.5 text-xs font-semibold text-th-accent-text transition hover:border-th-accent/40 hover:bg-th-accent-soft/18 hover:text-th-text"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">{isDownloading ? "Downloading..." : "Download"}</span>
          </button>
          <IconButton label="Delete" onClick={onDelete} tone="danger">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      <FilePreview file={file} />
    </article>
  );
}

function IconButton({
  label,
  onClick,
  tone = "neutral",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger" | "info" | "success" | "accent";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition",
        tone === "danger"
          ? "border-red-400/20 bg-red-500/10 text-th-error-text hover:border-red-400/40 hover:bg-red-500/18 hover:text-th-text"
          : tone === "info"
            ? "border-sky-400/20 bg-sky-500/10 text-sky-100 hover:border-sky-400/40 hover:bg-sky-500/18 hover:text-th-text"
            : tone === "success"
              ? "border-th-accent/25 bg-th-accent-soft/12 text-th-accent-text hover:border-th-accent/45 hover:bg-th-accent-soft/20 hover:text-th-text"
              : tone === "accent"
                ? "border-amber-300/25 bg-amber-400/12 text-th-warning-text hover:border-amber-300/45 hover:bg-amber-400/20 hover:text-th-text"
          : "border-th-border/80 bg-th-card/55 text-th-text-muted hover:border-th-border-strong hover:bg-th-elevated/80 hover:text-th-text",
      )}
      type="button"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function MessagePreview({ message }: { message: BridgeMessage }) {
  if (message.type === "link") {
    return <LinkPreviewCard url={message.text} />;
  }

  if (message.type === "email") {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-th-border/70 bg-th-card/40 p-3">
        <div className="grid size-10 place-items-center rounded-lg border border-th-border bg-th-elevated text-th-text-sub">
          <UserRound className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-th-text-faint">email</p>
          <a href={`mailto:${message.text}`} className="text-sm font-semibold text-th-accent-text hover:text-th-accent-text">
            {message.text}
          </a>
        </div>
      </div>
    );
  }

  if (message.type === "phone") {
    const telValue = message.text.replace(/[^\d+]/g, "");
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-th-border/70 bg-th-card/40 p-3">
        <div className="grid size-10 place-items-center rounded-lg border border-th-border bg-th-elevated text-th-text-sub">
          <Phone className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-th-text-faint">phone</p>
          <a href={`tel:${telValue}`} className="text-sm font-semibold text-th-accent-text hover:text-th-accent-text">
            Call {message.text}
          </a>
        </div>
      </div>
    );
  }

  return null;
}

function LinkPreviewCard({ url }: { url: string }) {
  const parsed = safeParseUrl(url);
  if (!parsed) return null;

  const domain = parsed.hostname.replace(/^www\./, "");
  const title = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/";
  const summary = [parsed.protocol.replace(":", "").toUpperCase(), domain].join(" • ");

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 block rounded-lg border border-th-border/70 bg-th-card/40 p-3 transition hover:border-th-border-strong hover:bg-th-elevated/60"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-th-border bg-th-elevated text-th-text-sub">
          <ExternalLink className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-th-text">{domain}</p>
          <p className="mt-1 break-words text-sm text-th-text-muted">{decodeUrlPath(title)}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-th-text-faint">{summary}</p>
        </div>
      </div>
    </a>
  );
}

function FilePreview({ file }: { file: BridgeFile }) {
  const [open, setOpen] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loading, setLoading] = useState(false);

  async function openTextPreview() {
    if (textPreview !== null || loading) {
      setOpen((current) => !current);
      return;
    }

    setOpen(true);
    setLoading(true);
    setPreviewError("");

    try {
      const response = await fetch(file.file_url);
      if (!response.ok) throw new Error("Could not load preview.");

      const raw = await response.text();
      const trimmed = raw.length > 4000 ? `${raw.slice(0, 4000)}\n\n...preview truncated...` : raw;
      setTextPreview(trimmed);
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : "Could not load preview.");
    } finally {
      setLoading(false);
    }
  }

  if (isImageFile(file)) {
    return (
      <div className="mt-3 overflow-hidden rounded-lg border border-th-border/70 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_42%),linear-gradient(180deg,rgba(10,10,10,0.92),rgba(23,23,23,0.96))] p-2">
        <div className="flex max-h-[32rem] min-h-44 items-center justify-center overflow-hidden rounded-md bg-th-overlay/35">
          <img
            src={file.file_url}
            alt={file.file_name}
            className="max-h-[30rem] w-full object-contain"
          />
        </div>
      </div>
    );
  }

  if (isPdfFile(file)) {
    return (
      <details className="mt-3 rounded-lg border border-th-border/70 bg-th-card/30">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-th-text-sub">
          <span>Preview PDF</span>
          <ChevronDown className="size-4 text-th-text-muted" />
        </summary>
        <div className="border-t border-th-border-subtle p-2">
          <iframe src={file.file_url} title={file.file_name} className="h-96 w-full rounded-md bg-white" />
        </div>
      </details>
    );
  }

  if (isTextPreviewableFile(file)) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => void openTextPreview()}
          className="inline-flex items-center gap-2 rounded-md border border-th-border bg-th-card/50 px-3 py-2 text-xs font-medium text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/60 hover:text-th-text"
        >
          <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
          {open ? "Hide preview" : "Preview text"}
        </button>
        {open ? (
          <div className="mt-3 rounded-lg border border-th-border/70 bg-th-card/40 p-3">
            {loading ? <p className="text-sm text-th-text-muted">Loading preview...</p> : null}
            {previewError ? <p className="text-sm text-th-warning-text">{previewError}</p> : null}
            {textPreview ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-th-text-sub">
                {textPreview}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

function safeParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodeUrlPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isImageFile(file: BridgeFile) {
  return file.file_type.startsWith("image/");
}

function isPdfFile(file: BridgeFile) {
  return file.file_type === "application/pdf" || file.file_name.toLowerCase().endsWith(".pdf");
}

function isTextPreviewableFile(file: BridgeFile) {
  const name = file.file_name.toLowerCase();
  return (
    file.file_type.startsWith("text/") ||
    file.file_type.includes("json") ||
    file.file_type.includes("javascript") ||
    file.file_type.includes("typescript") ||
    file.file_type.includes("xml") ||
    [".md", ".txt", ".json", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".sql", ".log", ".yaml", ".yml"].some((ext) =>
      name.endsWith(ext),
    )
  );
}
