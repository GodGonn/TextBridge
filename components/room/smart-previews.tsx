"use client";

import { Check, Copy, ExternalLink, KeyRound, Palette, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { playCopySound } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";

// --- Color Detection ---
const HEX_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_REGEX = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const HSL_REGEX = /^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;

export function parseColor(text: string): string | null {
  const trimmed = text.trim();
  if (HEX_REGEX.test(trimmed) || RGB_REGEX.test(trimmed) || HSL_REGEX.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function ColorPreviewCard({ color }: { color: string }) {
  const [copied, setCopied] = useState(false);

  const copyColor = async () => {
    await navigator.clipboard.writeText(color);
    playCopySound();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-th-border/70 bg-th-card/50 p-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {/* Swatch with transparency checkerboard background */}
        <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-white/20 shadow-inner [background-image:linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] [background-position:0_0,0_5px,5px_-5px,-5px_0px] [background-size:10px_10px]">
          <div className="size-full" style={{ backgroundColor: color }} />
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs text-th-text-muted">
            <Palette className="size-3.5 text-th-accent-text" />
            <span className="uppercase tracking-wider">Color preview</span>
          </div>
          <p className="font-mono text-sm font-semibold text-th-text">{color}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={copyColor}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition active:scale-95",
          copied
            ? "border-th-accent/50 bg-th-accent-soft/20 text-th-accent-text"
            : "border-th-border/80 bg-th-card/60 text-th-text-muted hover:border-th-border-strong hover:text-th-text",
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span>{copied ? "Copied" : "Copy color"}</span>
      </button>
    </div>
  );
}

// --- OTP / 2FA Code Detection ---
export function parseOtpCode(text: string): string | null {
  const trimmed = text.trim();
  // Pure 4 to 8 digit number or 3-3 format
  if (/^\d{4,8}$/.test(trimmed)) return trimmed;
  if (/^\d{3}[-\s]\d{3}$/.test(trimmed)) return trimmed.replace(/[-\s]/g, "");

  // "OTP is 123456", "Your code: 839201", "รหัส OTP: 948123"
  const match = text.match(/(?:otp|code|pin|verification|รหัส(?:ยืนยัน)?)\s*(?:is|คือ|:|=)?\s*([0-9]{4,8})\b/i);
  if (match?.[1]) {
    return match[1];
  }

  return null;
}

export function OtpPreviewCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    playCopySound();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-th-accent/40 bg-gradient-to-r from-th-accent-soft/10 via-th-card/50 to-th-inner/40 p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-th-accent-text">
            <ShieldCheck className="size-4" />
            <span className="uppercase tracking-wider">Verification / OTP Code</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-2xl font-bold tracking-[0.28em] text-th-text">
            {code}
          </div>
        </div>

        <button
          type="button"
          onClick={copyCode}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition active:scale-95 shadow-sm",
            copied
              ? "border-th-accent bg-th-accent text-slate-950 shadow-emerald-500/25"
              : "border-th-accent/50 bg-th-accent-soft/20 text-th-accent-text hover:bg-th-accent-soft/30 hover:border-th-accent",
          )}
        >
          {copied ? <Check className="size-4 stroke-[2.5]" /> : <Copy className="size-4" />}
          <span>{copied ? "Copied code!" : "Copy Code"}</span>
        </button>
      </div>
    </div>
  );
}

// --- Enhanced Link Preview with Favicon ---
export function EnhancedLinkPreviewCard({ url }: { url: string }) {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const domain = parsed.hostname.replace(/^www\./, "");
  const title = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/";
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group mt-3 block overflow-hidden rounded-lg border border-th-border/70 bg-th-card/40 p-3 transition hover:border-th-border-strong hover:bg-th-elevated/60"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-th-border bg-th-elevated overflow-hidden p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={faviconUrl}
            alt=""
            className="size-5 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-th-text group-hover:text-th-accent-text transition-colors">
              {domain}
            </p>
            <ExternalLink className="size-3 text-th-text-faint group-hover:text-th-accent-text transition-colors" />
          </div>
          <p className="mt-1 truncate text-xs text-th-text-muted font-mono">{decodeURIComponent(title)}</p>
          <p className="mt-1.5 text-[10px] uppercase tracking-wider text-th-text-faint font-semibold">
            {parsed.protocol.replace(":", "").toUpperCase()} • Link
          </p>
        </div>
      </div>
    </a>
  );
}

// --- Code Snippet Language Badge ---
export function detectCodeLanguage(code: string): string {
  if (/<[a-z][\s\S]*>/i.test(code)) return "HTML / JSX";
  if (/\b(def|import|elif|lambda)\b/i.test(code)) return "Python";
  if (/\b(const|let|var|function|=>|async)\b/i.test(code)) return "JavaScript / TypeScript";
  if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i.test(code)) return "SQL";
  if (/^[\s\t]*[{\[]/i.test(code) && /[}\]][\s\t]*$/i.test(code)) return "JSON";
  if (/(\$|npm|pnpm|bun|yarn|git|docker)\b/i.test(code)) return "Shell / CLI";
  return "Code";
}

