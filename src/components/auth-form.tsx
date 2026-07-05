"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { SetupRequired } from "@/components/setup-required";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!configured) return <SetupRequired />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = getSupabase();
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                display_name: displayName
              }
            }
          });

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <form className="auth-panel auth-form-panel" onSubmit={onSubmit} aria-busy={loading}>
          <div className="auth-panel-header">
            <div className="brand-mark">
              <div className="brand-glyph">O</div>
              <span>Orbit</span>
            </div>
            <span className="auth-context-badge">Private workspace</span>
          </div>
          <div className="auth-copy">
            <h1>{mode === "sign-in" ? "Sign in to Orbit" : "Create your Orbit account"}</h1>
            <p>
              {mode === "sign-in"
                ? "Open your daily command center."
                : "Start with tasks, reminders, captures, and health logs in one place."}
            </p>
          </div>

          <div className="form-grid auth-fields">
            {mode === "sign-up" ? (
              <div className="field">
                <label htmlFor="displayName">Display name</label>
                <input
                  id="displayName"
                  className="input"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ibrahim"
                  disabled={loading}
                />
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                required
              />
            </div>
            {error ? (
              <div className="error" role="alert">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="success" role="status">
                {message}
              </div>
            ) : null}
            <button className="button primary" type="submit" disabled={loading}>
              {loading ? <Loader2 size={16} aria-hidden="true" /> : null}
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </div>

          <p className="auth-switch-copy">
            {mode === "sign-in" ? "No account yet? " : "Already have an account? "}
            <Link href={mode === "sign-in" ? "/sign-up" : "/sign-in"}>
              {mode === "sign-in" ? "Create one" : "Sign in"}
            </Link>
          </p>
        </form>
        <aside className="auth-proof-panel" aria-label="Orbit workspace preview">
          <div className="auth-proof-header">
            <span className="auth-context-badge">Today</span>
            <div>
              <div className="auth-hero-word">Orbit</div>
              <strong>Plan, capture, recover</strong>
            </div>
          </div>
          <div className="auth-proof-metrics" aria-label="Workspace snapshot">
            <div>
              <span>12</span>
              <small>open loops</small>
            </div>
            <div>
              <span>47m</span>
              <small>focus ready</small>
            </div>
            <div>
              <span>3</span>
              <small>health notes</small>
            </div>
          </div>
          <div className="auth-proof-list">
            <div className="auth-proof-row success">
              <span>Focus blocks</span>
              <strong>3 ready</strong>
            </div>
            <div className="auth-proof-row warning">
              <span>Inbox triage</span>
              <strong>8 items</strong>
            </div>
            <div className="auth-proof-row">
              <span>Health logs</span>
              <strong>2 today</strong>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
