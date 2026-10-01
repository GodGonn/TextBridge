"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { isSoundEnabled, setSoundEnabled, playCopySound } from "@/lib/sound-effects";
import { cn } from "@/lib/utils";

export function SoundToggle({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSoundEnabled(next);
    if (next) {
      playCopySound();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "group relative grid size-10 place-items-center overflow-hidden rounded-lg border border-th-border bg-th-card/60 text-th-text transition hover:border-th-border-strong hover:bg-th-elevated active:scale-95",
        enabled ? "text-th-accent-text" : "text-th-text-muted",
        className,
      )}
      aria-label={enabled ? "Mute interface sounds" : "Enable interface sounds"}
      title={enabled ? "Interface sounds: On (Click to mute)" : "Interface sounds: Muted (Click to enable)"}
    >
      <Volume2
        className={cn(
          "absolute size-5 transition-all duration-300",
          enabled ? "scale-100 opacity-100" : "scale-0 opacity-0",
        )}
      />
      <VolumeX
        className={cn(
          "absolute size-5 transition-all duration-300",
          !enabled ? "scale-100 opacity-100" : "scale-0 opacity-0",
        )}
      />
    </button>
  );
}

