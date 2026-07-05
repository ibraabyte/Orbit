import Link from "next/link";

export function SetupRequired() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-panel-header">
          <div className="brand-mark">
            <div className="brand-glyph">O</div>
            <span>Orbit</span>
          </div>
          <span className="auth-context-badge">Setup required</span>
        </div>
        <div className="auth-copy">
          <h1>Connect Supabase to use Orbit.</h1>
          <p>
            Add your project URL and anon key to <code>.env.local</code>, then restart the dev server.
          </p>
        </div>
        <div className="notice">
          Required: <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
        <p className="auth-switch-copy">
          The setup steps live in <Link href="https://supabase.com/docs/guides/getting-started">Supabase docs</Link> and
          this project&apos;s <code>README.md</code>.
        </p>
      </section>
    </main>
  );
}
