import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True

MODULE = Path(__file__).with_name("brain.py")
brain = None
if MODULE.exists():
    spec = importlib.util.spec_from_file_location("brain", MODULE)
    brain = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(brain)


class ImplementationTest(unittest.TestCase):
    def test_wrapper_exists(self):
        self.assertTrue(MODULE.exists(), "The safe Project Brain wrapper is missing")


@unittest.skipIf(brain is None, "implementation not written yet")
class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.runtime = self.root / "local" / "Madar"
        self.runtime.mkdir(parents=True)
        self.sync = self.root / "synced"
        self.sync.mkdir()
        self.config = self.root / "config.xml"
        self.config.write_text(f'<configuration><folder path="{self.sync}"/></configuration>')

    def test_runtime_and_child_symlink_cannot_reach_sync_root(self):
        brain.guard(self.runtime, self.config)
        with self.assertRaisesRegex(ValueError, "Syncthing"):
            brain.guard(self.sync / "runtime", self.config)
        linked = self.root / "linked-runtime"
        linked.symlink_to(self.sync, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "Syncthing"):
            brain.guard(linked, self.config)
        (self.runtime / "state").symlink_to(self.sync, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "Syncthing"):
            brain.guard(self.runtime, self.config)

    def test_missing_sync_config_fails_closed(self):
        with self.assertRaises((ValueError, FileNotFoundError)):
            brain.guard(self.runtime, self.root / "absent.xml")

    def test_empty_defaults_folder_is_not_a_configured_sync_root(self):
        self.config.write_text(f'<configuration><folder path="{self.sync}"/>'
                               '<defaults><folder path=""/></defaults></configuration>')
        error = None
        try:
            brain.guard(self.runtime, self.config)
        except ValueError as caught:
            error = str(caught)
        self.assertIsNone(error, "A defaults template must not block a safe runtime")

    def test_actual_configured_empty_folder_still_fails_closed(self):
        self.config.write_text('<configuration><folder path=""/></configuration>')
        with self.assertRaisesRegex(ValueError, "configured Syncthing folder"):
            brain.guard(self.runtime, self.config)

    def test_docker_mounts_local_runtime_only_and_uses_host_uid(self):
        args = brain.docker_args(self.runtime, "mcp", [])
        self.assertIn("--rm", args)
        self.assertIn("com.madar.project-brain=true", args)
        self.assertIn("--user", args)
        self.assertIn("--transport", args)
        self.assertEqual(args[-4:], ["--transport", "stdio", "--project", "madar"])
        joined = " ".join(args)
        self.assertNotIn("/Users/ibrahim/Projects/Madar", joined)
        self.assertNotIn(".ssh", joined)
        self.assertNotIn("--publish", args)
        self.assertNotIn("-p", args)
        self.assertIn("BASIC_MEMORY_AUTO_UPDATE=false", args)
        self.assertIn("HOME=/runtime/state/home", args)

    def test_beads_uses_its_own_database_path(self):
        args = brain.docker_args(self.runtime, "bd", ["list", "--json"])
        self.assertIn("BEADS_DIR=/runtime/beads/.beads", args)
        self.assertEqual(args[args.index("--network") + 1], "none")
        self.assertIn("/runtime/beads", args)
        self.assertEqual(args[-3:], ["bd", "list", "--json"])

    def mirror(self, incoming):
        return brain.refresh_files(self.runtime, incoming, "a" * 40)

    def test_frontmatter_changes_are_preserved_and_new_body_can_refresh(self):
        self.mirror({"overview.md": b"# Existing\n"})
        note = self.runtime / "notes/madar/overview.md"
        wrapped = b"---\npermalink: overview\n---\n\n# Existing\n"
        note.write_bytes(wrapped)
        self.mirror({"overview.md": b"# Existing\n"})
        self.assertEqual(note.read_bytes(), wrapped)
        self.mirror({"overview.md": b"# Updated in Git\n"})
        self.assertEqual(note.read_bytes(), b"# Updated in Git\n")

    def test_indexer_newline_boundaries_do_not_count_as_body_edits(self):
        canonical = b"# Header\n\nKeep internal blank lines and spaces. \n"
        indexed = b"---\npermalink: header\n---\n\n" + canonical.rstrip(b"\r\n")
        self.assertEqual(brain.body_hash(canonical), brain.body_hash(indexed))
        self.assertEqual(brain.body_hash(canonical), brain.body_hash(b"\r\n" + canonical + b"\r\n"))
        self.assertNotEqual(brain.body_hash(canonical), brain.body_hash(canonical.replace(b"\n\n", b"\n")))
        self.assertNotEqual(brain.body_hash(canonical), brain.body_hash(canonical.replace(b"spaces. ", b"spaces.")))
        self.mirror({"a.md": canonical})
        note = self.runtime / "notes/madar/a.md"
        note.write_bytes(indexed)
        manifest_path = self.runtime / "state/mirror-manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["files"]["a.md"] = hashlib.sha256(canonical).hexdigest()
        manifest_path.write_text(json.dumps(manifest))
        self.mirror({"a.md": canonical})
        self.assertEqual(note.read_bytes(), indexed)
        self.assertEqual(json.loads(manifest_path.read_text())["files"]["a.md"], brain.body_hash(canonical))

    def test_local_body_edit_refuses_all_writes(self):
        self.mirror({"a.md": b"Original A\n", "z.md": b"Original Z\n"})
        edited = self.runtime / "notes/madar/z.md"
        edited.write_bytes(b"Unpromoted local knowledge\n")
        with self.assertRaisesRegex(ValueError, "local|unpromoted"):
            self.mirror({"a.md": b"New A\n", "z.md": b"New Z\n"})
        self.assertEqual((self.runtime / "notes/madar/a.md").read_bytes(), b"Original A\n")
        self.assertEqual(edited.read_bytes(), b"Unpromoted local knowledge\n")

    def test_matching_promoted_body_and_unknown_notes_are_preserved(self):
        self.mirror({"a.md": b"Old\n"})
        notes = self.runtime / "notes/madar"
        (notes / "a.md").write_bytes(b"Promoted\n")
        (notes / "my-note.md").write_bytes(b"Keep this\n")
        self.mirror({"a.md": b"Promoted\n"})
        self.assertEqual((notes / "my-note.md").read_bytes(), b"Keep this\n")

    def test_refresh_preserves_unicode_tabs_and_newlines_in_git_paths(self):
        repo = self.root / "source"
        subprocess.run(["git", "init", "--quiet", str(repo)], check=True)
        incoming = {
            "overview.md": b"# Overview\n",
            "knowledge/قرار.md": "# قرار\n".encode(),
            "knowledge/tab\tname.md": b"# Tab in path\n",
            "knowledge/line\nname.md": b"# Newline in path\n",
        }
        for name, content in incoming.items():
            source = repo / "docs/brain" / name
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(content)
        subprocess.run(["git", "-C", str(repo), "add", "--", "docs/brain"], check=True)
        subprocess.run(["git", "-C", str(repo), "-c", "user.name=Brain test",
                        "-c", "user.email=brain@example.invalid", "commit", "--quiet",
                        "-m", "Knowledge path fixture"], check=True)
        subprocess.run(["git", "-C", str(repo), "update-ref", brain.BRANCH, "HEAD"], check=True)
        with mock.patch.object(brain, "SOURCE", repo), mock.patch.object(brain, "run_tool") as index:
            brain.refresh(self.runtime)
        for name, content in incoming.items():
            target = self.runtime / "notes/madar" / name
            self.assertTrue(target.is_file(), f"Committed note was omitted: {name!r}")
            self.assertEqual(target.read_bytes(), content)
        manifest = json.loads((self.runtime / "state/mirror-manifest.json").read_text())
        self.assertEqual(set(manifest["files"]), set(incoming))
        index.assert_called_once_with(self.runtime, "bm", ["project", "index", "madar"])

    def test_removed_tracked_note_and_path_traversal_fail(self):
        self.mirror({"a.md": b"Keep\n"})
        with self.assertRaisesRegex(ValueError, "removed"):
            self.mirror({})
        with self.assertRaises(ValueError):
            self.mirror({"a.md": b"Keep\n", "../outside.md": b"Forbidden"})
        self.assertFalse((self.runtime / "notes/outside.md").exists())

    def test_mirror_symlink_never_overwrites_outside_file(self):
        self.mirror({"a.md": b"Keep\n"})
        outside = self.root / "outside.md"
        outside.write_bytes(b"User knowledge\n")
        (self.runtime / "notes/madar/linked.md").symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "symlink"):
            self.mirror({"a.md": b"New\n", "linked.md": b"Overwrite\n"})
        self.assertEqual(outside.read_bytes(), b"User knowledge\n")
        self.assertEqual((self.runtime / "notes/madar/a.md").read_bytes(), b"Keep\n")

    def test_refresh_reads_fetched_main_after_review_branch_is_deleted(self):
        repo = self.root / "source.git"
        subprocess.run(["git", "init", "--bare", "--quiet", str(repo)], check=True)
        def git(*args, data=None):
            return subprocess.run(["git", "-C", str(repo), *args], input=data,
                                  text=True, capture_output=True, check=True).stdout.strip()
        def commit(content, parent=None):
            blob = git("hash-object", "-w", "--stdin", data=content)
            tree = git("mktree", data=f"100644 blob {blob}\toverview.md\n")
            tree = git("mktree", data=f"040000 tree {tree}\tbrain\n")
            tree = git("mktree", data=f"040000 tree {tree}\tdocs\n")
            args = ["-c", "user.name=Brain test", "-c", "user.email=brain@example.invalid", "commit-tree", tree]
            return git(*args, *(["-p", parent] if parent else []), data="checkpoint\n")
        old = commit("# Stale review branch\n")
        current = commit("# Merged main checkpoint\n", old)
        git("update-ref", "refs/heads/user-work", old)
        git("symbolic-ref", "HEAD", "refs/heads/user-work")
        git("update-ref", "refs/heads/docs/project-brain", old)
        git("update-ref", "refs/remotes/origin/main", current)
        with mock.patch.object(brain, "SOURCE", repo), mock.patch.object(brain, "run_tool"):
            brain.refresh(self.runtime)
            self.assertEqual((self.runtime / "notes/madar/overview.md").read_text(), "# Merged main checkpoint\n")
            git("update-ref", "-d", "refs/heads/docs/project-brain", old)
            brain.refresh(self.runtime)
        manifest = json.loads((self.runtime / "state/mirror-manifest.json").read_text())
        self.assertEqual(manifest["source_commit"], current)
        self.assertEqual(git("symbolic-ref", "HEAD"), "refs/heads/user-work")
        self.assertEqual(git("rev-parse", "HEAD"), old)

    def test_task_history_requires_fast_forward(self):
        repo = self.root / "fixture.git"
        subprocess.run(["git", "init", "--bare", "--quiet", str(repo)], check=True)
        def git(*args, data=None):
            return subprocess.run(["git", "-C", str(repo), *args], input=data,
                                  text=True, capture_output=True, check=True).stdout.strip()
        tree = git("mktree", data="")
        commit_args = ["-c", "user.name=Brain test", "-c", "user.email=brain@example.invalid", "commit-tree", tree]
        first = git(*commit_args, data="first\n")
        second = git(*commit_args, "-p", first, data="second\n")
        sibling = git(*commit_args, "-p", first, data="sibling\n")
        brain.require_fast_forward(repo, first, second)
        brain.require_fast_forward(repo, None, first)
        with self.assertRaisesRegex(ValueError, "diverg|fast.forward"):
            brain.require_fast_forward(repo, second, sibling)
        with self.assertRaises(ValueError):
            brain.require_fast_forward(repo, second, first)

    def test_fetch_never_updates_bridge_ref_even_with_mirror_remote_config(self):
        origin = self.root / "origin.git"
        local = self.root / "bridge.git"
        for repo in (origin, local):
            subprocess.run(["git", "init", "--bare", "--quiet", str(repo)], check=True)
        def git(repo, *args, data=None):
            return subprocess.run(["git", "-C", str(repo), *args], input=data,
                                  text=True, capture_output=True, check=True).stdout.strip()
        tree = git(origin, "mktree", data="")
        args = ["-c", "user.name=Brain test", "-c", "user.email=brain@example.invalid", "commit-tree", tree]
        first = git(origin, *args, data="first\n")
        second = git(origin, *args, "-p", first, data="second\n")
        git(origin, "update-ref", brain.DATA_REF, first)
        git(local, "remote", "add", "--mirror=fetch", "origin", str(origin))
        git(local, "fetch", "--quiet", "origin")
        git(origin, "update-ref", brain.DATA_REF, second)
        brain.fetch_data(local)
        self.assertEqual(git(local, "rev-parse", brain.DATA_REF), first)
        git(local, "cat-file", "-e", second + "^{commit}")

    def test_push_refuses_git_mirror_mode(self):
        repo = self.root / "bridge.git"
        subprocess.run(["git", "init", "--bare", "--quiet", str(repo)], check=True)
        self.assertTrue(hasattr(brain, "refuse_mirror_push"), "Mirror-push safety guard is missing")
        brain.refuse_mirror_push(repo)
        subprocess.run(["git", "-C", str(repo), "config", "remote.origin.mirror", "true"], check=True)
        with self.assertRaisesRegex(ValueError, "mirror"):
            brain.refuse_mirror_push(repo)


if __name__ == "__main__":
    unittest.main()
