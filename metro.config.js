// Expo's default Metro setup, plus one rule: skip the agent worktrees under .claude/worktrees. Each is a full copy of
// the app with its own node_modules, and scanning them made Metro hang with duplicate modules.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// Only the worktrees inside this copy: Metro run from a worktree must still see its own files.
const worktrees = path.join(__dirname, ".claude", "worktrees").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], new RegExp(`^${worktrees}[/\\\\].*`));

module.exports = config;
