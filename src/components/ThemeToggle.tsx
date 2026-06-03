import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function initTheme() {
  if (typeof window === "undefined") return;
  const saved = (localStorage.getItem("theme") as Theme | null) ?? "dark";
  applyTheme(saved);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as Theme | null) ?? "dark";
  });

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") localStorage.setItem("theme", theme);
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ theme }).eq("id", user.id);
    })();
  }, [theme]);

  const nextLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Button size="icon" variant="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={nextLabel} aria-label={nextLabel}>
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
