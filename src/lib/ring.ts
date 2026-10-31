// A ring gauge without SVG: two clipped half-discs, each rotated.
// The right half fills 0-50% (0 to 180 degrees), the left half fills 50-100%.
export function ringRotations(value: number) {
  const degrees = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 360;
  return { right: Math.min(degrees, 180), left: Math.max(0, degrees - 180) };
}

// Bar heights (in %) for a small trend chart; a day with nothing still shows a stub.
export function barHeights(values: number[], minimum = 4) {
  const max = Math.max(1, ...values);
  return values.map((value) => Math.max(minimum, (Math.max(0, value) / max) * 100));
}
