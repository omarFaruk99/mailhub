"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/callout";
import { api, ApiError } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Shown inline rather than as a toast: a toast fades in a few seconds, but
  // "why didn't that work" should stay on screen until the next attempt.
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Decorative shape, bottom-left — theme tokens only, so it's correct in dark mode too. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full blur-2xl"
        style={{ background: "color-mix(in oklch, var(--sidebar-primary) 22%, transparent)" }}
      />
      <Card className="relative w-full max-w-sm">
        <CardContent className="flex flex-col gap-6 pt-2 pb-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-lg font-bold tracking-tight">MailHub</span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
              <p className="text-sm text-muted-foreground">Sign in to access your account</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Callout tone="danger" icon={<AlertCircle className="size-4" />}>
                {error}
              </Callout>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" required>
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                  required
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" required>
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!error}
                  required
                  className="pl-8 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-8 place-items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} size="lg" className="mt-2">
              {loading ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
