"use client";

import { LogOut, UserRound } from "lucide-react";
import { useAuthSession } from "@/lib/use-auth";

export function AuthButton({ compact = false }: { compact?: boolean }) {
  const auth = useAuthSession();

  if (!auth.isConfigured) return null;
  if (auth.loading) return <div className="h-10 w-28 animate-pulse rounded-lg bg-th-elevated/60" />;

  if (!auth.session) {
    return (
      <button
        type="button"
        onClick={() => void auth.signInWithGoogle()}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-th-border bg-th-card/60 px-3 py-2 text-sm font-semibold text-th-text-sub transition hover:border-th-border-strong hover:bg-th-elevated/60 hover:text-th-text"
      >
        <span className="grid size-5 place-items-center rounded-full bg-white font-sans text-xs font-bold text-neutral-900">G</span>
        {compact ? "Sign in" : "Continue with Google"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-th-border/70 bg-th-card/40 p-1.5 pl-3">
      <UserRound className="size-4 text-th-accent-text" />
      {!compact ? <span className="max-w-44 truncate text-xs text-th-text-sub">{auth.session.user.email}</span> : null}
      <button type="button" onClick={() => void auth.signOut()} className="grid size-7 place-items-center rounded-md text-th-text-muted transition hover:bg-th-elevated hover:text-th-text" aria-label="Sign out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
