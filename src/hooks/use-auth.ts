import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    function finish(nextSession: Session | null) {
      if (!mounted) return;
      window.clearTimeout(timeout);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    }

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();

      supabase.auth.getSession()
        .then(({ data }) => finish(data.session))
        .catch((error) => {
          console.warn("[Auth] Could not restore session", error);
          finish(null);
        });
    } catch (error) {
      console.warn("[Auth] Could not initialize auth", error);
      finish(null);
    }

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      unsubscribe?.();
    };
  }, []);

  return { session, user, loading };
}
