import AsyncStorage from "@react-native-async-storage/async-storage";
import { consentKey, consentWith, parseConsent, withdrawKeys } from "@/lib/ask";

// Whether this person agreed to send their data to an AI (Ask Orbit and the morning brief), and to which one. Kept only on this phone.

// Anything unreadable counts as "not agreed", so the question is asked again rather than skipped.
export async function loadAskConsent(userId: string): Promise<string | null> {
  try {
    return parseConsent(await AsyncStorage.getItem(consentKey(userId)));
  } catch {
    return null;
  }
}

// These two throw if the change did not happen, so the screen never shows a choice that was not kept.
// Adds `provider` to the AIs already agreed to, so picking another AI never takes the first agreement away.
export async function saveAskConsent(userId: string, provider: string) {
  const current = await loadAskConsent(userId);
  await AsyncStorage.setItem(consentKey(userId), consentWith(current, provider));
}
// Also drops the saved AI brief, so a text written under the agreement is not shown after it is withdrawn.
export const clearAskConsent = (userId: string) => AsyncStorage.multiRemove(withdrawKeys(userId));
