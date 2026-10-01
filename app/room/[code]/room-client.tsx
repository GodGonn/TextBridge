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
  Pencil,
  Phone,
  Pin,
  PinOff,
  QrCode,
  RotateCcw,
  Search,
  Send,
  Share2,
  TimerReset,
  Trash2,
  Unlock,
  Users,
  UserRound,
  Settings2,
  Star,
  Smartphone,
  X,
} from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GridBackground } from "@/components/grid-background";
import { AuthButton } from "@/components/auth-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SoundToggle } from "@/components/sound-toggle";
import { ImagesBadge } from "@/components/ui/images-badge";
import { FilePreview, isImageFile } from "@/components/room/file-preview";
import { Terminal } from "@/components/ui/terminal";
import { supabase } from "@/lib/supabase";
import { useAuthSession } from "@/lib/use-auth";
import { playSendSound, playReceiveSound, playCopySound, playConnectSound } from "@/lib/sound-effects";
import {
  ColorPreviewCard,
  OtpPreviewCard,
  EnhancedLinkPreviewCard,
  detectCodeLanguage,
  parseColor,
  parseOtpCode,
} from "@/components/room/smart-previews";
import type { BridgeFile, BridgeMessage, DeviceProfile, RoomView } from "@/lib/types";
import { cn, formatFileSize, formatTime } from "@/lib/utils";
import { MAX_LOCAL_UPLOAD_BYTES, MAX_SUPABASE_UPLOAD_BYTES } from "@/lib/upload-limits";
import { clearPendingShare, getPendingShare, getSharedText } from "@/lib/share-target";
import {
  createDeviceProfile,
  getDefaultRoomCode,
  getDeviceHeaders,
  getDeviceProfile,
  saveDeviceProfile,
  setDefaultRoomCode,
} from "@/lib/device-profile";

type RoomClientProps = {
  code: string;
};

type Status = "connecting" | "online" | "local" | "offline" | "error" | "expired" | "locked";
type TimelineItem =
  | { kind: "message"; created_at: string; item: BridgeMessage }
  | { kind: "file"; created_at: string; item: BridgeFile };
type TimelineFilter = "all" | "messages" | "files" | "pinned" | "links";
type PresencePayload = {
  client_id: string;
  user_id: string | null;
  label: string;
  online_at: string;
  last_seen_message_id: string | null;
  device_id: string | null;
  color: string;
};

type UploadProgress = { fileName: string; index: number; total: number; percent: number };

const uploadBadgeImages = [
  "https://assets.aceternity.com/pro/agenforce-1.webp",
  "https://assets.aceternity.com/pro/agenforce-2.webp",
  "https://assets.aceternity.com/pro/agenforce-3.webp",
];

