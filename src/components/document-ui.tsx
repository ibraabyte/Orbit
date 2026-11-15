import { Badge, type IconName } from "@/components/drift";
import { dx, hijriText, leftText, stateOf } from "@/lib/documents";
import type { DocumentKind, OfficialDocument } from "@/lib/types";

// Shared by the Documents screen and Today's card.

export const DOCUMENT_ICONS: Record<DocumentKind, IconName> = {
  national_id: "credit-card",
  iqama: "user-check",
  passport: "globe",
  driving_license: "navigation",
  health_insurance: "heart",
  visa: "send",
  other: "file-text"
};

export function DocumentBadge({ left }: { left: number }) {
  const state = stateOf(left);
  if (state === "expired") return <Badge tone="urgent" glyph="!">{leftText(left)}</Badge>;
  if (state === "soon") return <Badge tone="accent" glyph="◷">{leftText(left)}</Badge>;
  return <Badge tone="success" glyph="✓">{leftText(left)}</Badge>;
}

/** "Expires 1 Mar 2027", and whose it is when not the person's own; the Hijri date on a second line. */
export function documentSubtitle(document: OfficialDocument, left: number) {
  const hijri = hijriText(document.expires_on);
  const line = [document.holder, left < 0 ? dx.expiredOn(document.expires_on) : dx.expiresOn(document.expires_on)].filter(Boolean).join(" · ");
  return hijri ? `${line}\n${hijri}` : line;
}

