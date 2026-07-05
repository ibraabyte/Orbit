export type InstallHelp = {
  label: string;
  detail: string;
};

export function isStandaloneDisplay({
  displayModeStandalone,
  navigatorStandalone
}: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}) {
  return displayModeStandalone || Boolean(navigatorStandalone);
}

export function installHelpForUserAgent(userAgent: string): InstallHelp {
  const normalized = userAgent.toLowerCase();
  const isiOS = /iphone|ipad|ipod/.test(normalized);
  const isFirefox = normalized.includes("firefox");
  const isSafari = normalized.includes("safari") && !normalized.includes("chrome") && !normalized.includes("crios") && !normalized.includes("android");
  const isChromium = normalized.includes("chrome") || normalized.includes("crios") || normalized.includes("edg/");

  if (isiOS || isSafari) {
    return {
      label: "Use browser share",
      detail: "Open the browser share menu and choose Add to Home Screen."
    };
  }

  if (isFirefox) {
    return {
      label: "Install may be unavailable",
      detail: "This browser does not always expose a web app install prompt."
    };
  }

  if (isChromium) {
    return {
      label: "Use browser install",
      detail: "Look for the install action in the address bar or browser menu."
    };
  }

  return {
    label: "Use browser options",
    detail: "If this browser supports web apps, install Orbit from the browser menu."
  };
}