export default function RoomClient({ code }: RoomClientProps) {
  const auth = useAuthSession();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [files, setFiles] = useState<BridgeFile[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [isRoomLinkCopied, setIsRoomLinkCopied] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [query, setQuery] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [senderFilter, setSenderFilter] = useState("all");
  const [roomPassword, setRoomPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [presences, setPresences] = useState<PresencePayload[]>([]);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null);
  const [deviceNameInput, setDeviceNameInput] = useState("");
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDefaultRoom, setIsDefaultRoom] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [roomUrl, setRoomUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const presenceChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const presenceClientId = useRef(crypto.randomUUID());
  const sharedPayloadHandledRef = useRef(false);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const uploadCancelledRef = useRef(false);
  const prevMessageIdsRef = useRef<Set<string>>(new Set());
  const prevFileIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const prevPresencesCountRef = useRef(0);

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

  const filteredTimeline = useMemo(() => {
    const cleanQuery = query.trim().toLocaleLowerCase();

    return timeline.filter((entry) => {
      if (timelineFilter === "messages" && entry.kind !== "message") return false;
      if (timelineFilter === "files" && entry.kind !== "file") return false;
      if (timelineFilter === "pinned" && (entry.kind !== "message" || !entry.item.is_pinned)) return false;
      if (timelineFilter === "links" && (entry.kind !== "message" || entry.item.type !== "link")) return false;
      if (senderFilter !== "all" && entry.item.sender_device_id !== senderFilter) return false;
      if (!cleanQuery) return true;

      const searchable = entry.kind === "message"
        ? `${entry.item.sender_name ?? ""} ${entry.item.type} ${entry.item.text}`
        : `${entry.item.sender_name ?? ""} ${entry.item.file_name} ${entry.item.file_type}`;
      return searchable.toLocaleLowerCase().includes(cleanQuery);
    });
  }, [query, senderFilter, timeline, timelineFilter]);

  const senderOptions = useMemo(() => {
    const senders = new Map<string, { name: string; color: string }>();
    for (const entry of timeline) {
      if (!entry.item.sender_device_id) continue;
      senders.set(entry.item.sender_device_id, {
        name: entry.item.sender_name ?? "Unknown device",
        color: entry.item.sender_color ?? "#a3a3a3",
      });
    }
    return Array.from(senders.entries());
  }, [timeline]);

  const recentMessages = useMemo(
    () => messages.filter((message) => !message.deleted_at).slice(-5).reverse(),
    [messages],
  );
  const latestMessageId = messages.filter((message) => !message.deleted_at).at(-1)?.id ?? null;
  const seenCount = latestMessageId
    ? presences.filter((presence) => presence.last_seen_message_id === latestMessageId).length
    : 0;
  const canWrite = Boolean(room && (!room.is_locked || room.is_owner));
  const canSend = canWrite && Boolean(deviceProfile);
  const unreadCount = useMemo(() => timeline.filter((entry) => (
    new Date(entry.created_at).getTime() > lastSeenAt &&
    entry.item.sender_device_id !== deviceProfile?.id
  )).length, [deviceProfile?.id, lastSeenAt, timeline]);

  useEffect(() => {
    setRoomUrl(`${window.location.origin}/room/${code}`);
  }, [code]);

  useEffect(() => {
    const savedProfile = getDeviceProfile();
    if (savedProfile) {
      setDeviceProfile(savedProfile);
      setDeviceNameInput(savedProfile.name);
    } else {
      setIsDeviceDialogOpen(true);
    }
    setIsDefaultRoom(getDefaultRoomCode() === code);
    const savedSeenAt = Number(window.localStorage.getItem(`textbridge-last-seen:${code}`));
    const initialSeenAt = Number.isFinite(savedSeenAt) && savedSeenAt > 0 ? savedSeenAt : Date.now();
    setLastSeenAt(initialSeenAt);
    if (!savedSeenAt) window.localStorage.setItem(`textbridge-last-seen:${code}`, String(initialSeenAt));
  }, [code]);

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) ${code} · TextBridge` : `${code} · TextBridge`;
    return () => { document.title = "TextBridge"; };
  }, [code, unreadCount]);

  useEffect(() => {
    const markVisibleItemsSeen = () => {
      if (document.hidden || timeline.length === 0) return;
      const latestAt = Math.max(...timeline.map((entry) => new Date(entry.created_at).getTime()));
      setLastSeenAt(latestAt);
      window.localStorage.setItem(`textbridge-last-seen:${code}`, String(latestAt));
    };
    const timeout = window.setTimeout(markVisibleItemsSeen, 1800);
    document.addEventListener("visibilitychange", markVisibleItemsSeen);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", markVisibleItemsSeen);
    };
  }, [code, timeline.length]);

  useEffect(() => {
    if (auth.loading) return;
    const savedPassword = window.sessionStorage.getItem(`textbridge-room-password:${code}`) ?? "";
    if (savedPassword) {
      setRoomPassword(savedPassword);
      void loadRoom(savedPassword);
      return;
    }

    void loadRoom();
  }, [code, auth.loading, auth.session?.access_token]);

  useEffect(() => {
    if (!room) return;
    const realtimeClient = supabase;

    if (room.storage_mode === "local" || !realtimeClient) {
      const interval = window.setInterval(() => {
        void loadTimeline(roomPassword);
      }, 1500);
      return () => window.clearInterval(interval);
    }

    const channel = realtimeClient
      .channel(`room-${room.id}`, {
        config: { presence: { key: `${auth.session?.user.id ?? "guest"}:${presenceClientId.current}` } },
      })
      .on("presence", { event: "sync" }, () => {
        const nextPresences = Object.values(channel.presenceState()).flat() as unknown as PresencePayload[];
        if (prevPresencesCountRef.current > 0 && nextPresences.length > prevPresencesCountRef.current) {
          playConnectSound();
        }
        prevPresencesCountRef.current = nextPresences.length;
        setPresences(nextPresences);
      })
      .on("broadcast", { event: "refresh" }, () => void loadTimeline(roomPassword))
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus !== "SUBSCRIBED") return;
        presenceChannelRef.current = channel;
        void channel.track({
          client_id: presenceClientId.current,
          user_id: auth.session?.user.id ?? null,
          device_id: deviceProfile?.id ?? null,
          label: deviceProfile?.name ?? auth.session?.user.email ?? "Guest device",
          color: deviceProfile?.color ?? "#34d399",
          online_at: new Date().toISOString(),
          last_seen_message_id: latestMessageId,
        } satisfies PresencePayload);
      });

    return () => {
      presenceChannelRef.current = null;
      setPresences([]);
      void realtimeClient.removeChannel(channel);
    };
  }, [code, room?.id, room?.storage_mode, roomPassword, auth.session?.user.id, auth.session?.access_token, deviceProfile?.id, deviceProfile?.name, deviceProfile?.color]);

  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    void channel.track({
      client_id: presenceClientId.current,
      user_id: auth.session?.user.id ?? null,
      device_id: deviceProfile?.id ?? null,
      label: deviceProfile?.name ?? auth.session?.user.email ?? "Guest device",
      color: deviceProfile?.color ?? "#34d399",
      online_at: new Date().toISOString(),
      last_seen_message_id: latestMessageId,
    } satisfies PresencePayload);
  }, [latestMessageId, auth.session?.user.id, deviceProfile?.id, deviceProfile?.name, deviceProfile?.color]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        document.getElementById("room-search")?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [timeline.length]);

  useEffect(() => {
    if (!room) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (uploading) return;

      const pastedFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (pastedFiles.length === 0) return;

      event.preventDefault();
      const uploads = pastedFiles.map((file, index) => {
        if (file.name.trim()) return file;
        const extension = file.type.split("/")[1] || "bin";
        return new File([file], `clipboard-${Date.now()}-${index + 1}.${extension}`, { type: file.type });
      });

      void uploadSelectedFiles(uploads);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [room, uploading]);

  useEffect(() => {
    if (!room || !canSend || sharedPayloadHandledRef.current) return;
    sharedPayloadHandledRef.current = true;

    void getPendingShare().then(async (payload) => {
      if (!payload || payload.targetRoomCode !== code) return;
      const sharedText = getSharedText(payload);
      const textSent = sharedText ? await sendTextValue(sharedText, false) : true;
      const filesSent = payload.files.length > 0 ? await uploadSelectedFiles(payload.files) : true;
      if (textSent && filesSent) {
        await clearPendingShare();
        setNotice("Shared item sent to this room.");
      } else {
        setNotice("Part of the shared item could not be sent. Reload this room to retry.");
      }
    }).catch(() => setNotice("The shared item could not be opened."));
  }, [room?.id, canSend, code]);

  function getRoomHeaders(password = roomPassword) {
    const headers: Record<string, string> = { ...getDeviceHeaders(deviceProfile) };
    if (password) headers["x-room-password"] = password;
    if (auth.session) headers.Authorization = `Bearer ${auth.session.access_token}`;
    return headers;
  }

  function saveCurrentDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = deviceNameInput.trim();
    if (!name) return;
    const profile = deviceProfile
      ? { ...deviceProfile, name: name.slice(0, 32) }
      : createDeviceProfile(name);
    saveDeviceProfile(profile);
    setDeviceProfile(profile);
    setDeviceNameInput(profile.name);
    setIsDeviceDialogOpen(false);
    setNotice(`This device is now ${profile.name}.`);
  }

  function toggleDefaultRoom() {
    if (isDefaultRoom) {
      setDefaultRoomCode("");
      setIsDefaultRoom(false);
      setNotice("Default quick-send room removed.");
      return;
    }
    setDefaultRoomCode(code);
    setIsDefaultRoom(true);
    setNotice(`${code} is now your default quick-send room.`);
  }

  function broadcastRefresh() {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event: "refresh", payload: { at: Date.now() } });
  }

  async function loadRoom(password?: string) {
    setStatus("connecting");
    let response: Response;
    try {
      response = await fetch(`/api/rooms/${code}`, {
        cache: "no-store",
        headers: getRoomHeaders(password),
      });
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
      setNotice("Could not reach the server. Check your connection and try again.");
      return false;
    }

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

    try {
      await loadTimeline(password ?? roomPassword, roomData);
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
      setNotice("The room loaded, but its latest messages could not be reached.");
    }
    return true;
  }

  useEffect(() => {
    const handleOffline = () => {
      setStatus("offline");
      setNotice("You are offline. TextBridge will reconnect when your connection returns.");
    };
    const handleOnline = () => void loadRoom(roomPassword);

    if (!window.navigator.onLine) handleOffline();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [code, roomPassword]);

  async function loadTimeline(password = roomPassword, roomData?: RoomView) {
    let messageResponse: Response;
    let fileResponse: Response;
    try {
      [messageResponse, fileResponse] = await Promise.all([
        fetch(`/api/rooms/${code}/messages`, { cache: "no-store", headers: getRoomHeaders(password) }),
        fetch(`/api/rooms/${code}/files`, { cache: "no-store", headers: getRoomHeaders(password) }),
      ]);
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
      setNotice("Could not refresh this room. Check your connection and try again.");
      return;
    }

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

    if (messageResponse.ok) {
      const nextMessages = (await messageResponse.json()) as BridgeMessage[];
      if (!isInitialLoadRef.current) {
        const hasIncoming = nextMessages.some(
          (m) => !prevMessageIdsRef.current.has(m.id) && m.sender_device_id !== deviceProfile?.id && !m.deleted_at,
        );
        if (hasIncoming) playReceiveSound();
      }
      prevMessageIdsRef.current = new Set(nextMessages.map((m) => m.id));
      setMessages(nextMessages);
    }

    if (fileResponse.ok) {
      const nextFiles = (await fileResponse.json()) as BridgeFile[];
      if (!isInitialLoadRef.current) {
        const hasIncoming = nextFiles.some(
          (f) => !prevFileIdsRef.current.has(f.id) && f.sender_device_id !== deviceProfile?.id && !f.deleted_at,
        );
        if (hasIncoming) playReceiveSound();
      }
      prevFileIdsRef.current = new Set(nextFiles.map((f) => f.id));
      setFiles(nextFiles);
    }

    isInitialLoadRef.current = false;
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

  async function sendTextValue(value: string, restoreOnFailure: boolean) {
    const clean = value.trim();
    if (!clean || !canSend) return false;
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
      if (restoreOnFailure) setText(clean);
      return false;
    }

    const message = (await response.json()) as BridgeMessage;
    playSendSound();
    prevMessageIdsRef.current.add(message.id);
    setMessages((current) => upsertById(current, message));
    broadcastRefresh();
    return true;
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !canSend) return;
    setText("");
    await sendTextValue(clean, true);
  }

  async function uploadSelectedFiles(uploads: File[]) {
    if (!canSend || uploads.length === 0) return false;

    uploadCancelledRef.current = false;
    setUploading(true);
    setNotice("");
    const errors: string[] = [];
    let uploadedCount = 0;
    const maxFileBytes = room?.storage_mode === "local" ? MAX_LOCAL_UPLOAD_BYTES : MAX_SUPABASE_UPLOAD_BYTES;

    try {
      for (const [index, upload] of uploads.entries()) {
        if (uploadCancelledRef.current) break;
        if (upload.size > maxFileBytes) {
          errors.push(`${upload.name}: files in this room must be ${Math.round(maxFileBytes / (1024 * 1024))} MB or smaller.`);
          continue;
        }

        setUploadProgress({ fileName: upload.name, index: index + 1, total: uploads.length, percent: 0 });
        const formData = new FormData();
        formData.append("file", upload);

        try {
          const file = await uploadFileWithProgress(
            `/api/rooms/${code}/files`,
            formData,
            getRoomHeaders(),
            (percent) => setUploadProgress({ fileName: upload.name, index: index + 1, total: uploads.length, percent }),
            uploadXhrRef,
          );
          setFiles((current) => upsertById(current, file));
          prevFileIdsRef.current.add(file.id);
          playSendSound();
          uploadedCount += 1;
        } catch (caught) {
          if (uploadCancelledRef.current) break;
          errors.push(`${upload.name}: ${caught instanceof Error ? caught.message : "Upload failed."}`);
        }
      }

      if (uploadCancelledRef.current) {
        setNotice(`Upload canceled. ${uploadedCount} of ${uploads.length} files uploaded.`);
      } else if (errors.length > 0) {
        setNotice(`${uploadedCount} of ${uploads.length} files uploaded. ${errors.join(" ")}`);
      } else {
        setNotice(`${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded.`);
      }
      if (uploadedCount > 0) broadcastRefresh();
      return errors.length === 0;
    } finally {
      uploadXhrRef.current = null;
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function cancelUpload() {
    uploadCancelledRef.current = true;
    uploadXhrRef.current?.abort();
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const uploads = Array.from(event.target.files ?? []);
    await uploadSelectedFiles(uploads);
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!canSend || uploading) return;
    setIsDraggingFile(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!canSend || uploading) return;
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
    if (!canSend || uploading) return;

    const uploads = Array.from(event.dataTransfer.files ?? []);
    await uploadSelectedFiles(uploads);
  }

  async function copyMessage(message: BridgeMessage) {
    await navigator.clipboard.writeText(message.text);
    playCopySound();
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1200);
  }

  async function copyRoomLink() {
    if (!roomUrl) return;

    try {
      await navigator.clipboard.writeText(roomUrl);
      playCopySound();
      setIsRoomLinkCopied(true);
      window.setTimeout(() => setIsRoomLinkCopied(false), 1200);
    } catch {
      setNotice("Could not copy room link.");
    }
  }

  async function shareRoom() {
    if (!roomUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({ title: `TextBridge room ${code}`, text: `Join my TextBridge room: ${code}`, url: roomUrl });
        return;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      }
    }

    await copyRoomLink();
  }

  function exportRoom() {
    if (!room) return;

    const payload = {
      exported_at: new Date().toISOString(),
      room: { code: room.code, name: room.name, created_at: room.created_at, expired_at: room.expired_at },
      messages: messages.filter((message) => !message.deleted_at),
      files: files.filter((file) => !file.deleted_at),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `textbridge-${code}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(objectUrl);
  }

  async function runOwnerAction(action: Record<string, unknown>, successMessage: string) {
    if (!room?.is_owner || !auth.session || ownerBusy) return;
    setOwnerBusy(true);
    setNotice("");

    try {
      const response = await fetch(`/api/rooms/${code}/owner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` },
        body: JSON.stringify(action),
      });
      const payload = (await response.json().catch(() => ({}))) as RoomView & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Owner action failed.");
      setRoom(payload);
      setOwnerPassword("");
      setNotice(successMessage);
      await loadTimeline();
      broadcastRefresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Owner action failed.");
    } finally {
      setOwnerBusy(false);
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
    setMessages((current) => upsertById(current, updated));
    broadcastRefresh();
  }

  async function resendMessage(message: BridgeMessage) {
    const response = await fetch(`/api/rooms/${code}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getRoomHeaders() },
      body: JSON.stringify({ text: message.text }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(payload.error ?? "Unable to resend message.");
      return;
    }

    const resent = (await response.json()) as BridgeMessage;
    setMessages((current) => upsertById(current, resent));
    broadcastRefresh();
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
    setFiles((current) => upsertById(current, updated));
    broadcastRefresh();
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
      {room?.storage_mode === "local" ? (
        <div role="status" className="relative mx-auto mb-3 max-w-7xl rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-th-warning-text">
          Temporary local mode: this room clears when the server restarts. Add the Supabase server key to enable persistent storage.
        </div>
      ) : null}
      <div className="relative mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-7xl gap-3 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="flex items-center justify-between rounded-xl border border-th-border/70 bg-th-card/70 p-3 shadow-sm backdrop-blur-md lg:hidden">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-th-text-faint">Room</p>
            <p className="font-bold tracking-[0.18em] text-th-text">{code}</p>
          </div>
          <div className="flex items-center gap-2">
            <SoundToggle />
            <span className="rounded-full border border-th-border/70 px-2.5 py-1 text-xs text-th-text-muted">
              {unreadCount > 0 ? `${unreadCount} new` : status === "online" ? `${presences.length || 1} online` : status === "offline" ? "Offline" : status}
            </span>
            <button
              type="button"
              onClick={() => setIsDetailsOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-lg border border-th-border/70 text-th-text-sub"
              aria-label="Toggle room details"
            >
              {isDetailsOpen ? <X className="size-4" /> : <Settings2 className="size-4" />}
            </button>
          </div>
        </div>

        <aside className={cn(
          "rounded-xl border border-th-border/70 bg-th-card/55 p-4 pb-6 shadow-sm backdrop-blur-md",
          "lg:sticky lg:top-3 lg:block lg:h-[calc(100vh-1.5rem)] lg:overflow-y-auto lg:overflow-x-hidden sidebar-scroll",
          isDetailsOpen ? "block" : "hidden",
        )}>
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-th-text-muted">Room Code</p>
              <div className="flex items-center gap-2">
                <AuthButton compact />
                <SoundToggle />
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

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setDeviceNameInput(deviceProfile?.name ?? "");
                setIsDeviceDialogOpen(true);
              }}
              className="flex items-center justify-center gap-2 rounded-lg border border-th-border/70 px-3 py-2 text-xs font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/40"
            >
              <Smartphone className="size-4" />
              {deviceProfile?.name ?? "Name device"}
            </button>
            <button
              type="button"
              onClick={toggleDefaultRoom}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                isDefaultRoom
                  ? "border-th-accent/60 bg-th-accent-soft/15 text-th-accent-text"
                  : "border-th-border/70 text-th-text-sub hover:border-th-border-strong hover:bg-th-elevated/40",
              )}
            >
              <Star className={cn("size-4", isDefaultRoom && "fill-current")} />
              {isDefaultRoom ? "Quick-send room" : "Set default"}
            </button>
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
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copyRoomLink}
                disabled={!roomUrl}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
                  isRoomLinkCopied
                    ? "animate-[copy-confirm_420ms_ease-out] border-th-accent/70 bg-th-accent-soft/15 text-th-accent-text"
                    : "border-th-border text-th-text-sub hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text",
                )}
                aria-live="polite"
              >
                {isRoomLinkCopied ? <Check className="size-4" /> : <LinkIcon className="size-4" />}
                {isRoomLinkCopied ? "Copied!" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => void shareRoom()}
                disabled={!roomUrl}
                className="flex items-center justify-center gap-2 rounded-lg border border-th-border px-3 py-2 text-xs font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text disabled:opacity-60"
              >
                <Share2 className="size-4" />
                Share
              </button>
            </div>
            <button
              type="button"
              onClick={exportRoom}
              disabled={!room}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-th-border/70 px-3 py-2 text-xs font-semibold text-th-text-muted transition hover:border-th-border-strong hover:bg-th-elevated/40 hover:text-th-text"
            >
              <Download className="size-4" />
              Export room data
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
              <span>{status === "online" ? "Supabase live sync" : status === "local" ? "Local mode sync" : status === "offline" ? "Offline · reconnecting" : "Connecting..."}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-th-text-muted" />
              <span>{status === "online" ? `${presences.length || 1} online${latestMessageId ? `, ${seenCount || 1} seen latest` : ""}` : "Presence needs Supabase"}</span>
            </div>
            {room?.is_locked ? (
              <div className="flex items-center gap-2 text-th-warning-text">
                <Lock className="size-4" />
                <span>{room.is_owner ? "Room locked (owner can write)" : "Room locked by owner"}</span>
              </div>
            ) : null}
          </div>

          {room?.is_owner ? (
            <div className="mt-4 rounded-lg border border-th-accent/25 bg-th-accent-soft/5 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-th-accent-text">Owner controls</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={ownerBusy} onClick={() => void runOwnerAction({ action: "set_lock", locked: !room.is_locked }, room.is_locked ? "Room unlocked." : "Room locked.")} className="rounded-md border border-th-border px-2 py-2 text-xs font-semibold text-th-text-sub disabled:opacity-50">
                  {room.is_locked ? "Unlock" : "Lock"}
                </button>
                <button type="button" disabled={ownerBusy} onClick={() => void runOwnerAction({ action: "extend_expiry", minutes: 1440 }, "Expiry extended by 24 hours.")} className="rounded-md border border-th-border px-2 py-2 text-xs font-semibold text-th-text-sub disabled:opacity-50">
                  +24 hours
                </button>
                <button type="button" disabled={ownerBusy} onClick={() => void runOwnerAction({ action: "make_permanent" }, "Room is now permanent.")} className="rounded-md border border-th-border px-2 py-2 text-xs font-semibold text-th-text-sub disabled:opacity-50">
                  Keep forever
                </button>
                <button type="button" disabled={ownerBusy} onClick={() => { if (window.confirm("Clear every message and file from this room?")) void runOwnerAction({ action: "clear_room" }, "Room cleared."); }} className="rounded-md border border-red-400/25 px-2 py-2 text-xs font-semibold text-th-error-text disabled:opacity-50">
                  Clear room
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} type="password" placeholder="New password" className="min-w-0 flex-1 rounded-md border border-th-border bg-th-inner/30 px-2 py-2 text-xs text-th-text-sub outline-none" />
                <button type="button" disabled={ownerBusy || ownerPassword.trim().length < 4} onClick={() => void runOwnerAction({ action: "rotate_password", password: ownerPassword }, "Room password rotated.")} className="rounded-md border border-th-border px-2 py-2 text-xs font-semibold text-th-text-sub disabled:opacity-50">
                  Rotate
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 hidden lg:block">
            <div className="overflow-hidden rounded-xl border border-th-border/70 bg-th-card/30 shadow-sm backdrop-blur-md">
              <Terminal
                className="max-w-none min-w-0 px-0"
                panelClassName="rounded-none border-0 shadow-none"
                contentClassName="h-48 overflow-x-hidden px-3 py-3"
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
          <AnimatePresence>
            {isDraggingFile ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-th-overlay/75 px-6 backdrop-blur-md"
              >
                <div className="relative w-full max-w-sm rounded-2xl border-2 border-dashed border-th-accent bg-th-card/95 p-8 text-center shadow-[0_0_60px_rgba(52,211,153,0.25)]">
                  <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-th-accent/50 bg-th-accent-soft/15 text-th-accent-text shadow-[0_0_30px_rgba(52,211,153,0.35)] animate-bounce">
                    <FileUp className="size-8" />
                  </div>
                  <p className="mt-5 text-xl font-bold tracking-tight text-th-text">Drop files to bridge</p>
                  <p className="mt-1 text-sm text-th-text-muted">Sends immediately to every connected device</p>
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-th-accent-text">
                    <span className="inline-block size-2 rounded-full bg-th-accent animate-ping" />
                    <span>Ready to receive</span>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="border-b border-th-border-subtle/80 p-3 sm:p-4">
            <form onSubmit={sendMessage} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Paste text, link, code, email, phone number..."
                className="min-h-24 resize-none rounded-lg border border-th-border/70 bg-th-inner/30 px-4 py-3 text-th-text-sub outline-none backdrop-blur-sm transition placeholder:text-th-text-faint focus:border-th-border-strong focus:ring-4 focus:ring-th-border-strong/20"
              />
              <div className="grid grid-cols-2 gap-2 sm:w-14 sm:grid-cols-1">
                <button
                  disabled={!text.trim() || !canSend}
                  className="grid h-12 place-items-center rounded-lg border border-th-border bg-th-card/60 text-th-text transition hover:border-th-border-strong hover:bg-th-elevated/60 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14"
                  aria-label="Send message"
                >
                  <Send className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canSend || uploading}
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
              <input ref={fileInputRef} onChange={uploadFile} type="file" multiple className="hidden" />
            </form>
            {recentMessages.length > 0 ? (
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                <span className="shrink-0 text-xs font-semibold text-th-text-muted">Recent</span>
                {recentMessages.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => void resendMessage(message)}
                    title={message.text}
                    className="inline-flex max-w-48 shrink-0 items-center gap-1.5 truncate rounded-full border border-th-border/70 bg-th-card/35 px-3 py-1.5 text-xs text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/50"
                  >
                    <RotateCcw className="size-3.5 shrink-0" />
                    <span className="truncate">{message.text}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-th-text-muted">
              <span>Supports images, PDF, TXT, DOCX, ZIP, and most common file types.</span>
              <span className="text-th-accent-text/90">Tip: drag, select, or paste multiple files.</span>
            </div>
            {uploadProgress ? (
              <div className="mt-3 rounded-lg border border-th-border/70 bg-th-inner/30 p-3" role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-xs text-th-accent-text">
                  <span className="min-w-0 truncate">Uploading {uploadProgress.index}/{uploadProgress.total}: {uploadProgress.fileName}</span>
                  <span className="shrink-0">{uploadProgress.percent}%</span>
                </div>
                <progress className="mt-2 h-2 w-full accent-emerald-400" max={100} value={uploadProgress.percent} aria-label="Upload progress" />
                <button type="button" onClick={cancelUpload} className="mt-2 text-xs font-semibold text-th-text-muted underline underline-offset-2 hover:text-th-text">
                  Cancel upload
                </button>
              </div>
            ) : null}
            {room?.is_locked && !room.is_owner ? <p className="mt-2 rounded-lg bg-th-warning-bg/40 px-3 py-2 text-xs text-th-warning-text">The owner locked this room. You can still read and download existing items.</p> : null}
            {notice ? <p className="mt-3 rounded-lg bg-th-warning-bg/40 px-3 py-2 text-sm text-th-warning-text">{notice}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
                className="mb-3 flex w-full items-center justify-center rounded-lg border border-th-accent/40 bg-th-accent-soft/10 px-3 py-2 text-sm font-semibold text-th-accent-text"
              >
                {unreadCount} new item{unreadCount === 1 ? "" : "s"} · Jump to latest
              </button>
            ) : null}
            <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-th-text-faint" />
                <input
                  id="room-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search messages and files"
                  className="w-full rounded-lg border border-th-border/70 bg-th-inner/30 py-2.5 pl-9 pr-3 text-sm text-th-text-sub outline-none transition placeholder:text-th-text-faint focus:border-th-border-strong"
                />
              </label>
              <select
                value={timelineFilter}
                onChange={(event) => setTimelineFilter(event.target.value as TimelineFilter)}
                className="rounded-lg border border-th-border/70 bg-th-card px-3 py-2.5 text-sm text-th-text-sub outline-none focus:border-th-border-strong"
              >
                <option value="all">All items</option>
                <option value="messages">Messages</option>
                <option value="files">Files</option>
                <option value="pinned">Pinned</option>
                <option value="links">Links</option>
              </select>
              <select
                value={senderFilter}
                onChange={(event) => setSenderFilter(event.target.value)}
                className="rounded-lg border border-th-border/70 bg-th-card px-3 py-2.5 text-sm text-th-text-sub outline-none focus:border-th-border-strong"
                aria-label="Filter by sender"
              >
                <option value="all">All senders</option>
                {senderOptions.map(([deviceId, sender]) => (
                  <option key={deviceId} value={deviceId}>
                    {deviceId === deviceProfile?.id ? `${sender.name} (You)` : sender.name}
                  </option>
                ))}
              </select>
            </div>
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
            ) : filteredTimeline.length === 0 ? (
              <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-th-border/70 bg-th-card/25 px-6 text-center text-sm text-th-text-muted">
                No items match this search or filter.
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {filteredTimeline.map((entry) =>
                    entry.kind === "message" ? (
                      <motion.div
                        key={`message-${entry.item.id}`}
                        layout="position"
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                        transition={{ type: "spring", stiffness: 360, damping: 26 }}
                      >
                        <MessageCard
                          message={entry.item}
                          currentDeviceId={deviceProfile?.id ?? null}
                          roomOwnerId={room?.created_by ?? null}
                          writable={canWrite}
                          copied={copiedId === entry.item.id}
                          onCopy={() => copyMessage(entry.item)}
                          onPin={() => updateMessage(entry.item.id, { is_pinned: !entry.item.is_pinned })}
                          onEdit={(nextText) => updateMessage(entry.item.id, { text: nextText })}
                          onResend={() => resendMessage(entry.item)}
                          onDelete={() => deleteMessage(entry.item.id)}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key={`file-${entry.item.id}`}
                        layout="position"
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                        transition={{ type: "spring", stiffness: 360, damping: 26 }}
                      >
                        <FileCard
                          file={entry.item}
                          currentDeviceId={deviceProfile?.id ?? null}
                          roomOwnerId={room?.created_by ?? null}
                          writable={canWrite}
                          onDelete={() => deleteFile(entry.item.id)}
                          onNotice={setNotice}
                        />
                      </motion.div>
                    ),
                  )}
                </AnimatePresence>
                <div ref={endRef} />
              </div>
            )}
          </div>
        </section>
      </div>
      {isDeviceDialogOpen ? (
        <DeviceProfileDialog
          value={deviceNameInput}
          hasExistingProfile={Boolean(deviceProfile)}
          onChange={setDeviceNameInput}
          onSubmit={saveCurrentDevice}
          onClose={deviceProfile ? () => setIsDeviceDialogOpen(false) : undefined}
        />
      ) : null}
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
  currentDeviceId,
  roomOwnerId,
  writable,
  copied,
  onCopy,
  onPin,
  onEdit,
  onResend,
  onDelete,
}: {
  message: BridgeMessage;
  currentDeviceId: string | null;
  roomOwnerId: string | null;
  writable: boolean;
  copied: boolean;
  onCopy: () => void;
  onPin: () => void;
  onEdit: (text: string) => Promise<void>;
  onResend: () => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [isSaving, setIsSaving] = useState(false);

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextText = draft.trim();
    if (!nextText || nextText === message.text) {
      setDraft(message.text);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    await onEdit(nextText);
    setIsSaving(false);
    setIsEditing(false);
  }

  const isFresh = Boolean(
    currentDeviceId &&
    message.sender_device_id &&
    message.sender_device_id !== currentDeviceId &&
    Date.now() - new Date(message.created_at).getTime() < 3500,
  );

  return (
    <article
      className={cn(
        "relative rounded-lg border p-3 shadow-sm transition-all duration-300",
        message.is_pinned ? "border-th-border-strong bg-th-inner/40" : "border-th-border/70 bg-th-inner/30",
        isFresh && "border-th-accent ring-2 ring-emerald-400/50 shadow-[0_0_24px_rgba(52,211,153,0.22)]",
      )}
    >
      <SenderBadge
        name={message.sender_name}
        color={message.sender_color}
        senderDeviceId={message.sender_device_id}
        senderUserId={message.sender_user_id}
        currentDeviceId={currentDeviceId}
        roomOwnerId={roomOwnerId}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-th-text-muted">
          {message.type === "code" ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-th-accent-text">
              {detectCodeLanguage(message.text)}
            </span>
          ) : (
            <span className="rounded-full bg-th-card/70 px-2 py-1 font-medium uppercase text-th-text-muted">{message.type}</span>
          )}
          <span>{formatTime(message.created_at)}</span>
          {message.is_pinned ? <span className="font-medium text-th-text-sub">Pinned</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <IconButton label={copied ? "Copied" : "Copy"} onClick={onCopy} tone={copied ? "success" : "info"}>
              <Copy className="size-4" />
            </IconButton>
            <AnimatePresence>
              {copied && (
                <motion.span
                  initial={{ opacity: 0, y: 2, scale: 0.7 }}
                  animate={{ opacity: 1, y: -22, scale: 1 }}
                  exit={{ opacity: 0, y: -28, scale: 0.8 }}
                  transition={{ duration: 0.22 }}
                  className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-slate-950 shadow-md shadow-emerald-500/30 z-30"
                >
                  Copied!
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <IconButton label="Resend" onClick={onResend} disabled={!writable}>
            <RotateCcw className="size-4" />
          </IconButton>
          <IconButton label="Edit" onClick={() => setIsEditing((current) => !current)} disabled={!writable}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label={message.is_pinned ? "Unpin" : "Pin"} onClick={onPin} tone={message.is_pinned ? "accent" : "neutral"} disabled={!writable}>
            {message.is_pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </IconButton>
          <IconButton label="Delete" onClick={onDelete} disabled={!writable}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      {isEditing ? (
        <form onSubmit={(event) => void saveEdit(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            className="min-h-24 flex-1 resize-y rounded-lg border border-th-border bg-th-card/50 px-3 py-2 text-sm text-th-text-sub outline-none focus:border-th-border-strong"
          />
          <div className="flex gap-2 sm:flex-col">
            <button disabled={isSaving || !draft.trim()} className="rounded-md border border-th-accent/40 bg-th-accent-soft/10 px-3 py-2 text-xs font-semibold text-th-accent-text disabled:opacity-50">
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => { setDraft(message.text); setIsEditing(false); }} className="rounded-md border border-th-border px-3 py-2 text-xs font-semibold text-th-text-muted">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-th-text-sub">{message.text}</pre>
          <MessagePreview message={message} />
        </>
      )}
    </article>
  );
}

function FileCard({
  file,
  currentDeviceId,
  roomOwnerId,
  writable,
  onDelete,
  onNotice,
}: {
  file: BridgeFile;
  currentDeviceId: string | null;
  roomOwnerId: string | null;
  writable: boolean;
  onDelete: () => void;
  onNotice: (message: string) => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  async function downloadFile() {
    if (isDownloading) return;

    setIsDownloading(true);
    playCopySound();
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

  const isFresh = Boolean(
    currentDeviceId &&
    file.sender_device_id &&
    file.sender_device_id !== currentDeviceId &&
    Date.now() - new Date(file.created_at).getTime() < 3500,
  );

  return (
    <article
      className={cn(
        "relative rounded-lg border p-3 shadow-sm transition-all duration-300 backdrop-blur-sm",
        "border-th-border/70 bg-th-inner/30",
        isFresh && "border-th-accent ring-2 ring-emerald-400/50 shadow-[0_0_24px_rgba(52,211,153,0.22)]",
      )}
    >
      <SenderBadge
        name={file.sender_name}
        color={file.sender_color}
        senderDeviceId={file.sender_device_id}
        senderUserId={file.sender_user_id}
        currentDeviceId={currentDeviceId}
        roomOwnerId={roomOwnerId}
      />
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
          <IconButton label="Delete" onClick={onDelete} tone="danger" disabled={!writable}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
      <FilePreview file={file} />
    </article>
  );
}

function uploadFileWithProgress(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
  xhrRef: { current: XMLHttpRequest | null },
) {
  return new Promise<BridgeFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.timeout = 600_000;

    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });
    xhr.onload = () => {
      xhrRef.current = null;
      let payload: { error?: string } & Partial<BridgeFile> = {};
      try {
        payload = JSON.parse(xhr.responseText) as typeof payload;
      } catch {
        reject(new Error("The server returned an unreadable response."));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(payload.error ?? "Upload failed."));
        return;
      }
      resolve(payload as BridgeFile);
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      reject(new Error("Network error while uploading."));
    };
    xhr.ontimeout = () => {
      xhrRef.current = null;
      reject(new Error("Upload timed out. Try again."));
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      reject(new DOMException("Upload canceled", "AbortError"));
    };
    xhr.send(formData);
  });
}

function SenderBadge({
  name,
  color,
  senderDeviceId,
  senderUserId,
  currentDeviceId,
  roomOwnerId,
}: {
  name: string | null;
  color: string | null;
  senderDeviceId: string | null;
  senderUserId: string | null;
  currentDeviceId: string | null;
  roomOwnerId: string | null;
}) {
  const isYou = Boolean(senderDeviceId && currentDeviceId && senderDeviceId === currentDeviceId);
  const isOwner = Boolean(senderUserId && roomOwnerId && senderUserId === roomOwnerId);
  const isVerified = Boolean(senderUserId);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span
        className="grid size-7 place-items-center rounded-full border border-white/10 font-bold text-slate-950"
        style={{ backgroundColor: color ?? "#a3a3a3" }}
        aria-hidden="true"
      >
        {(name?.trim().charAt(0) || "?").toUpperCase()}
      </span>
      <span className="font-semibold text-th-text-sub">{name || "Unknown device"}</span>
      {isYou ? <span className="rounded-full bg-th-accent-soft/15 px-2 py-0.5 text-th-accent-text">You</span> : null}
      {isOwner ? <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-amber-300">Owner</span> : null}
      {!isOwner && isVerified ? <span className="rounded-full border border-sky-400/25 px-2 py-0.5 text-sky-300">Verified</span> : null}
      {!isVerified ? <span className="rounded-full border border-th-border/70 px-2 py-0.5 text-th-text-muted">Guest</span> : null}
    </div>
  );
}

function DeviceProfileDialog({
  value,
  hasExistingProfile,
  onChange,
  onSubmit,
  onClose,
}: {
  value: string;
  hasExistingProfile: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-th-overlay/80 px-4 py-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="device-profile-title">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-th-border/70 bg-th-card/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="grid size-12 place-items-center rounded-xl border border-th-accent/40 bg-th-accent-soft/10 text-th-accent-text">
            <Smartphone className="size-6" />
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-th-border/70 text-th-text-muted" aria-label="Close device profile">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <h2 id="device-profile-title" className="mt-4 text-xl font-bold text-th-text">
          {hasExistingProfile ? "Rename this device" : "What should we call this device?"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-th-text-muted">
          This name appears beside messages and files so everyone in the room knows where they came from.
        </p>
        <label className="mt-4 block text-sm font-semibold text-th-text-sub" htmlFor="device-name">Device name</label>
        <input
          id="device-name"
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, 32))}
          placeholder="e.g. Tanak's iPhone"
          autoFocus
          className="mt-2 w-full rounded-lg border border-th-border/70 bg-th-inner/30 px-4 py-3 text-th-text outline-none focus:border-th-border-strong"
        />
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-th-text-faint">
          <span>Saved only on this device</span>
          <span>{value.length}/32</span>
        </div>
        <button disabled={!value.trim()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-th-accent/60 bg-th-accent-soft/15 px-4 py-3 font-semibold text-th-text disabled:opacity-50">
          <Check className="size-4" /> Save device name
        </button>
      </form>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  tone = "neutral",
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger" | "info" | "success" | "accent";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
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
  const colorVal = parseColor(message.text);
  if (colorVal) {
    return <ColorPreviewCard color={colorVal} />;
  }

  const otpVal = parseOtpCode(message.text);
  if (otpVal) {
    return <OtpPreviewCard code={otpVal} />;
  }

  if (message.type === "link") {
    return <EnhancedLinkPreviewCard url={message.text} />;
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

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const exists = items.some((item) => item.id === nextItem.id);
  return exists ? items.map((item) => (item.id === nextItem.id ? nextItem : item)) : [...items, nextItem];
}
