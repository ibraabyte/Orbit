#!/usr/bin/env python3
"""Device-local project tools. Shared knowledge travels as reviewed Git Markdown."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

IMAGE = "madar-project-brain-tools:local"
SOURCE = Path("/Users/ibrahim/Projects/Madar")
BRANCH = "refs/remotes/origin/main"
PROJECT = "madar"
BOOTSTRAP_REF = None
SSH_COMMAND = None
BRAIN_DIR = "docs/brain"
REMOTE_URL = None
DATA_REF = "refs/dolt/data"
SYNC_CONFIG = Path.home() / "Library/Application Support/Syncthing/config.xml"


def child_env():
    env = os.environ.copy()
    env["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:" + env.get("PATH", "")
    env.pop("GIT_SSH_COMMAND", None)
    return env


def git_env():
    env = child_env()
    command = SSH_COMMAND or os.environ.get("GIT_SSH_COMMAND")
    if command:
        env["GIT_SSH_COMMAND"] = command
    return env


def git(repo, *args, optional=False):
    result = subprocess.run(["/usr/bin/git", "-C", str(repo), *args],
                            env=git_env(), text=True, capture_output=True)
    if result.returncode and not optional:
        raise ValueError(result.stderr.strip() or "Git operation failed")
    return result.stdout.strip() if result.returncode == 0 else None


def configure(runtime):
    global SOURCE, BRANCH, PROJECT, BOOTSTRAP_REF, SSH_COMMAND, BRAIN_DIR, REMOTE_URL
    path = Path(runtime) / "config.json"
    if path.is_symlink():
        raise ValueError("Refusing a runtime configuration symlink")
    config = json.loads(path.read_text())
    required = {"schema", "project", "source", "canonical_ref"}
    if not isinstance(config, dict) or not required <= set(config) or set(config) - required - {"bootstrap_ref", "ssh_command", "brain_dir", "remote_url"}:
        raise ValueError("Invalid project runtime configuration fields")
    if type(config["schema"]) is not int or config["schema"] != 1:
        raise ValueError("Unsupported project runtime configuration schema")
    project = config["project"]
    if not isinstance(project, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,62}", project):
        raise ValueError("Invalid project slug")
    refs = [config["canonical_ref"]]
    if config.get("bootstrap_ref") is not None:
        refs.append(config["bootstrap_ref"])
    for ref in refs:
        if not isinstance(ref, str) or not ref.startswith("refs/remotes/origin/") or git(Path(runtime), "check-ref-format", ref, optional=True) is None:
            raise ValueError("Knowledge refs must be valid origin remote-tracking refs")
    if len(refs) != len(set(refs)):
        raise ValueError("Canonical and bootstrap refs must be different")
    source = config["source"]
    if not isinstance(source, str) or not Path(source).is_absolute():
        raise ValueError("The source must be an absolute Git root")
    source = Path(source).resolve()
    top = git(source, "rev-parse", "--show-toplevel", optional=True)
    bare = git(source, "rev-parse", "--is-bare-repository", optional=True) == "true"
    bare_root = git(source, "rev-parse", "--absolute-git-dir", optional=True) if bare else None
    if not ((top is not None and Path(top).resolve() == source) or (bare_root is not None and Path(bare_root).resolve() == source)):
        raise ValueError("The source must be the exact Git root")
    directory = config.get("brain_dir", "docs/brain")
    if not isinstance(directory, str) or not directory or any(c in directory for c in "\\\0"):
        raise ValueError("Invalid relative Brain directory")
    relative = PurePosixPath(directory)
    if relative.is_absolute() or str(relative) != directory or directory == "." or any(p.lower() in {"..", ".git"} for p in relative.parts):
        raise ValueError("Invalid relative Brain directory")
    ssh = config.get("ssh_command")
    if ssh is not None and (not isinstance(ssh, str) or not ssh.strip() or any(c in ssh for c in "\r\n\0")):
        raise ValueError("Invalid host SSH command")
    remote = config.get("remote_url")
    if remote is not None:
        match = re.fullmatch(r"git@github\.com:([A-Za-z0-9][A-Za-z0-9-]*)/([A-Za-z0-9_.-]+)\.git", remote) if isinstance(remote, str) else None
        if match is None or match.group(2) in {".", ".."}:
            raise ValueError("The remote override must be a normalized GitHub SSH URL")
    SOURCE, BRANCH, PROJECT = source, config["canonical_ref"], project
    BOOTSTRAP_REF, SSH_COMMAND = config.get("bootstrap_ref"), ssh
    BRAIN_DIR = directory
    REMOTE_URL = remote
    return config


def guard(runtime, config=SYNC_CONFIG):
    runtime = Path(runtime).resolve()
    roots = []
    for folder in ET.parse(config).getroot().findall("folder"):
        value = os.path.expandvars(os.path.expanduser(folder.get("path", "")))
        if not value or "$" in value or not Path(value).is_absolute():
            raise ValueError("Cannot resolve a configured Syncthing folder")
        roots.append(Path(value).resolve())
    paths = [runtime, *(runtime / name for name in ("notes/" + PROJECT, "state", "state/basic-memory", "state/home", "beads", "beads/.beads", "beads-remote.git"))]
    for path in paths:
        path = path.resolve()
        if any(path == root or root in path.parents for root in roots):
            raise ValueError(f"Refusing live tool data inside Syncthing: {path}")
        if path != runtime and runtime not in path.parents:
            raise ValueError(f"Local tool path escapes its runtime: {path}")
    return runtime


def docker_args(runtime, tool, args):
    env = {
        "HOME": "/runtime/state/home",
        "BASIC_MEMORY_CONFIG_DIR": "/runtime/state/basic-memory",
        "BASIC_MEMORY_HOME": "/notes/" + PROJECT,
        "BASIC_MEMORY_PROJECT_ROOT": "/notes",
        "BASIC_MEMORY_FORCE_LOCAL": "true",
        "BASIC_MEMORY_EXPLICIT_ROUTING": "true",
        "BASIC_MEMORY_AUTO_UPDATE": "false",
        "BASIC_MEMORY_LOGFIRE_ENABLED": "false",
        "BASIC_MEMORY_LOGFIRE_SEND_TO_LOGFIRE": "false",
        "BEADS_DIR": "/runtime/beads/.beads",
    }
    command = ["docker", "run", "--rm", "-i", "--label", "com.madar.project-brain=true",
               "--label", "com.project-brain.project=" + PROJECT,
               "--user", f"{os.getuid()}:{os.getgid()}",
               "--mount", f"type=bind,source={runtime},target=/runtime",
               "--mount", f"type=bind,source={runtime / 'notes' / PROJECT},target=/notes/{PROJECT}",
               "--workdir", "/runtime/beads" if tool == "bd" else "/notes/" + PROJECT]
    for key, value in env.items():
        command.extend(["--env", f"{key}={value}"])
    if tool == "bd":
        command.extend(["--network", "none"])
    tail = ["basic-memory", "mcp", "--transport", "stdio", "--project", PROJECT] if tool == "mcp" else ["bd" if tool == "bd" else "basic-memory", *args]
    return [*command, IMAGE, *tail]


def run_tool(runtime, tool, args):
    guard(runtime)
    subprocess.run(docker_args(runtime, tool, args), env=child_env(), check=True)


def body_hash(data):
    lines = data.splitlines(keepends=True)
    if lines and lines[0].rstrip(b"\r\n") == b"---":
        for index, line in enumerate(lines[1:], 1):
            if line.rstrip(b"\r\n") in (b"---", b"..."):
                lines = lines[index + 1:]
                if lines and lines[0] in (b"\n", b"\r\n"):
                    lines = lines[1:]  # Basic Memory separates metadata from the body.
                data = b"".join(lines)
                break
    # The indexer normalizes boundary newlines; spaces and internal lines stay significant.
    return hashlib.sha256(data.strip(b"\r\n")).hexdigest()


def mirror_path(notes, relative):
    name = PurePosixPath(relative)
    if name.is_absolute() or ".." in name.parts or not name.parts or name.suffix != ".md":
        raise ValueError(f"Invalid Markdown mirror path: {relative}")
    path = notes.joinpath(*name.parts)
    for candidate in (path, *path.parents):
        if candidate == notes:
            break
        if candidate.is_symlink():
            raise ValueError(f"Refusing mirror symlink: {relative}")
    return path


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(data)
            handle.flush()
            os.replace(temporary, path)
        finally:
            if temporary.exists():
                temporary.unlink()


def refresh_files(runtime, incoming, commit):
    notes = runtime / "notes" / PROJECT
    manifest = runtime / "state/mirror-manifest.json"
    if manifest.is_symlink():
        raise ValueError("Refusing a mirror manifest symlink")
    previous = json.loads(manifest.read_text())["files"] if manifest.exists() else {}
    removed = set(previous) - set(incoming)
    if removed:
        raise ValueError("Previously tracked notes removed from Git; review required: " + ", ".join(sorted(removed)))
    pending, hashes = [], {}
    for name, content in incoming.items():
        target = mirror_path(notes, name)
        wanted = hashes[name] = body_hash(content)
        if target.exists():
            current = body_hash(target.read_bytes())
            if current != wanted and current != previous.get(name):
                raise ValueError(f"Refusing to overwrite unpromoted local body edits: {name}")
            if current == wanted:
                continue
        elif name in previous:
            raise ValueError(f"Previously tracked local note was removed; review required: {name}")
        pending.append((target, content))
    for target, content in pending:
        atomic_write(target, content)
    atomic_write(manifest, (json.dumps({"source_commit": commit, "files": hashes}, indent=2) + "\n").encode())


def has_project_brain(commit):
    if not all(git(SOURCE, "cat-file", "-e", commit + ":" + BRAIN_DIR + "/" + name, optional=True) is not None for name in ("overview.md", "current-state.md")):
        return False
    raw = git(SOURCE, "show", commit + ":" + BRAIN_DIR + "/project.json", optional=True)
    try:
        marker = json.loads(raw) if raw is not None else None
    except ValueError:
        return False
    return isinstance(marker, dict) and set(marker) == {"schema", "project"} and type(marker["schema"]) is int and marker == {"schema": 1, "project": PROJECT}


def knowledge_commit(runtime):
    canonical = git(SOURCE, "rev-parse", "--verify", BRANCH + "^{commit}", optional=True)
    if canonical and (not BOOTSTRAP_REF or has_project_brain(canonical)):
        return canonical
    bootstrap = git(SOURCE, "rev-parse", "--verify", BOOTSTRAP_REF + "^{commit}", optional=True) if BOOTSTRAP_REF else None
    if bootstrap and has_project_brain(bootstrap):
        manifest = runtime / "state/mirror-manifest.json"
        if manifest.is_symlink():
            raise ValueError("Refusing a mirror manifest symlink")
        previous = json.loads(manifest.read_text()).get("source_commit") if manifest.exists() else None
        try:
            require_fast_forward(SOURCE, previous, bootstrap)
        except ValueError as error:
            raise ValueError("Refusing stale or divergent bootstrap knowledge; review required") from error
        return bootstrap
    raise ValueError("No fetched Project Brain history; fetch the configured knowledge refs")


def refresh(runtime):
    commit = knowledge_commit(runtime)
    listing = git(SOURCE, "ls-tree", "-rz", commit, "--", BRAIN_DIR, "AGENTS.md", "CLAUDE.md")
    incoming = {}
    for row in listing.split("\0"):
        if not row:
            continue
        metadata, name = row.split("\t", 1)
        mode, kind, _ = metadata.split()
        if not name.endswith(".md"):
            continue
        if mode not in ("100644", "100755") or kind != "blob":
            raise ValueError(f"Refusing a non-file memory object: {name}")
        relative = name[len(BRAIN_DIR) + 1:] if name.startswith(BRAIN_DIR + "/") else "rules/" + name
        if relative in incoming:
            raise ValueError(f"Duplicate memory mirror path: {relative}")
        incoming[relative] = subprocess.check_output(["/usr/bin/git", "-C", str(SOURCE), "show", f"{commit}:{name}"], env=git_env())
    if not incoming:
        raise ValueError("No committed Project Brain Markdown found")
    refresh_files(runtime, incoming, commit)
    run_tool(runtime, "bm", ["project", "index", PROJECT])


def fetch_context_ref(remote, ref):
    source = "refs/heads/" + ref[len("refs/remotes/origin/"):]
    git(SOURCE, "fetch", "--no-tags", "--no-write-fetch-head", "--refmap=", remote, source + ":" + ref)


def context_pull(runtime):
    remote = REMOTE_URL or "origin"
    fetch_context_ref(remote, BRANCH)
    if BOOTSTRAP_REF and not has_project_brain(BRANCH):
        source = "refs/heads/" + BOOTSTRAP_REF[len("refs/remotes/origin/"):]
        rows = git(SOURCE, "ls-remote", "--refs", remote, source)
        if rows:
            fields = rows.split()
            if len(fields) != 2 or fields[1] != source or not re.fullmatch(r"[0-9a-f]{40,64}", fields[0]):
                raise ValueError("Invalid bootstrap history ref")
            fetch_context_ref(remote, BOOTSTRAP_REF)
        else:
            raise ValueError("No published Project Brain; the configured bootstrap branch is absent")
    refresh(runtime)


def require_fast_forward(repo, before, after):
    if not re.fullmatch(r"[0-9a-f]{40,64}", after):
        raise ValueError("Invalid task history object ID")
    if before is not None and git(repo, "merge-base", "--is-ancestor", before, after, optional=True) is None:
        raise ValueError("Task history is divergent or not a fast forward; review required")


def remote_data(repo):
    rows = git(repo, "ls-remote", "--refs", "origin", DATA_REF)
    if not rows:
        return None
    oid, ref = rows.split()
    if ref != DATA_REF or not re.fullmatch(r"[0-9a-f]{40,64}", oid):
        raise ValueError("Invalid remote task history ref")
    return oid


def fetch_data(repo):
    # An empty refmap prevents a mirror-style origin from overwriting local refs.
    git(repo, "fetch", "--no-tags", "--no-write-fetch-head", "--refmap=", "origin", DATA_REF)


def refuse_mirror_push(repo):
    value = git(repo, "config", "--get", "remote.origin.mirror", optional=True)
    if value is not None and git(repo, "config", "--bool", "--get", "remote.origin.mirror") == "true":
        raise ValueError("Refusing task push with remote.origin.mirror enabled")


def tasks(runtime, push):
    repo = runtime / "beads-remote.git"
    if push:
        refuse_mirror_push(repo)
        run_tool(runtime, "bd", ["dolt", "push"])
    before = git(repo, "rev-parse", "--verify", DATA_REF, optional=True)
    remote = remote_data(repo)
    if remote:
        fetch_data(repo)
        git(repo, "cat-file", "-e", remote + "^{commit}")
    if push:
        if not before:
            raise ValueError("No committed local Beads task history to push")
        require_fast_forward(repo, remote, before)
        git(repo, "push", "origin", f"{before}:{DATA_REF}")
    else:
        if not remote:
            raise ValueError("No remote Beads task history to pull")
        require_fast_forward(repo, before, remote)
        git(repo, "update-ref", DATA_REF, remote, before or "0" * len(remote))
        run_tool(runtime, "bd", ["dolt", "pull"])


def main():
    runtime = Path(__file__).resolve().parent.parent
    configure(runtime)
    runtime = guard(runtime)
    command, *args = sys.argv[1:] or ["help"]
    if command in ("bm", "bd", "mcp"):
        if command == "mcp" and args:
            raise ValueError("MCP project and transport are fixed")
        run_tool(runtime, command, args)
    elif command == "refresh" and not args:
        refresh(runtime)
    elif command == "context-pull" and not args:
        context_pull(runtime)
    elif command in ("tasks-push", "tasks-pull") and not args:
        tasks(runtime, command == "tasks-push")
    else:
        raise ValueError("Usage: brain.py bm ... | bd ... | mcp | context-pull | refresh | tasks-push | tasks-pull")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, ET.ParseError, subprocess.CalledProcessError) as error:
        print(f"Project Brain: {error}", file=sys.stderr)
        sys.exit(1)
