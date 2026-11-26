import type {
  CodexSpecialistOptions,
  SpecialistAnalysisInput,
} from "../data-flow/input.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "@/infrastructure/process/index.js";
import { specialistAuthoritySchema } from "@/contracts/specialist/authority.js";
import {
  agentDecisionPayloadSchema,
  agentDecisionSchema,
  type AgentDecision,
} from "../protocol/decision.js";
import { buildSpecialistPrompt } from "./build-specialist-prompt.js";

export async function invokeCodexSpecialist(
  input: SpecialistAnalysisInput,
  options: CodexSpecialistOptions
): Promise<AgentDecision> {
  const { specialist, authority } = input;
  const parsedAuthority = specialistAuthoritySchema.safeParse(authority);
  if (
    !parsedAuthority.success ||
    parsedAuthority.data.repositoryAccess !== "read" ||
    parsedAuthority.data.shellExecution !== false
  ) {
    throw new Error(
      'Unsupported Codex specialist authority: requires repositoryAccess="read" and shellExecution=false.'
    );
  }

  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1_000;
  const prompt = buildSpecialistPrompt(input);

  // Context-only execution: never use the target repository as the working directory.
  const cwd = mkdtempSync(join(tmpdir(), "ai-workspace-codex-specialist-"));
  try {
    const result = await runCommand(
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

    if (result.timedOut) {
      throw new Error(`Codex specialist timed out after ${timeoutMs} ms.`);
    }
    if (result.error || result.exitCode !== 0) {
      const detail =
        result.stderr.trim() ||
        result.error?.message ||
        `Codex exited with code ${result.exitCode ?? "unavailable"}.`;
      throw new Error(`Failed to run Codex specialist: ${detail}`, {
        cause: result.error,
      });
    }

    let output: unknown;
    try {
      output = JSON.parse(result.stdout.trim());
    } catch (error) {
      throw new Error("Codex specialist returned malformed JSON.", {
        cause: error,
      });
    }
    const payload = agentDecisionPayloadSchema.parse(output);
    return agentDecisionSchema.parse({
      specialistId: specialist.id,
      ...payload,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
