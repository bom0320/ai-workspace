import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "@/infrastructure/process/index.js";

// Shared transport only: callers own role prompts, protocols and Domain validation.
export async function runContextOnlyCodex(prompt: string, timeoutMs: number) {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2_147_483_647
  )
    throw new Error("CEO timeoutMs must be a positive safe timer duration.");
  const cwd = mkdtempSync(join(tmpdir(), "ai-workspace-codex-ceo-"));
  try {
    return await runCommand(
      "codex",
      [
        "exec",
        "--ignore-user-config",
        "--ignore-rules",
        "--strict-config",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "-c",
        'approval_policy="never"',
        "-c",
        'web_search="disabled"',
        "-c",
        "project_doc_max_bytes=0",
        "-c",
        "features={shell_tool=false,unified_exec=false,view_image=false,code_mode=false,code_mode_host=false,apps=false,plugins=false,browser_use=false,computer_use=false,multi_agent=false,multi_agent_v2=false,hooks=false,image_generation=false,skill_search=false,memories=false,shell_snapshot=false}",
        prompt,
      ],
      { cwd, timeoutMs }
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
