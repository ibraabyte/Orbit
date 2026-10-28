import { defineConfig } from "vitest/config";

// Date logic is local-time based; pin the zone so results match on every machine and CI.
process.env.TZ = "Asia/Riyadh";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@react-native-async-storage/async-storage": new URL("./vitest.rn-stub.ts", import.meta.url).pathname,
      "react-native-url-polyfill/auto": new URL("./vitest.rn-stub.ts", import.meta.url).pathname
    }
  }
});
