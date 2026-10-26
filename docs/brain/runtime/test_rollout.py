import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("brain_rollout", Path(__file__).with_name("brain.py"))
brain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brain)


class RolloutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.saved = {name: (hasattr(brain, name), getattr(brain, name, None)) for name in
                      ["SOURCE", "BRANCH", "PROJECT", "BOOTSTRAP_REF", "SSH_COMMAND", "BRAIN_DIR", "REMOTE_URL"]}
        self.addCleanup(self.restore)

    def restore(self):
        for name, (exists, value) in self.saved.items():
            if exists:
                setattr(brain, name, value)
            elif hasattr(brain, name):
                delattr(brain, name)

    def git(self, repo, *args, data=None):
        return subprocess.run(["git", "-C", str(repo), *args], input=data,
                              text=True, capture_output=True, check=True).stdout.strip()

    def repo(self, name):
        path = self.root / name
        subprocess.run(["git", "init", "--quiet", str(path)], check=True)
        return path

    def commit(self, repo, files, parent=None):
        index = self.root / (repo.name + ".index")
        env = os.environ.copy(); env["GIT_INDEX_FILE"] = str(index)
        def git(*args, data=None):
            return subprocess.run(["git", "-C", str(repo), *args], input=data, env=env,
                                  text=True, capture_output=True, check=True).stdout.strip()
        git("read-tree", "--empty")
        for name, content in files.items():
            blob = git("hash-object", "-w", "--stdin", data=content)
            git("update-index", "--add", "--cacheinfo", "100644", blob, name)
        tree = git("write-tree")
        args = ["-c", "user.name=Brain test", "-c", "user.email=brain@example.invalid", "commit-tree", tree]
        result = git(*args, *(["-p", parent] if parent else []), data="checkpoint\n")
        index.unlink()
        return result

    def configure(self, project, repo, canonical="refs/remotes/origin/trunk", **extra):
        runtime = self.root / "runtimes" / project
        runtime.mkdir(parents=True, exist_ok=True)
        config = {"schema": 1, "project": project, "source": str(repo), "canonical_ref": canonical, **extra}
        (runtime / "config.json").write_text(json.dumps(config))
        self.assertTrue(hasattr(brain, "configure"), "Per-project runtime configuration is missing")
        brain.configure(runtime)
        return runtime

    def test_docker_routes_requested_project_instead_of_madar(self):
        with mock.patch.object(brain, "PROJECT", "nasaq", create=True):
            args = brain.docker_args(self.root / "nasaq", "mcp", [])
        self.assertEqual(args[-2:], ["--project", "nasaq"])
        self.assertIn("BASIC_MEMORY_HOME=/notes/nasaq", args)
        self.assertNotIn("/notes/madar", " ".join(args))

    def test_two_project_configs_keep_notes_and_mcp_routing_separate(self):
        for slug in ["nasaq", "orbit"]:
            repo = self.repo(slug)
            content = {"docs/brain/overview.md": "# " + slug + "\n",
                       "docs/brain/current-state.md": "# " + slug + " checkpoint\n"}
            tip = self.commit(repo, content)
            self.git(repo, "update-ref", "refs/remotes/origin/trunk", tip)
            runtime = self.configure(slug, repo)
            with mock.patch.object(brain, "run_tool") as index:
                brain.refresh(runtime)
            self.assertEqual((runtime / "notes" / slug / "overview.md").read_text(), "# " + slug + "\n")
            self.assertFalse((runtime / "notes" / ("orbit" if slug == "nasaq" else "nasaq")).exists())
            index.assert_called_once_with(runtime, "bm", ["project", "index", slug])
            args = brain.docker_args(runtime, "mcp", [])
            self.assertEqual(args[-2:], ["--project", slug])
            self.assertNotIn(str(repo), " ".join(args))

    def test_bootstrap_yields_to_canonical_and_can_be_deleted(self):
        repo = self.repo("source")
        old = self.commit(repo, {"README.md": "# Source\n"})
        draft = self.commit(repo, {"docs/brain/overview.md": "# Draft\n",
                                   "docs/brain/current-state.md": "# Pending review\n",
                                   "docs/brain/project.json": json.dumps({"schema": 1, "project": "cockpit"})}, old)
        canonical = "refs/remotes/origin/stable"
        bootstrap = "refs/remotes/origin/docs/project-brain"
        self.git(repo, "update-ref", canonical, old)
        self.git(repo, "update-ref", bootstrap, draft)
        self.git(repo, "update-ref", "refs/heads/user-work", old)
        self.git(repo, "symbolic-ref", "HEAD", "refs/heads/user-work")
        runtime = self.configure("cockpit", repo, canonical, bootstrap_ref=bootstrap)
        with mock.patch.object(brain, "run_tool"):
            brain.refresh(runtime)
            self.assertEqual((runtime / "notes/cockpit/overview.md").read_text(), "# Draft\n")
            merged = self.commit(repo, {"docs/brain/overview.md": "# Reviewed canonical\n",
                                        "docs/brain/current-state.md": "# Approved\n",
                                        "docs/brain/project.json": json.dumps({"schema": 1, "project": "cockpit"})}, old)
            self.git(repo, "update-ref", canonical, merged)
            self.git(repo, "update-ref", "-d", bootstrap, draft)
            brain.refresh(runtime)
        self.assertEqual((runtime / "notes/cockpit/overview.md").read_text(), "# Reviewed canonical\n")
        self.assertEqual(json.loads((runtime / "state/mirror-manifest.json").read_text())["source_commit"], merged)
        self.assertEqual(self.git(repo, "rev-parse", "HEAD"), old)
        self.assertEqual(self.git(repo, "symbolic-ref", "HEAD"), "refs/heads/user-work")

    def test_configuration_rejects_missing_unknown_or_unsafe_values(self):
        self.assertTrue(hasattr(brain, "configure"), "Per-project runtime configuration is missing")
        runtime = self.root / "runtime"; runtime.mkdir()
        with self.assertRaises((ValueError, FileNotFoundError)):
            brain.configure(runtime)
        repo = self.repo("source")
        valid = {"schema": 1, "project": "orbit", "source": str(repo), "canonical_ref": "refs/remotes/origin/stable"}
        cases = [{**valid, "project": "../madar"}, {**valid, "source": str(repo / "child")},
                 {**valid, "canonical_ref": "HEAD"}, {**valid, "canonical_ref": "refs/remotes/origin/main..old"},
                 {**valid, "schema": 2}, {**valid, "typo": True},
                 {**valid, "brain_dir": "../Docs/brain"}, {**valid, "brain_dir": "/Docs/brain"},
                 {**valid, "brain_dir": "docs/\0/brain"},
                 {**valid, "ssh_command": "ssh\nother-command"}]
        (repo / "child").mkdir()
        for config in cases:
            with self.subTest(config=config):
                (runtime / "config.json").write_text(json.dumps(config))
                with self.assertRaises(ValueError):
                    brain.configure(runtime)

    def test_capital_docs_directory_is_used_for_bootstrap_and_canonical(self):
        repo = self.repo("nasaq")
        old = self.commit(repo, {"README.md": "# Existing Docs tree\n"})
        draft = self.commit(repo, {"Docs/brain/overview.md": "# Nasaq overview\n",
                                   "Docs/brain/current-state.md": "# Pending\n",
                                   "Docs/brain/project.json": json.dumps({"schema": 1, "project": "nasaq"})}, old)
        canonical = "refs/remotes/origin/stable"
        bootstrap = "refs/remotes/origin/docs/project-brain"
        self.git(repo, "update-ref", canonical, old)
        self.git(repo, "update-ref", bootstrap, draft)
        error = None
        try:
            runtime = self.configure("nasaq", repo, canonical, bootstrap_ref=bootstrap, brain_dir="Docs/brain")
        except ValueError as caught:
            error = str(caught)
        self.assertIsNone(error, "Capital Docs/brain needs an explicit safe per-project path")
        with mock.patch.object(brain, "run_tool"):
            brain.refresh(runtime)
            self.git(repo, "update-ref", canonical, draft)
            self.git(repo, "update-ref", "-d", bootstrap, draft)
            brain.refresh(runtime)
        self.assertEqual((runtime / "notes/nasaq/overview.md").read_text(), "# Nasaq overview\n")
        self.assertFalse((runtime / "notes/nasaq/Docs").exists())

    def test_bare_source_must_be_its_exact_git_root(self):
        repo = self.root / "knowledge.git"
        subprocess.run(["git", "init", "--bare", "--quiet", str(repo)], check=True)
        tip = self.commit(repo, {"docs/brain/overview.md": "# Homelab facts\n",
                                 "docs/brain/current-state.md": "# Local Git context\n"})
        self.git(repo, "update-ref", "refs/remotes/origin/trunk", tip)
        error = None
        try:
            runtime = self.configure("homelab", repo)
        except ValueError as caught:
            error = str(caught)
        self.assertIsNone(error, "An exact device-local bare knowledge root must be accepted")
        with mock.patch.object(brain, "run_tool"):
            brain.refresh(runtime)
        self.assertEqual((runtime / "notes/homelab/overview.md").read_text(), "# Homelab facts\n")

    def test_old_bootstrap_cannot_replace_a_previous_canonical_checkpoint(self):
        repo = self.repo("source")
        draft = self.commit(repo, {"docs/brain/overview.md": "# Old draft\n",
                                   "docs/brain/current-state.md": "# Draft checkpoint\n",
                                   "docs/brain/project.json": json.dumps({"schema": 1, "project": "orbit"})})
        reviewed = self.commit(repo, {"docs/brain/overview.md": "# Reviewed knowledge\n",
                                      "docs/brain/current-state.md": "# Main checkpoint\n",
                                      "docs/brain/project.json": json.dumps({"schema": 1, "project": "orbit"})}, draft)
        canonical = "refs/remotes/origin/stable"
        bootstrap = "refs/remotes/origin/docs/project-brain"
        self.git(repo, "update-ref", canonical, reviewed)
        self.git(repo, "update-ref", bootstrap, draft)
        runtime = self.configure("orbit", repo, canonical, bootstrap_ref=bootstrap)
        with mock.patch.object(brain, "run_tool"):
            brain.refresh(runtime)
            removed = self.commit(repo, {"README.md": "# Review a knowledge removal\n"}, reviewed)
            self.git(repo, "update-ref", canonical, removed)
            with self.assertRaisesRegex(ValueError, "bootstrap|diverg|fast.forward|removed"):
                brain.refresh(runtime)
        self.assertEqual((runtime / "notes/orbit/overview.md").read_text(), "# Reviewed knowledge\n")

    def test_config_symlink_is_refused(self):
        self.assertTrue(hasattr(brain, "configure"), "Per-project runtime configuration is missing")
        repo = self.repo("source"); runtime = self.root / "runtime"; runtime.mkdir()
        target = self.root / "config.json"
        target.write_text(json.dumps({"schema": 1, "project": "orbit", "source": str(repo), "canonical_ref": "refs/remotes/origin/stable"}))
        (runtime / "config.json").symlink_to(target)
        with self.assertRaisesRegex(ValueError, "symlink"):
            brain.configure(runtime)

    def test_nested_live_state_symlinks_cannot_escape_runtime(self):
        runtime = self.root / "runtime"; runtime.mkdir()
        sync = self.root / "sync"; sync.mkdir()
        config = self.root / "syncthing.xml"
        config.write_text(f'<configuration><folder path="{sync}"/></configuration>')
        for name in ["state/basic-memory", "beads/.beads"]:
            with self.subTest(name=name):
                path = runtime / name; path.parent.mkdir(parents=True, exist_ok=True)
                path.symlink_to(sync, target_is_directory=True)
                with self.assertRaisesRegex(ValueError, "Syncthing|escapes"):
                    brain.guard(runtime, config)
                path.unlink()

    def test_host_ssh_override_does_not_reach_container_environment(self):
        repo = self.repo("source")
        runtime = self.configure("orbit", repo, ssh_command="ssh -o IdentitiesOnly=yes -i /local/existing-key")
        self.assertTrue(hasattr(brain, "git_env"), "Host-only Git environment is missing")
        self.assertEqual(brain.git_env()["GIT_SSH_COMMAND"], "ssh -o IdentitiesOnly=yes -i /local/existing-key")
        self.assertNotIn("GIT_SSH_COMMAND", brain.child_env())
        self.assertNotIn("existing-key", " ".join(brain.docker_args(runtime, "mcp", [])))

    def test_context_pull_fetches_only_explicit_refs_without_changing_user_work(self):
        self.assertTrue(hasattr(brain, "context_pull"), "Explicit context-pull command is missing")
        origin = self.root / "origin.git"
        wrong = self.root / "wrong.git"
        for path in (origin, wrong):
            subprocess.run(["git", "init", "--bare", "--quiet", str(path)], check=True)
        base = self.commit(origin, {"README.md": "# Product source\n"})
        draft = self.commit(origin, {"docs/brain/overview.md": "# Draft context\n",
                                     "docs/brain/current-state.md": "# Awaiting review\n",
                                     "docs/brain/project.json": json.dumps({"schema": 1, "project": "orbit"})}, base)
        other = self.commit(origin, {"unrelated.txt": "Unrequested branch\n"}, base)
        self.git(origin, "update-ref", "refs/heads/release", base)
        self.git(origin, "update-ref", "refs/heads/docs/project-brain", draft)
        self.git(origin, "update-ref", "refs/heads/unrequested", other)
        repo = self.repo("source")
        self.git(repo, "fetch", "--quiet", "--no-tags", "--refmap=", str(origin), "refs/heads/release:refs/heads/user-work")
        self.git(repo, "checkout", "--quiet", "user-work")
        self.git(repo, "remote", "add", "origin", str(wrong))
        remote = "git@github.com:brain-test/product.git"
        self.git(repo, "config", "url." + origin.as_uri() + ".insteadOf", remote)
        user = repo / "user.txt"; user.write_text("Staged work\n")
        self.git(repo, "add", "user.txt"); user.write_text("Unstaged work too\n")
        original_index = (repo / ".git/index").read_bytes()
        original_head = self.git(repo, "rev-parse", "HEAD")
        canonical = "refs/remotes/origin/release"
        bootstrap = "refs/remotes/origin/docs/project-brain"
        runtime = self.configure("orbit", repo, canonical, bootstrap_ref=bootstrap, remote_url=remote)
        with mock.patch.object(brain, "run_tool"):
            brain.context_pull(runtime)
            self.assertEqual((runtime / "notes/orbit/overview.md").read_text(), "# Draft context\n")
            reviewed = self.commit(origin, {"docs/brain/overview.md": "# Approved release context\n",
                                            "docs/brain/current-state.md": "# Reviewed checkpoint\n",
                                            "docs/brain/project.json": json.dumps({"schema": 1, "project": "orbit"})}, draft)
            self.git(origin, "update-ref", "refs/heads/release", reviewed)
            self.git(origin, "update-ref", "-d", "refs/heads/docs/project-brain", draft)
            brain.context_pull(runtime)
        self.assertEqual((runtime / "notes/orbit/overview.md").read_text(), "# Approved release context\n")
        self.assertEqual(self.git(repo, "rev-parse", canonical), reviewed)
        self.assertEqual(self.git(repo, "rev-parse", "HEAD"), original_head)
        self.assertEqual(self.git(repo, "symbolic-ref", "HEAD"), "refs/heads/user-work")
        self.assertEqual((repo / ".git/index").read_bytes(), original_index)
        self.assertEqual(user.read_text(), "Unstaged work too\n")
        self.assertEqual(self.git(repo, "remote", "get-url", "origin"), str(wrong))
        missing = subprocess.run(["git", "-C", str(repo), "show-ref", "--verify", "refs/remotes/origin/unrequested"], capture_output=True)
        self.assertNotEqual(missing.returncode, 0)
        divergent = self.commit(origin, {"docs/brain/overview.md": "# Rewritten history\n",
                                         "docs/brain/current-state.md": "# Rewritten\n",
                                         "docs/brain/project.json": json.dumps({"schema": 1, "project": "orbit"})})
        self.git(origin, "update-ref", "refs/heads/release", divergent, reviewed)
        with mock.patch.object(brain, "run_tool"):
            with self.assertRaisesRegex(ValueError, "diverg|fast.forward"):
                brain.context_pull(runtime)
        self.assertEqual(self.git(repo, "rev-parse", canonical), reviewed)
        self.assertEqual((runtime / "notes/orbit/overview.md").read_text(), "# Approved release context\n")

    def test_marked_bootstrap_migrates_legacy_madar_then_canonical_takes_over(self):
        repo = self.repo("source")
        legacy = self.commit(repo, {"docs/brain/overview.md": "# Existing legacy Brain\n",
                                    "docs/brain/current-state.md": "# Old English checkpoint\n"})
        identity = json.dumps({"schema": 1, "project": "madar"})
        draft = self.commit(repo, {"docs/brain/overview.md": "# سياق مدار\n",
                                   "docs/brain/current-state.md": "# نقطة التوقف العربية\n",
                                   "docs/brain/project.json": identity}, legacy)
        canonical = "refs/remotes/origin/main"
        bootstrap = "refs/remotes/origin/docs/project-brain"
        self.git(repo, "update-ref", canonical, legacy)
        self.git(repo, "update-ref", bootstrap, draft)
        runtime = self.configure("madar", repo, canonical, bootstrap_ref=bootstrap)
        with mock.patch.object(brain, "run_tool"):
            brain.refresh(runtime)
            self.assertEqual((runtime / "notes/madar/overview.md").read_text(), "# سياق مدار\n")
            approved = self.commit(repo, {"docs/brain/overview.md": "# سياق مدار المعتمد\n",
                                          "docs/brain/current-state.md": "# تمت المراجعة\n",
                                          "docs/brain/project.json": identity}, legacy)
            self.git(repo, "update-ref", canonical, approved)
            self.git(repo, "update-ref", "-d", bootstrap, draft)
            brain.refresh(runtime)
        self.assertEqual((runtime / "notes/madar/overview.md").read_text(), "# سياق مدار المعتمد\n")

    def test_bootstrap_marker_must_match_project_identity(self):
        repo = self.repo("source")
        legacy = self.commit(repo, {"docs/brain/overview.md": "# Legacy\n",
                                    "docs/brain/current-state.md": "# Old\n"})
        canonical = "refs/remotes/origin/main"
        bootstrap = "refs/remotes/origin/docs/project-brain"
        self.git(repo, "update-ref", canonical, legacy)
        runtime = self.configure("madar", repo, canonical, bootstrap_ref=bootstrap)
        for marker in [{"schema": 1, "project": "orbit"}, {"schema": True, "project": "madar"},
                       {"schema": 1, "project": "madar", "extra": True}]:
            with self.subTest(marker=marker):
                wrong = self.commit(repo, {"docs/brain/overview.md": "# Wrong namespace\n",
                                           "docs/brain/current-state.md": "# Not this project\n",
                                           "docs/brain/project.json": json.dumps(marker)}, legacy)
                self.git(repo, "update-ref", bootstrap, wrong)
                with mock.patch.object(brain, "run_tool"):
                    with self.assertRaisesRegex(ValueError, "Project Brain|identity|marker"):
                        brain.refresh(runtime)
                self.assertFalse((runtime / "notes/madar/overview.md").exists())

    def test_remote_override_accepts_only_normalized_github_ssh(self):
        repo = self.repo("source")
        error = None
        try:
            runtime = self.configure("orbit", repo, remote_url="git@github.com:ibraabyte/Orbit.git")
        except ValueError as caught:
            error = str(caught)
        self.assertIsNone(error, "A normalized GitHub SSH URL must be accepted")
        valid = json.loads((runtime / "config.json").read_text())
        for remote in ["https://token@github.com/owner/repo.git", "git@other.example:owner/repo.git",
                       "--upload-pack=other", "git@github.com:owner/repo.git;command",
                       "git@github.com:owner/../repo.git", "git@github.com:owner/repo.git\n"]:
            with self.subTest(remote=remote):
                (runtime / "config.json").write_text(json.dumps({**valid, "remote_url": remote}))
                with self.assertRaises(ValueError):
                    brain.configure(runtime)

    def test_context_pull_refuses_deleted_unmerged_bootstrap_instead_of_cached_draft(self):
        origin = self.root / "origin.git"
        subprocess.run(["git", "init", "--bare", "--quiet", str(origin)], check=True)
        base = self.commit(origin, {"README.md": "# No merged Brain yet\n"})
        draft = self.commit(origin, {"docs/brain/overview.md": "# Pending draft\n",
                                     "docs/brain/current-state.md": "# Pending\n",
                                     "docs/brain/project.json": json.dumps({"schema": 1, "project": "orbit"})}, base)
        self.git(origin, "update-ref", "refs/heads/release", base)
        self.git(origin, "update-ref", "refs/heads/docs/project-brain", draft)
        repo = self.repo("source")
        self.git(repo, "remote", "add", "origin", str(origin))
        runtime = self.configure("orbit", repo, "refs/remotes/origin/release", bootstrap_ref="refs/remotes/origin/docs/project-brain")
        with mock.patch.object(brain, "run_tool"):
            brain.context_pull(runtime)
            self.git(origin, "update-ref", "-d", "refs/heads/docs/project-brain", draft)
            with self.assertRaisesRegex(ValueError, "bootstrap|published"):
                brain.context_pull(runtime)
        self.assertEqual((runtime / "notes/orbit/overview.md").read_text(), "# Pending draft\n")


if __name__ == "__main__":
    unittest.main()
