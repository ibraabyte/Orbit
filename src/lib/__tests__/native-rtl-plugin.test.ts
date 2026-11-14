import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addNativeRtl } = require("../../../plugins/with-native-rtl") as { addNativeRtl: (contents: string) => string };

// The didFinishLaunching body Expo's prebuild writes (SDK 58, scene-based life cycle).
const appDelegate = `  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    reactNativeFactory = factory

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
`;

describe("native RTL plugin", () => {
  it("makes UIKit right to left before launch finishes, only when React Native's forceRTL flag is saved", () => {
    const out = addNativeRtl(appDelegate);
    const rtl = out.indexOf('UserDefaults.standard.bool(forKey: "RCTI18nUtil_forceRTL")');
    expect(rtl).toBeGreaterThan(0);
    expect(rtl).toBeLessThan(out.indexOf("return super.application"));
    expect(out).toContain("UIView.appearance().semanticContentAttribute = .forceRightToLeft");
    expect(out).toContain("traitOverrides.layoutDirection = .rightToLeft");
  });

  it("adds the code once, however many times prebuild runs", () => {
    const once = addNativeRtl(appDelegate);
    expect(addNativeRtl(once)).toBe(once);
  });

  it("fails the build loudly when the AppDelegate no longer has the line it hooks into", () => {
    expect(() => addNativeRtl("class AppDelegate {}")).toThrow(/with-native-rtl/);
  });
});
