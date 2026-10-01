"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { BridgeFile } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FilePreview({ file }: { file: BridgeFile }) {
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
          <img src={file.file_url} alt={file.file_name} className="max-h-[30rem] w-full object-contain" />
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

export function isImageFile(file: BridgeFile) {
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
