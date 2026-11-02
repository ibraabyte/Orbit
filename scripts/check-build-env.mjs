// Runs on EAS before `npm install` (the `eas-build-pre-install` hook).
// Stops a cloud build that would ship an app with no server to sign in to.
// The value comes from the EAS environment, not the repo: see docs/ios-build.md.
const url = process.env.EXPO_PUBLIC_API_URL ?? "";

if (!/^https:\/\/[^\s/]+/.test(url)) {
  console.error(
    "EXPO_PUBLIC_API_URL is missing or not https. Set it once with:\n" +
      "  eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://<your-server> --visibility plaintext",
  );
  process.exit(1);
}

console.log(`EXPO_PUBLIC_API_URL is set (${new URL(url).host}).`);
