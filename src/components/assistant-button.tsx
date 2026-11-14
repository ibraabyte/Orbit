import { Image } from "react-native";

// The Trail symbol. The file is sand; tintColor redraws it in one colour (a dynamic colour isn't accepted here).
// The phone's tab bar holds the assistant as its middle tab (src/app/(tabs)/_layout.tsx); the iPad sidebar uses this.
export function OrbitMark({ size, color }: { size: number; color: string }) {
  return <Image source={require("../../assets/brand/night/symbol-sand-1024.png")} style={{ width: size, height: size, tintColor: color }} accessibilityIgnoresInvertColors />;
}
