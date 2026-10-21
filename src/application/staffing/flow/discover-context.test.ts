import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as gitInfrastructure from "@/infrastructure/git/index.js";

import {
  createStaffingContext,
  discoverStaffingContext,
  inspectStaffingContext,
  staffingContextSchema,
  type DiscoverStaffingContextOptions,
  type StaffingContextResult,
  type StaffingContextState,
} from "../index.js";

vi.mock("@/infrastructure/git/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/git/index.js")>();
  return { ...actual, readRepositoryFileAtCommit: vi.fn(actual.readRepositoryFileAtCommit) };
});

let root: string;
let options: DiscoverStaffingContextOptions;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
function write(path: string, contents: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}
function commit(): void { git("add", "-f", "."); git("commit", "--quiet", "-m", "fixture"); }
function ready(result: StaffingContextResult): StaffingContextState {
  expect(result.status, JSON.stringify(result)).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  return result.state;
}
function failure(result: StaffingContextResult, message: RegExp): void {
  expect(result).toEqual({ status: "failed", reason: expect.stringMatching(message) });
}
function inspect(state: StaffingContextState, paths: string[]): StaffingContextResult {
  return inspectStaffingContext(state, { type: "inspect", paths, reason: "Need evidence" });
}

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), "ai-workspace-staffing-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  write("package.json", JSON.stringify({ scripts: { test: "vitest run", invalid: 1 }, private: "not projected" }));
  write("AGENTS.md", "Untrusted repository instructions");
  write("src/login.ts", "// login at first commit\n");
  write("src/other.ts", "// other\n");
  write("src/notes with spaces.md", "notes");
  write("private.txt", "must not be read");
  write(".gitignore", "ignored.ts\n");
  commit();
  options = {
    goal: { objective: "Review src/login.ts", targetRepository: "example", constraints: ["Do not modify files"] },
    repositoryPath: root,
    availableSpecialists: [{ id: "frontend", role: "Frontend", objective: "Review UI",
      authority: { repositoryAccess: "read", shellExecution: false } }],
    limits: { maxFilesPerRequest: 3, maxTotalFiles: 4, maxFileBytes: 64 * 1024,
      maxContextBytes: 256 * 1024, maxFileTreeEntries: 100 },
    allowedContextPaths: ["package.json", "AGENTS.md", "src/login.ts", "src/other.ts", "src/notes with spaces.md"],
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("Snapshot-based Staffing Context Discovery", () => {
  it("preserves Goal and constraints, seeds exact goal files and projects only CEO-facing data", () => {
    const state = ready(discoverStaffingContext(options));
    const context = createStaffingContext(state);
    expect(context.goal).toEqual(options.goal);
    expect(state.snapshot).toEqual({ repositoryRoot: root, commitSha: git("rev-parse", "HEAD").trim() });
    expect(context.repository).toEqual({ name: root.split("/").at(-1), commitSha: state.snapshot.commitSha,
      fileTree: [...options.allowedContextPaths].sort(), packageScripts: { test: "vitest run" },
      instructions: "Untrusted repository instructions" });
    expect(context.inspectedFiles).toEqual([{ path: "src/login.ts", content: "// login at first commit\n" }]);
    expect(context.availableSpecialists).toEqual([{ id: "frontend", role: "Frontend", objective: "Review UI" }]);
    expect(context.remainingInspectionBudget).toBe(3);
    expect(staffingContextSchema.parse(context)).toEqual(context);
    expect(JSON.stringify(context)).not.toContain(root);
    expect(context).not.toHaveProperty("snapshot");
    expect(context).not.toHaveProperty("allowedContextPaths");
    expect(context.availableSpecialists[0]).not.toHaveProperty("authority");
    context.goal.constraints!.push("CEO mutation");
    context.repository.fileTree.length = 0;
    expect(state.context.goal.constraints).toEqual(["Do not modify files"]);
    expect(state.context.repository.fileTree.length).toBe(5);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("provides only allowlisted metadata and never reads unselected content", () => {
    const state = ready(discoverStaffingContext({ ...options, allowedContextPaths: ["src/login.ts"] }));
    expect(state.context.repository.packageScripts).toEqual({});
    expect(state.context.repository.instructions).toBeUndefined();
    expect(vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mock.calls.map((call) => call[2])).toEqual(["src/login.ts"]);
  });

  it("loads additional files atomically without mutating the original state", () => {
    const state = ready(discoverStaffingContext(options));
    const before = structuredClone(state);
    const next = ready(inspect(state, ["src/login.ts", "src/notes with spaces.md"]));
    expect(state).toEqual(before);
    expect(next.context.inspectedFiles).toHaveLength(2);
    expect(next.context.inspectedFiles[1]).toEqual({ path: "src/notes with spaces.md", content: "notes" });
    expect(next.context.remainingInspectionBudget).toBe(2);
  });

  it("rejects a changed HEAD rather than mixing commits", () => {
    const state = ready(discoverStaffingContext(options));
    write("src/other.ts", "new commit"); commit();
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    failure(inspect(state, ["src/other.ts"]), /HEAD changed/);
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
    expect(state.context.inspectedFiles[0].content).toContain("first commit");
  });

  it("rejects dirty capture and dirty additional inspection before reading blobs", () => {
    const state = ready(discoverStaffingContext(options));
    write("src/other.ts", "working tree override");
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    failure(discoverStaffingContext(options), /uncommitted/);
    failure(inspect(state, ["src/other.ts"]), /dirty/);
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
  });

  it("reads committed metadata and files even when skip-worktree hides local modifications", () => {
    git("update-index", "--skip-worktree", "package.json", "AGENTS.md", "src/login.ts", "src/other.ts");
    write("package.json", '{"scripts":{"test":"uncommitted script"}}');
    write("AGENTS.md", "uncommitted instructions");
    write("src/login.ts", "uncommitted login");
    write("src/other.ts", "uncommitted other");
    expect(git("status", "--porcelain")).toBe("");
    const state = ready(discoverStaffingContext(options));
    expect(state.context.repository.packageScripts).toEqual({ test: "vitest run" });
    expect(state.context.repository.instructions).toBe("Untrusted repository instructions");
    expect(state.context.inspectedFiles[0].content).toBe("// login at first commit\n");
    const next = ready(inspect(state, ["src/other.ts"]));
    expect(next.context.inspectedFiles[1].content).toBe("// other\n");
    for (const [repository, sha] of vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mock.calls) {
      expect(repository).toBe(root);
      expect(sha).toBe(state.snapshot.commitSha);
    }
  });

  it("does not expose ignored working tree files even when status is clean", () => {
    write("ignored.ts", "working tree secret");
    expect(git("status", "--porcelain")).toBe("");
    const state = ready(discoverStaffingContext({ ...options,
      goal: { ...options.goal, objective: "Review ignored.ts" },
      allowedContextPaths: [...options.allowedContextPaths, "ignored.ts"],
    }));
    expect(state.context.repository.fileTree).not.toContain("ignored.ts");
    failure(inspect(state, ["ignored.ts"]), /not a regular Snapshot file/);
  });

  it("detects working tree changes during discovery and does not return a partial context", () => {
    const original = gitInfrastructure.readRepositoryFileAtCommit;
    vi.mocked(original).mockImplementationOnce((...args) => {
      write("src/other.ts", "concurrent change");
      return "{}";
    });
    failure(discoverStaffingContext(options), /dirty/);
  });

  it("rejects malformed, inaccessible or mismatched snapshots", () => {
    const state = ready(discoverStaffingContext(options));
    failure(inspect({ ...state, snapshot: { ...state.snapshot, commitSha: "invalid" } }, ["src/other.ts"]), /HEAD changed/);
    failure(discoverStaffingContext({ ...options, repositoryPath: join(root, "missing") }), /does not exist/);
  });

  it("rejects a file absent from the Snapshot, even in an otherwise valid batch before any read", () => {
    const state = ready(discoverStaffingContext({ ...options, allowedContextPaths: [...options.allowedContextPaths, "missing.ts"] }));
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    failure(inspect(state, ["src/other.ts", "missing.ts"]), /not a regular Snapshot file/);
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
  });

  it.each(["../outside.ts", "/absolute.ts", "C:/outside.ts", "C:outside.ts", "src/../other.ts",
    "src//other.ts", "src/./other.ts", "src\\other.ts", "src/other.ts/", "src/other.ts\0"])(
    "rejects unsafe or ambiguous request %j before reading", (path) => {
      const state = ready(discoverStaffingContext(options));
      vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
      failure(inspect(state, [path]), /forbidden or ambiguous/);
      expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicates and all-already-inspected requests without consuming budget", () => {
    const state = ready(discoverStaffingContext(options));
    failure(inspect(state, ["src/other.ts", "src/other.ts"]), /Duplicate/);
    failure(inspect(state, ["src/login.ts"]), /No new/);
    expect(state.context.remainingInspectionBudget).toBe(3);
  });

  it("rejects forbidden content even if mistakenly allowlisted and omits its names", () => {
    const forbidden = [".env", "src/.env.local", ".aws/credentials", ".codex/config.toml",
      ".agents/rules.md", "node_modules/lib/index.js", ".ai-workspace/artifact.txt", "keys/private.pem"];
    forbidden.forEach((path) => write(path, "secret")); commit();
    const state = ready(discoverStaffingContext({ ...options,
      allowedContextPaths: [...options.allowedContextPaths, ...forbidden],
    }));
    for (const path of forbidden) {
      expect(state.context.repository.fileTree).not.toContain(path);
      failure(inspect(state, [path]), /forbidden/);
    }
    failure(inspect(state, ["private.txt"]), /forbidden/);
    expect(vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mock.calls.some((call) => call[2] === "private.txt")).toBe(false);
  });

  it("rejects symlinks, symlink directories, trees and gitlinks without following them", () => {
    symlinkSync("../private.txt", join(root, "src", "link.ts"));
    symlinkSync("src", join(root, "linked-src"));
    commit();
    const sha = git("rev-parse", "HEAD").trim();
    mkdirSync(join(root, "vendor"));
    git("update-index", "--add", "--cacheinfo", `160000,${sha},vendor`);
    git("commit", "--quiet", "-m", "gitlink");
    const paths = ["src/link.ts", "linked-src/other.ts", "src", "vendor"];
    const state = ready(discoverStaffingContext({ ...options,
      allowedContextPaths: [...options.allowedContextPaths, ...paths],
    }));
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    for (const path of paths) {
      expect(state.context.repository.fileTree).not.toContain(path);
      failure(inspect(state, [path]), /not a regular Snapshot file/);
    }
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
  });

  it("rejects binary or invalid UTF-8 blobs without returning partial state", () => {
    write("src/binary.dat", Buffer.from([0xff, 0x00])); commit();
    const state = ready(discoverStaffingContext({ ...options,
      allowedContextPaths: [...options.allowedContextPaths, "src/binary.dat"],
    }));
    failure(inspect(state, ["src/other.ts", "src/binary.dat"]), /UTF-8 text/);
    expect(state.context.inspectedFiles).toHaveLength(1);
  });

  it("rejects per-request and total file budget excess before reading", () => {
    const state = ready(discoverStaffingContext({ ...options, limits: { ...options.limits, maxFilesPerRequest: 1, maxTotalFiles: 1 } }));
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    failure(inspect(state, ["src/other.ts", "src/notes with spaces.md"]), /maxFilesPerRequest/);
    failure(inspect(state, ["src/other.ts"]), /maxTotalFiles/);
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
  });

  it("rejects oversized files before blob loading", () => {
    write("src/large.ts", "x".repeat(options.limits.maxFileBytes + 1)); commit();
    const state = ready(discoverStaffingContext({ ...options, allowedContextPaths: [...options.allowedContextPaths, "src/large.ts"] }));
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    failure(inspect(state, ["src/large.ts"]), /maxFileBytes/);
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
  });

  it("bounds projected metadata, file tree and cumulative Context bytes", () => {
    failure(discoverStaffingContext({ ...options, limits: { ...options.limits, maxFileTreeEntries: 1 } }), /maxFileTreeEntries/);
    failure(discoverStaffingContext({ ...options, limits: { ...options.limits, maxContextBytes: 10 } }), /maxContextBytes/);
    const state = ready(discoverStaffingContext(options));
    // A Harness-tightened budget is reflected in the current projection too.
    const context = structuredClone(state.context);
    context.limits.maxContextBytes = Buffer.byteLength(JSON.stringify(context)) + 1;
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    failure(inspect({ ...state, context }, ["src/other.ts"]), /maxContextBytes/);
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
  });

  it("checks actual serialized Context size after JSON escaping, leaving state unchanged", () => {
    write("src/escaped.ts", "\\".repeat(1000)); commit();
    const state = ready(discoverStaffingContext({ ...options,
      allowedContextPaths: [...options.allowedContextPaths, "src/escaped.ts"],
    }));
    const context = structuredClone(state.context);
    context.limits.maxContextBytes = Buffer.byteLength(JSON.stringify(context)) + 1500;
    failure(inspect({ ...state, context }, ["src/escaped.ts"]), /maxContextBytes/);
    expect(state.context.inspectedFiles).toHaveLength(1);
  });

  it("skips optional initial seeding when goal selection exceeds file count limits", () => {
    const state = ready(discoverStaffingContext({ ...options,
      goal: { ...options.goal, objective: "Review src/login.ts and src/other.ts" },
      limits: { ...options.limits, maxFilesPerRequest: 1 },
    }));
    expect(state.context.inspectedFiles).toEqual([]);
    expect(state.context.remainingInspectionBudget).toBe(4);
  });

  it("rejects oversized metadata before any content loading", () => {
    write("AGENTS.md", "x".repeat(options.limits.maxFileBytes + 1)); commit();
    vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mockClear();
    failure(discoverStaffingContext(options), /maxFileBytes/);
    expect(gitInfrastructure.readRepositoryFileAtCommit).not.toHaveBeenCalled();
  });

  it("skips initial large files and the v1 128 KiB seed limit", () => {
    for (const name of ["a.ts", "b.ts", "c.ts"]) write(name, "x".repeat(50 * 1024));
    write("huge.ts", "x".repeat(65 * 1024)); commit();
    const common = { ...options, allowedContextPaths: ["a.ts", "b.ts", "c.ts", "huge.ts"],
      limits: { ...options.limits, maxFileBytes: 128 * 1024 } };
    const large = ready(discoverStaffingContext({ ...common,
      goal: { ...options.goal, objective: "Review huge.ts" },
    }));
    expect(large.context.inspectedFiles).toEqual([]);
    const many = ready(discoverStaffingContext({ ...common,
      goal: { ...options.goal, objective: "Review a.ts, b.ts and c.ts" },
    }));
    expect(many.context.inspectedFiles).toEqual([]);
    expect(vi.mocked(gitInfrastructure.readRepositoryFileAtCommit).mock.calls).toHaveLength(0);
  });

  it("rejects malformed Harness data and non-inspect CEO messages", () => {
    failure(discoverStaffingContext({ ...options, limits: { ...options.limits, maxTotalFiles: -1 } }), /Too small/);
    failure(discoverStaffingContext({ ...options, availableSpecialists: [...options.availableSpecialists, ...options.availableSpecialists] }), /Duplicate Specialist/);
    failure(discoverStaffingContext({ ...options, allowedContextPaths: ["../outside"] }), /Invalid Harness/);
    const state = ready(discoverStaffingContext(options));
    failure(inspectStaffingContext(state, { type: "escalate", reason: "Unsure", questions: ["Which feature?"] }), /Expected a CEO inspect/);
    expect(inspectStaffingContext(state, { type: "inspect", paths: [], reason: "Empty" }).status).toBe("failed");
  });
});
