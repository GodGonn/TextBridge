"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const handleInstalled = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void promptEvent.prompt().then(() => promptEvent.userChoice).finally(() => setPromptEvent(null));
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-th-border bg-th-card/60 px-3 py-2 text-sm font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/60 hover:text-th-text"
    >
      <Download className="size-4" />
      Install
    </button>
  );
}
