"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { BarChart3, ClipboardList, Eye, EyeOff, Home, LogOut, Menu, Plus, Shield, type LucideIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { DashboardDataProvider } from "@/hooks/use-dashboard-data";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { OfflineStatusBanner } from "@/components/offline-status-banner";
import { SetupRequired } from "@/components/setup-required";
import { shouldTriggerPrivacyShieldShortcut } from "@/lib/keyboard-shortcuts";
import { readQueuedCaptures, type OfflineCaptureDraft } from "@/lib/offline-queue";
import { downloadSignOutOfflineQueueRescue, signOutOfflineQueuePrompt } from "@/lib/offline-queue-rescue";
import { privacyShieldRequestEvent, readPrivacyShieldAutoLock } from "@/lib/privacy-shield";

const primaryTabs: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/plan", label: "Plan", icon: ClipboardList },
  { href: "/momentum", label: "Momentum", icon: BarChart3 },
  { href: "/more", label: "More", icon: Menu }
];

// "More" is active for any route that is not a primary tab or the capture (Command) target.
const rootTabHrefs = ["/dashboard", "/plan", "/momentum", "/command"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { configured, loading, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [queuedSignOutCaptures, setQueuedSignOutCaptures] = useState<OfflineCaptureDraft[] | null>(null);
  const [privacyShielded, setPrivacyShielded] = useState(false);
  const privacyRevealRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (configured && !loading && !user) {
      router.replace("/sign-in");
    }
  }, [configured, loading, router, user]);

  useEffect(() => {
    if (privacyShielded) {
      privacyRevealRef.current?.focus();
    }
  }, [privacyShielded]);

  useEffect(() => {
    function shieldApp() {
      setPrivacyShielded(true);
    }

    function autoShieldApp() {
      if (readPrivacyShieldAutoLock()) {
        shieldApp();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      const shouldShield = shouldTriggerPrivacyShieldShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        editable: isEditableTarget(event.target)
      });

      if (!shouldShield) return;
      event.preventDefault();
      shieldApp();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        autoShieldApp();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pagehide", autoShieldApp);
    window.addEventListener(privacyShieldRequestEvent, shieldApp);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pagehide", autoShieldApp);
      window.removeEventListener(privacyShieldRequestEvent, shieldApp);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!configured) return <SetupRequired />;

  if (loading || !user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" role="status" aria-live="polite" aria-label="Opening Orbit">
          <div className="auth-panel-header">
            <div className="brand-mark">
              <div className="brand-glyph">O</div>
              <span>Orbit</span>
            </div>
            <span className="auth-context-badge">Opening</span>
          </div>
          <div className="auth-copy" aria-hidden="true">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </section>
      </main>
    );
  }

  const activeUser = user;

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);

    try {
      const queuedCaptures = await readQueuedCaptures();

      if (queuedCaptures.length > 0) {
        setQueuedSignOutCaptures(queuedCaptures);
        setSigningOut(false);
        return;
      }

      await signOut();
      router.replace("/sign-in");
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign out could not finish because the offline queue could not be checked.");
      setSigningOut(false);
    }
  }

  async function confirmQueuedSignOut() {
    if (!queuedSignOutCaptures || signingOut) return;
    setSigningOut(true);
    setSignOutError(null);

    try {
      await downloadSignOutOfflineQueueRescue(activeUser.id, queuedSignOutCaptures);
      setQueuedSignOutCaptures(null);
      await signOut();
      router.replace("/sign-in");
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign out could not finish because the offline queue rescue could not be downloaded.");
      setSigningOut(false);
    }
  }

  function tabActive(href: string) {
    if (href === "/more") return !rootTabHrefs.includes(pathname);
    return pathname === href;
  }

  return (
    <>
      <div
        className="site-shell relative flex min-h-dvh flex-col text-on-shell"
        style={{ background: "linear-gradient(180deg, var(--color-shell-top), var(--color-shell))" }}
        aria-hidden={privacyShielded || queuedSignOutCaptures ? "true" : undefined}
        inert={privacyShielded || queuedSignOutCaptures ? true : undefined}
      >
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <GlobalShortcuts />

        <header className="mx-auto flex w-full max-w-[440px] items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2" aria-label="Orbit home">
            <span className="grid h-7 w-7 place-items-center rounded-[10px] bg-accent font-bold text-accent-ink">O</span>
            <span className="font-bold text-on-shell">Orbit</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPrivacyShielded(true)}
              aria-label="Hide app"
              title="Hide app · Cmd/Ctrl Shift L"
              className="grid h-9 w-9 place-items-center rounded-full border border-on-shell/20 text-on-shell transition-colors hover:bg-on-shell/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <EyeOff size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label="Sign out"
              className="grid h-9 w-9 place-items-center rounded-full border border-on-shell/20 text-on-shell transition-colors hover:bg-on-shell/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[440px] flex-1 px-4 pb-32">
          {signOutError ? (
            <div role="alert" className="mb-3 rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent">
              {signOutError}
            </div>
          ) : null}
          <OfflineStatusBanner userId={activeUser.id} />
          <DashboardDataProvider userId={activeUser.id}>{children}</DashboardDataProvider>
        </main>

        <nav
          aria-label="Primary navigation"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(12px,env(safe-area-inset-bottom))]"
        >
          <div className="pointer-events-auto mx-auto flex max-w-[440px] items-center justify-around gap-1 rounded-[26px] border border-hairline bg-surface/95 px-3 py-2 shadow-[0_8px_28px_oklch(0.15_0.02_150/0.35)] backdrop-blur">
            <BottomTab {...primaryTabs[0]} active={tabActive(primaryTabs[0].href)} />
            <BottomTab {...primaryTabs[1]} active={tabActive(primaryTabs[1].href)} />
            <CaptureFab />
            <BottomTab {...primaryTabs[2]} active={tabActive(primaryTabs[2].href)} />
            <BottomTab {...primaryTabs[3]} active={tabActive(primaryTabs[3].href)} />
          </div>
        </nav>
      </div>
      {privacyShielded ? <PrivacyShieldOverlay revealButtonRef={privacyRevealRef} onReveal={() => setPrivacyShielded(false)} /> : null}
      {queuedSignOutCaptures ? (
        <SignOutQueueDialog
          count={queuedSignOutCaptures.length}
          signingOut={signingOut}
          onCancel={() => setQueuedSignOutCaptures(null)}
          onConfirm={confirmQueuedSignOut}
        />
      ) : null}
    </>
  );
}

