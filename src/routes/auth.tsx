import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NsbLogo } from "@/components/brand/NsbLogo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { toast } from "sonner";

const search = z.object({
  mode: z.enum(["signin", "signup", "reset"]).optional(),
  ref: z.string().trim().min(1).max(32).optional(),
});

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — NSB Flow" },
      { name: "description", content: "Acesse a plataforma NSB Flow." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s) => search.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const { mode, ref } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* painel esquerdo */}
      <div className="hidden md:flex flex-col justify-between p-10 nsb-gradient text-primary-foreground">
        <NsbLogo />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-md"
        >
          <div className="text-gold text-xs tracking-[0.25em] uppercase mb-4">
            DEAP Method™
          </div>
          <h2 className="font-display text-3xl leading-tight">
            Inteligência comercial que acelera decisões.
          </h2>
          <p className="mt-4 text-primary-foreground/80">
            Briefings, análises de reunião e desenvolvimento organizacional em um só lugar.
          </p>
        </motion.div>
        <div className="text-xs text-primary-foreground/70">
          © {new Date().getFullYear()} NSB · Growth by Method
        </div>
      </div>

      {/* painel direito */}
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between md:justify-end mb-8">
          <div className="md:hidden">
            <NsbLogo />
          </div>
          <ThemeToggle />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm">
            <Tabs defaultValue={mode === "signup" ? "signup" : mode === "reset" ? "reset" : "signin"}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastro</TabsTrigger>
                <TabsTrigger value="reset">Recuperar</TabsTrigger>
              </TabsList>
              <TabsContent value="signin"><SignIn /></TabsContent>
              <TabsContent value="signup"><SignUp refCode={ref} /></TabsContent>
              <TabsContent value="reset"><Reset /></TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground text-center mt-8">
              <Link to="/" className="hover:underline">← Voltar ao site</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignIn() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4 mt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        setLoading(false);
        if (error) return toast.error(error.message);
        toast.success("Bem-vindo(a)!");
        nav({ to: "/app" });
      }}
    >
      <h2 className="font-display text-2xl font-semibold">Entrar</h2>
      <div className="space-y-2">
        <Label htmlFor="e">E-mail</Label>
        <Input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p">Senha</Label>
        <Input id="p" type="password" required value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4 mt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            emailRedirectTo: window.location.origin + "/app",
            data: { full_name: name },
          },
        });
        setLoading(false);
        if (error) return toast.error(error.message);
        toast.success("Conta criada. Verifique seu e-mail se solicitado.");
      }}
    >
      <h2 className="font-display text-2xl font-semibold">Criar conta</h2>
      <div className="space-y-2">
        <Label>Nome completo</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>E-mail corporativo</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Senha</Label>
        <Input type="password" required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Criando..." : "Criar conta"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Ao criar uma conta você concorda com o uso confidencial do DEAP Method™.
      </p>
    </form>
  );
}

function Reset() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4 mt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth",
        });
        setLoading(false);
        if (error) return toast.error(error.message);
        toast.success("Se o e-mail existir, enviamos um link de recuperação.");
      }}
    >
      <h2 className="font-display text-2xl font-semibold">Recuperar senha</h2>
      <div className="space-y-2">
        <Label>E-mail</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Enviando..." : "Enviar link"}
      </Button>
    </form>
  );
}
