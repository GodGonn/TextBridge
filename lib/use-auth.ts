"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    if (!supabase) return { error: new Error("Supabase is not configured") };

    setAuthError(null);
    setSigningIn(true);

    try {
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });

      if (result.error) {
        setAuthError(result.error.message);
        setSigningIn(false);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start Google sign-in.";
      setAuthError(message);
      setSigningIn(false);
      return { error: new Error(message) };
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return {
    session,
    loading,
    signingIn,
    authError,
    signInWithGoogle,
    signOut,
    isConfigured: Boolean(supabase),
  };
}
