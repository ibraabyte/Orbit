import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const authFormText = readFileSync(join(process.cwd(), "src", "components", "auth-form.tsx"), "utf8");
const setupRequiredText = readFileSync(join(process.cwd(), "src", "components", "setup-required.tsx"), "utf8");
const appShellText = readFileSync(join(process.cwd(), "src", "components", "app-shell.tsx"), "utf8");
const globalCssText = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("auth and setup surface design contract", () => {
  it("keeps the auth form aligned with the redesigned entry panel", () => {
    expect(authFormText).toContain('className="auth-panel-header"');
    expect(authFormText).toContain('className="auth-context-badge"');
    expect(authFormText).toContain("Private workspace");
    expect(authFormText).toContain('className="auth-copy"');
    expect(authFormText).toContain('aria-busy={loading}');
    expect(authFormText).toContain('disabled={loading}');
    expect(authFormText).toContain('role="alert"');
    expect(authFormText).toContain('role="status"');
  });

  it("keeps setup and shell-loading states in the same visual language", () => {
    expect(setupRequiredText).toContain('className="auth-panel-header"');
    expect(setupRequiredText).toContain("Setup required");
    expect(setupRequiredText).toContain('className="auth-copy"');
    expect(appShellText).toContain('aria-label="Opening Orbit"');
    expect(appShellText).toContain("Opening");
    expect(appShellText).toContain('className="auth-copy"');
  });

  it("keeps auth surfaces styled as deliberate app UI instead of bare forms", () => {
    expect(globalCssText).toContain(".auth-panel-header");
    expect(globalCssText).toContain(".auth-context-badge");
    expect(globalCssText).toContain(".auth-copy");
    expect(globalCssText).toContain('.auth-panel[aria-busy="true"]');
    expect(globalCssText).toContain(".auth-panel code");
  });

  it("keeps shared feedback states visually distinct", () => {
    expect(globalCssText).toContain(".notice:not(.with-icon)::before");
    expect(globalCssText).toContain(".notice.success:not(.with-icon)::before");
    expect(globalCssText).toContain(".notice.danger:not(.with-icon)::before");
    expect(globalCssText).toContain("div.error::before");
    expect(globalCssText).toContain("div.success:not(.notice)::before");
  });

  it("keeps compact controls resilient on small screens", () => {
    expect(globalCssText).toContain(".filter-bar .segmented");
    expect(globalCssText).toContain("grid-template-columns: repeat(auto-fit, minmax(92px, 1fr))");
    expect(globalCssText).toContain(".row-actions .cadence-button");
    expect(globalCssText).toContain(".inline-form");
  });

  it("keeps dense badges and stats resilient", () => {
    expect(globalCssText).toContain(".badge::before");
    expect(globalCssText).toContain(".badge:has(svg)::before");
    expect(globalCssText).toContain("text-overflow: ellipsis");
    expect(globalCssText).toContain(".stat-label");
    expect(globalCssText).toContain(".stat-value");
  });

  it("keeps shared form controls keyboard-polished", () => {
    expect(globalCssText).toContain(".capture-file-zone:focus-within");
    expect(globalCssText).toContain(".check-row:focus-within");
    expect(globalCssText).toContain(".preference-check:focus-within");
    expect(globalCssText).toContain(".preference-check:has(input:disabled):focus-within");
  });

  it("keeps shell navigation interaction states deliberate", () => {
    expect(globalCssText).toContain(".quick-action-link:focus-visible");
    expect(globalCssText).toContain(".nav-link:focus-visible");
    expect(globalCssText).toContain(".shortcut-link:focus-visible");
    expect(globalCssText).toContain("scrollbar-color:");
  });

  it("keeps shared system banners and dialogs polished", () => {
    expect(globalCssText).toContain(".app-status-banner::before");
    expect(globalCssText).toContain(".app-status-banner > svg");
    expect(globalCssText).toContain(".app-status-action");
    expect(globalCssText).toContain(".dialog-panel::before");
    expect(globalCssText).toContain("max-height: calc(100dvh - 40px)");
    expect(globalCssText).toContain(".dialog-actions .button");
    expect(globalCssText).toContain(".privacy-shield-panel::before");
    expect(globalCssText).toContain("max-height: calc(100dvh - 48px)");
  });
});
