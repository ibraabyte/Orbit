"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { ModuleCard } from "@/components/module-card";
import { installHelpForUserAgent, isStandaloneDisplay } from "@/lib/pwa-install";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstallPanel() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const installHelp = useMemo(
    () => installHelpForUserAgent(typeof navigator === "undefined" ? "" : navigator.userAgent),
    []
  );

  useEffect(() => {
    const standalone = isStandaloneDisplay({
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
      navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone
    });
    setInstalled(standalone);

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMessage(null);
    }

    function onAppInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("Orbit is installed on this device.");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setMessage(installHelp.detail);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted" ? "Install started." : "Install was dismissed.");
  }

  return (
    <ModuleCard title="Install app" kicker={installed ? "Running as an installed app." : installPrompt ? "Install prompt is available." : installHelp.label}>
      <div className="form-grid">
        <div className={installed ? "success" : "notice"} role="status">
          {installed ? <CheckCircle2 size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
          {installed ? "Orbit is already installed on this device." : installPrompt ? "Install Orbit for a standalone app window and faster access." : installHelp.detail}
        </div>
        {!installed ? (
          <button className="button primary" type="button" onClick={install}>
            <Download size={16} aria-hidden="true" />
            {installPrompt ? "Install Orbit" : "Show install help"}
          </button>
        ) : null}
        {message ? <div className={message.includes("installed") || message.includes("started") ? "success" : "notice"} role="status">{message}</div> : null}
      </div>
    </ModuleCard>
  );
}
