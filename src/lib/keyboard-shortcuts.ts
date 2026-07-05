export type ShortcutRoute = "/command" | "/search";

export type ShortcutInput = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  editable?: boolean;
};

export function shortcutRouteForInput(input: ShortcutInput): ShortcutRoute | null {
  if (input.editable) return null;

  const key = input.key.toLowerCase();
  const commandModifier = Boolean(input.metaKey || input.ctrlKey);

  if (commandModifier && !input.altKey && key === "k") return "/command";
  if (!commandModifier && !input.altKey && !input.shiftKey && input.key === "/") return "/search";

  return null;
}

export function shouldTriggerPrivacyShieldShortcut(input: ShortcutInput): boolean {
  if (input.editable) return false;

  const key = input.key.toLowerCase();
  const commandModifier = Boolean(input.metaKey || input.ctrlKey);

  return commandModifier && input.shiftKey === true && !input.altKey && key === "l";
}
