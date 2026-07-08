import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowRight, Dice5, Sparkles, Users } from "lucide-react";
import loginHero from "@/assets/login-hero.png";
import { DesktopUpdater } from "@/components/DesktopUpdater";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in or create an account — D20 Project" },
      { name: "description", content: "Sign in to D20 Project or create a free account to start running and joining online tabletop RPG campaigns in real time." },
      { property: "og:title", content: "Sign in or create an account — D20 Project" },
      { property: "og:description", content: "Sign in to D20 Project or create a free account to start running and joining online tabletop RPG campaigns in real time." },
      { property: "og:url", content: "https://d20project.lovable.app/auth" },
    ],
    links: [
      { rel: "canonical", href: "https://d20project.lovable.app/auth" },
    ],
  }),
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  function postAuthRedirect() {
    const pending = typeof window !== "undefined" ? sessionStorage.getItem("pendingInvite") : null;
    if (pending) {
      sessionStorage.removeItem("pendingInvite");
      navigate({ to: "/join/$inviteCode", params: { inviteCode: pending } });
    } else {
      navigate({ to: "/dashboard" });
    }
  }

  useEffect(() => {
    if (!loading && user) postAuthRedirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else postAuthRedirect();
  }


  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Check your email to confirm your account.");
  }

  async function signInWithGoogle() {
    const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined;
    const redirectTo = configuredRedirect || (typeof window !== "undefined"
      ? `${window.location.origin}/auth`
      : undefined);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) toast.error(formatAuthError(error.message));
  }


  return (
    <div className="min-h-screen bg-[#06070a] text-white">
      <div className="grid min-h-screen lg:grid-cols-[420px_1fr]">
        <aside className="flex min-h-screen flex-col justify-between bg-[#f5f5f2] px-10 py-10 text-[#14161b] shadow-2xl lg:px-14">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-red-600 shadow-lg shadow-red-600/25">
                <Dice5 className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight">D20 Project</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">Virtual Tabletop</p>
              </div>
            </Link>

            <div className="mt-20">
              <h1 className="text-2xl font-black tracking-tight">Fazer login</h1>
              <p className="mt-2 text-sm font-medium text-zinc-500">Entre para voltar direto para sua mesa.</p>
            </div>

            <Tabs defaultValue="signin" className="mt-10">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-md bg-zinc-200 p-1">
                <TabsTrigger value="signin" className="rounded-sm text-xs font-black uppercase tracking-wide">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-sm text-xs font-black uppercase tracking-wide">Criar</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-8">
                <form onSubmit={signIn} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 rounded bg-zinc-200 text-sm font-bold text-zinc-950 placeholder:text-zinc-400" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Senha</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 rounded bg-zinc-200 text-sm font-bold text-zinc-950" />
                  </div>
                  <Button type="submit" size="icon" disabled={busy} className="mx-auto mt-8 flex h-14 w-14 rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700">
                    <ArrowRight className="h-6 w-6" />
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="mt-8">
                <form onSubmit={signUp} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="dn" className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Nome</Label>
                    <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Red" className="h-12 rounded bg-zinc-200 text-sm font-bold text-zinc-950" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2" className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Email</Label>
                    <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 rounded bg-zinc-200 text-sm font-bold text-zinc-950" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw2" className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Senha</Label>
                    <Input id="pw2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-12 rounded bg-zinc-200 text-sm font-bold text-zinc-950" />
                  </div>
                  <Button type="submit" size="icon" disabled={busy} className="mx-auto mt-8 flex h-14 w-14 rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700">
                    <ArrowRight className="h-6 w-6" />
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-8 grid grid-cols-1 gap-3">
              <Button variant="outline" className="h-11 rounded bg-white font-bold text-zinc-800 hover:bg-zinc-100" onClick={signInWithGoogle}>
                Continuar com Google
              </Button>
            </div>
          </div>

          <div className="space-y-2 text-center text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
            <p>Não consegue iniciar sessão?</p>
            <button type="button" className="text-zinc-500 hover:text-red-600">Criar conta</button>
            <DesktopUpdater compact />
          </div>
        </aside>

        <main className="relative min-h-[44rem] overflow-hidden bg-[#08090d]">
          <img src={loginHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,7,10,0.24)_0%,rgba(6,7,10,0.02)_42%,rgba(6,7,10,0.70)_100%),linear-gradient(0deg,rgba(6,7,10,0.82)_0%,rgba(6,7,10,0.08)_48%,rgba(6,7,10,0.30)_100%)]" />
          <section className="relative z-10 flex min-h-screen flex-col justify-end px-10 py-12 lg:px-16">
            <div className="max-w-3xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-red-200 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> Multi-sistema
              </p>
              <h2 className="text-5xl font-black leading-none tracking-tight text-white drop-shadow-2xl xl:text-7xl">
                Sua mesa de RPG, em qualquer sistema.
              </h2>
              <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-zinc-200">
                Um virtual tabletop modular para mesas de RPG. Fichas dinamicas, rolagens em tempo real,
                chat integrado, mapas e um narrador de IA que conhece as regras do seu sistema.
              </p>
            </div>

            <div className="mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
              {[
                { icon: Users, title: "Multi-sistema", body: "Crie campanhas para qualquer sistema. Hoje Pokerole 2.0 e T20." },
                { icon: Dice5, title: "Rolagens em tempo real", body: "Dados, sucessos e modificadores compartilhados instantaneamente." },
                { icon: Sparkles, title: "Narrador de IA", body: "Treine a IA com PDFs e tenha um co-mestre que conhece as regras." },
              ].map((feature) => (
                <div key={feature.title} className="rounded-md border border-white/10 bg-black/35 p-4 backdrop-blur">
                  <feature.icon className="h-5 w-5 text-red-300" />
                  <h3 className="mt-3 text-sm font-black text-white">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-zinc-300">{feature.body}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function formatAuthError(message: string) {
  if (message.toLowerCase().includes("missing oauth secret")) {
    return "O login com Google ainda nao foi configurado no Supabase. Ative o provedor Google no painel do Supabase ou use email e senha por enquanto.";
  }

  return message;
}
