import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="auth-shell">
      <div className="not-found-layout">
        <section className="auth-panel not-found-panel">
          <div className="brand-mark">
            <div className="brand-glyph">O</div>
            <span>Orbit</span>
          </div>
          <div className="not-found-code">404</div>
          <h1>This page is outside Orbit.</h1>
          <p>The link may be old, or the record may have moved. Head back to Today or search across your workspace.</p>
          <div className="not-found-actions">
            <Link className="button primary" href="/dashboard">
              <Home size={16} aria-hidden="true" />
              Today
            </Link>
            <Link className="button" href="/search">
              <Search size={16} aria-hidden="true" />
              Search
            </Link>
          </div>
        </section>
        <aside className="not-found-map" aria-label="Useful Orbit routes">
          <span className="auth-context-badge">Route map</span>
          <div className="not-found-route-list">
            <Link className="not-found-route-row" href="/tasks">
              <span>Tasks</span>
              <strong>workbench</strong>
            </Link>
            <Link className="not-found-route-row" href="/library">
              <span>Library</span>
              <strong>captures</strong>
            </Link>
            <Link className="not-found-route-row" href="/settings">
              <span>Settings</span>
              <strong>account</strong>
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
