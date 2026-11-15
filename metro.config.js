// Expo's default Metro setup, plus one rule: skip the agent worktrees under .claude/worktrees. Each is a full copy of
// the app with its own node_modules, and scanning them made Metro hang with duplicate modules.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], /[/\\]\.claude[/\\]worktrees[/\\].*/);

module.exports = config;
