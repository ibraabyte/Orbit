// Expo's default Metro setup, plus one rule: skip the agent worktrees under .claude/worktrees. Each is a full copy of
// the app with its own node_modules, and scanning them made Metro hang with duplicate modules. Only worktrees inside
// this folder are skipped, so a worktree can still run its own app.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const worktrees = path.join(__dirname, ".claude", "worktrees") + path.sep;
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], new RegExp(worktrees.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*"));

module.exports = config;
