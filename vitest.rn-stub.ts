// Vitest runs src/lib in Node; React Native modules are not needed there.
export const I18nManager = { isRTL: false };
export const DevSettings = {};
export const ExecutionEnvironment = {};
export default {};
// expo-secure-store: nothing saved, so every setting is its default.
export const getItem = () => null;
export const setItem = () => undefined;
