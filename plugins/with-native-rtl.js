// In Arabic the app runs right to left through React Native's forceRTL, which only flips what React Native lays out.
// The native parts (the tab bar, the navigation bar with its large title, text fields) still follow the phone's own
// language, so the two disagreed: the tab bar sat left to right, and a large title could draw mirrored while it
// collapsed. This makes UIKit right to left too whenever React Native is, read at launch from the same saved flag
// I18nManager.forceRTL writes, so a language switch applies to both after the restart it already needs.
const { withAppDelegate } = require("expo/config-plugins");

const MARKER = "// orbit-native-rtl";
const SNIPPET = `    ${MARKER}: UIKit follows React Native's direction (see plugins/with-native-rtl.js).
    if UserDefaults.standard.bool(forKey: "RCTI18nUtil_forceRTL") {
      UIView.appearance().semanticContentAttribute = .forceRightToLeft
      if #available(iOS 17.0, *) {
        _ = NotificationCenter.default.addObserver(forName: UIWindow.didBecomeVisibleNotification, object: nil, queue: .main) { note in
          (note.object as? UIWindow)?.traitOverrides.layoutDirection = .rightToLeft
        }
      }
    }
`;

function addNativeRtl(contents) {
  if (contents.includes(MARKER)) return contents;
  const anchor = /^(\s*)return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/m;
  if (!anchor.test(contents)) throw new Error("with-native-rtl: AppDelegate.swift has no didFinishLaunching return to insert before");
  return contents.replace(anchor, (line) => `${SNIPPET}\n${line}`);
}

module.exports = function withNativeRtl(config) {
  return withAppDelegate(config, (next) => {
    if (next.modResults.language !== "swift") throw new Error("with-native-rtl: expected a Swift AppDelegate");
    next.modResults.contents = addNativeRtl(next.modResults.contents);
    return next;
  });
};
module.exports.addNativeRtl = addNativeRtl;