function BottomTab({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep ${
        active ? "text-accent-deep" : "text-nav-inactive"
      }`}
    >
      <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
      <span className="text-[10px] font-semibold">{label}</span>
    </Link>
  );
}

function CaptureFab() {
  return (
    <Link
      href="/command"
      aria-label="Capture"
      className="-mt-8 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_8px_20px_oklch(0.82_0.2_129/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep focus-visible:ring-offset-2"
    >
      <Plus size={26} strokeWidth={2.6} aria-hidden="true" />
    </Link>
  );
}

function SignOutQueueDialog({
  count,
  signingOut,
  onCancel,
  onConfirm
}: {
  count: number;
  signingOut: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || signingOut) return;
    event.preventDefault();
    onCancel();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onKeyDown={onDialogKeyDown}>
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="sign-out-queue-title">
        <div className="dialog-icon" aria-hidden="true">
          <Shield size={20} />
        </div>
        <div className="dialog-copy">
          <h2 id="sign-out-queue-title">Save offline captures before signing out</h2>
          <p>{signOutOfflineQueuePrompt(count)}</p>
        </div>
        <div className="dialog-actions">
          <button ref={cancelButtonRef} className="button" type="button" onClick={onCancel} disabled={signingOut}>
            Stay signed in
          </button>
          <button className="button primary" type="button" onClick={onConfirm} disabled={signingOut}>
            <LogOut size={16} aria-hidden="true" />
            {signingOut ? "Downloading rescue" : "Download and sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PrivacyShieldOverlay({
  revealButtonRef,
  onReveal
}: {
  revealButtonRef: RefObject<HTMLButtonElement | null>;
  onReveal: () => void;
}) {
  return (
    <div className="privacy-shield" role="dialog" aria-modal="true" aria-labelledby="privacy-shield-title">
      <section className="privacy-shield-panel">
        <div className="brand-mark">
          <div className="brand-glyph">O</div>
          <span>Orbit</span>
        </div>
        <div className="privacy-shield-icon" aria-hidden="true">
          <Shield size={22} />
        </div>
        <h1 id="privacy-shield-title">Orbit is hidden</h1>
        <p>Your open dashboard is covered on this device. This is a local screen shield, not a replacement for signing out.</p>
        <button ref={revealButtonRef} className="button primary" type="button" onClick={onReveal}>
          <Eye size={16} aria-hidden="true" />
          Reveal app
        </button>
      </section>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true']")) ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}
