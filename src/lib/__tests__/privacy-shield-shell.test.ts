import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appShellText = readFileSync(join(process.cwd(), "src", "components", "app-shell.tsx"), "utf8");
const settingsPanelText = readFileSync(join(process.cwd(), "src", "components", "settings-panel.tsx"), "utf8");
const keyboardShortcutsText = readFileSync(join(process.cwd(), "src", "lib", "keyboard-shortcuts.ts"), "utf8");
const privacyShieldText = readFileSync(join(process.cwd(), "src", "lib", "privacy-shield.ts"), "utf8");
const globalCssText = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("privacy shield shell integration", () => {
  it("keeps manual hide, shortcut hide, and reveal controls wired into the app shell", () => {
    expect(appShellText).toContain("privacyShielded");
    expect(appShellText).toContain("PrivacyShieldOverlay");
    expect(appShellText).toContain("Hide app");
    expect(appShellText).toContain("Cmd/Ctrl Shift L");
    expect(appShellText).toContain("Reveal app");
    expect(appShellText).toContain("shouldTriggerPrivacyShieldShortcut");
    expect(appShellText).toContain("aria-hidden={privacyShielded || queuedSignOutCaptures ? \"true\" : undefined}");
    expect(appShellText).toContain("inert={privacyShielded || queuedSignOutCaptures ? true : undefined}");
  });

  it("keeps background auto-shield opt-in through the local Settings panel", () => {
    expect(settingsPanelText).toContain("LocalPrivacyPanel");
    expect(settingsPanelText).toContain("readPrivacyShieldAutoLock");
    expect(settingsPanelText).toContain("savePrivacyShieldAutoLock");
    expect(settingsPanelText).toContain("privacyShieldRequestEvent");
    expect(settingsPanelText).toContain("Shield when app is hidden");
  });

  it("keeps the local preference, keyboard shortcut, and overlay styles present", () => {
    expect(privacyShieldText).toContain("orbit.privacy-shield.auto-lock-on-hidden");
    expect(privacyShieldText).toContain("orbit:privacy-shield");
    expect(keyboardShortcutsText).toContain("shouldTriggerPrivacyShieldShortcut");
    expect(keyboardShortcutsText).toContain('key === "l"');
    expect(globalCssText).toContain(".privacy-shield");
    expect(globalCssText).toContain(".privacy-shield-panel");
  });
});
