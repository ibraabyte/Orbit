// Matches the server's rules (backend/app/schemas/auth.py), so most mistakes show before a round trip.
export const MIN_PASSWORD_LENGTH = 8;

export function signUpProblem({ email, password, confirm }: { email: string; password: string; confirm: string }) {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Enter a valid email.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

// The phone's time zone, so "today" on the server matches the user's day.
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
