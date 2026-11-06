// A link shared from another app opens Orbit as orbit://dataUrl=orbitShareKey#weburl (expo-share-intent).
// That isn't a screen, so send it to the saver, which reads the shared link and saves it.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes("dataUrl=") ? "/library" : path;
}
