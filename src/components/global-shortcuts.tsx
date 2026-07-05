"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { shortcutRouteForInput } from "@/lib/keyboard-shortcuts";

export function GlobalShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const route = shortcutRouteForInput({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        editable: isEditableTarget(event.target)
      });

      if (!route) return;
      event.preventDefault();
      router.push(route);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
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
