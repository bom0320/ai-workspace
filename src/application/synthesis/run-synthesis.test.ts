import { existsSync, readdirSync } from "node:fs";
import { isAbsolute } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "@/infrastructure/process/index.js";
import {
  runSynthesis,
  type SynthesisContext,
  type CEOSynthesisDecision,
  type SourceReference,
} from "./index.js";

vi.mock("@/infrastructure/process/index.js", () => ({ runCommand: vi.fn() }));
const command = vi.mocked(runCommand);
const source = (specialistId: string): SourceReference => ({
  kind: "recommendation",
  specialistId,
});
function context(single = false): SynthesisContext {
  const decisions = ["frontend", ...(single ? [] : ["ux"])].map(
    (specialistId) => ({
      specialistId,
      recommendation: `Retain ${specialistId} concerns`,
      evidence: [
        {
          path: "a.ts",
          lineStart: 1,
          lineEnd: 1,
          description: "Original observation",
        },
      ],
      risks: ["Compatibility risk"],
      uncertainty: ["Insufficient measurements"],
    })
  );
  return {
    goal: {
      objective: "Review UI",
      targetRepository: "repo",
      constraints: ["No edits"],
    },
    repositoryCommitSha: "abc",
    assignments: decisions.map((d, index) => ({
      assignmentId: `a${index}`,
      specialistId: d.specialistId,
      objective: `Assess ${d.specialistId}`,
    })),
    decisions,
    comparison: single
      ? { status: "skipped", reason: "insufficient-decisions" }
      : {
          status: "completed",
          comparison: {
            findings: ["conflict", "trade-off"].map((relation) => ({
              concern: "Feedback",
              relation: relation as "conflict" | "trade-off",
              positions: decisions.map((d) => ({
                specialistId: d.specialistId,
                statement: d.recommendation,
                evidenceIndexes: [0],
              })),
              rationale: "Competing approaches",
            })),
            gaps: [
              {
                concern: "Accessibility",
                kind: "uncertainty",
                specialistIds: ["ux"],
                reason: "More evidence needed",
              },
            ],
          },
        },
  };
}
function sources(ctx: SynthesisContext): SourceReference[] {
  return [
    ...ctx.decisions.flatMap((d) => [
      source(d.specialistId),
      ...["evidence", "risk", "uncertainty"].map((kind) => ({
        kind: kind as "evidence" | "risk" | "uncertainty",
        specialistId: d.specialistId,
        index: 0,
      })),
    ]),
    ...(ctx.comparison.status === "completed"
      ? [
          { kind: "finding" as const, index: 0 },
          { kind: "finding" as const, index: 1 },
          { kind: "gap" as const, index: 0 },
        ]
      : []),
  ];
}
function propose(
  ctx = context()
): Extract<CEOSynthesisDecision, { type: "propose" }> {
  return {
    type: "propose",
    proposal: {
      direction: {
        text: "Prefer reversible feedback behavior",
        sources: [source("frontend")],
      },
      rationale: {
        text: "Retain both independent perspectives",
        sources: ctx.decisions.map((d) => source(d.specialistId)),
      },
      alternatives: [
        {
          description: "Replace the interaction entirely",
          reasonNotChosen: "Unmeasured impact",
          sources: [source("frontend")],
        },
      ],
      tradeoffs: [
        {
          text: "Choose reversibility over broader change",
          sources: [source("frontend")],
        },
      ],
      risks: [
        {
          text: "Compatibility risk needs review",
          sources: [{ kind: "risk", specialistId: "frontend", index: 0 }],
        },
      ],
      unresolvedIssues: [
        {
          text: "Reconcile conflicting feedback and missing evidence before implementation",
          sources: sources(ctx),
        },
      ],
      humanReviewItems: [
        {
          text: "Confirm the direction and unresolved issues; this is not approval",
          sources: [source("frontend")],
        },
      ],
    },
  };
}
beforeEach(() => {
  command.mockReset();
});

describe("CEO Synthesis Application", () => {
  it.each([false, true])(
    "proposes from unchanged source data (single=%s)",
    async (single) => {
      const input = context(single);
      const original = structuredClone(input);
      const agent = vi.fn(async (ctx: SynthesisContext) => {
        expect(ctx).toEqual(original);
        expect(ctx).not.toHaveProperty("scope");
        return propose(ctx);
      });
      expect(await runSynthesis(input, { agent })).toEqual({
        status: "proposed",
        proposal: propose(input).proposal,
      });
      expect(input).toEqual(original);
      expect(agent).toHaveBeenCalledTimes(1);
    }
  );
  it("escalates a Human question with traceable sources without treating it as failure or approval", async () => {
    const result = await runSynthesis(context(), {
      agent: async (ctx) => ({
        type: "escalate",
        reason: "Need priority decision",
        questions: ["Which trade-off is acceptable?"],
        sources: sources(ctx),
      }),
    });
    expect(result).toMatchObject({
      status: "escalated",
      reason: "Need priority decision",
      questions: [expect.any(String)],
    });
    expect(result).not.toHaveProperty("approval");
  });
  it.each([
    "empty",
    "missing-assignment",
    "duplicate-assignment",
    "duplicate-decision",
    "wrong-specialist",
    "invalid-skip",
    "invalid-comparison",
    "single-completed",
  ])("rejects %s input before CEO execution", async (kind) => {
    const input = context();
    if (kind === "empty") input.decisions = [];
    if (kind === "missing-assignment") input.assignments.pop();
    if (kind === "duplicate-assignment")
      input.assignments[1].assignmentId = input.assignments[0].assignmentId;
    if (kind === "duplicate-decision") input.decisions[1] = input.decisions[0];
    if (kind === "wrong-specialist")
      input.decisions[1].specialistId = "unknown";
    if (kind === "invalid-skip")
      input.comparison = {
        status: "skipped",
        reason: "insufficient-decisions",
      };
    if (
      kind === "invalid-comparison" &&
      input.comparison.status === "completed"
    )
      input.comparison.comparison.findings[0].positions[0].evidenceIndexes = [
        100,
      ];
    if (kind === "single-completed") {
      input.assignments.pop();
      input.decisions.pop();
    }
    const agent = vi.fn(async () => propose());
    expect(await runSynthesis(input, { agent })).toMatchObject({
      status: "failed",
      failure: "invalid-input",
    });
    expect(agent).not.toHaveBeenCalled();
  });
  it.each([
    { kind: "recommendation", specialistId: "unknown" },
    { kind: "evidence", specialistId: "frontend", index: 99 },
    { kind: "risk", specialistId: "frontend", index: -1 },
    { kind: "uncertainty", specialistId: "ux", index: 0.5 },
    { kind: "finding", index: 99 },
    { kind: "gap", index: 99 },
    {
      kind: "evidence",
      specialistId: "frontend",
      index: 0,
      path: "new-evidence.ts",
    },
  ])("rejects invalid SourceReference %j", async (bad) => {
    const output = propose();
    output.proposal.direction.sources = [bad as SourceReference];
    expect(
      await runSynthesis(context(), { agent: async () => output })
    ).toMatchObject({ status: "failed", failure: "invalid-output" });
  });
  it.each(["recommendation", "risk", "uncertainty", "finding", "gap"])(
    "rejects omitted %s coverage",
    async (kind) => {
      const output = propose();
      for (const item of [
        output.proposal.direction,
        output.proposal.rationale,
        ...output.proposal.alternatives,
        ...output.proposal.tradeoffs,
        ...output.proposal.risks,
        ...output.proposal.unresolvedIssues,
        ...output.proposal.humanReviewItems,
      ]) {
        item.sources = item.sources.filter((s) => s.kind !== kind);
        if (item.sources.length === 0)
          item.sources = [
            { kind: "evidence", specialistId: "frontend", index: 0 },
          ];
      }
      expect(
        await runSynthesis(context(), { agent: async () => output })
      ).toMatchObject({ status: "failed", failure: "invalid-output" });
    }
  );
  it("rejects duplicated references and Comparison sources for skipped Comparison", async () => {
    const output = propose(context(true));
    output.proposal.direction.sources.push(source("frontend"));
    expect(
      (await runSynthesis(context(true), { agent: async () => output })).status
    ).toBe("failed");
    output.proposal.direction.sources = [{ kind: "finding", index: 0 }];
    expect(
      (await runSynthesis(context(true), { agent: async () => output })).status
    ).toBe("failed");
  });
  it("does not allow an Agent to mutate the validation baseline", async () => {
    const input = context(true);
    const original = structuredClone(input);
    const result = await runSynthesis(input, {
      agent: async (ctx) => {
        ctx.decisions[0].evidence.push({
          path: "invented.ts",
          description: "Fake",
        });
        const output = propose(ctx);
        output.proposal.direction.sources = [
          { kind: "evidence", specialistId: "frontend", index: 1 },
        ];
        return output;
      },
    });
    expect(result).toMatchObject({
      status: "failed",
      failure: "invalid-output",
    });
    expect(input).toEqual(original);
  });
  it("distinguishes execution failure and invalid output from escalation without retries", async () => {
    const agent = vi.fn(async () => {
      throw new Error("secret process failure");
    });
    expect(await runSynthesis(context(), { agent })).toEqual({
      status: "failed",
      failure: "agent-execution",
      reason: "CEO Synthesis execution failed.",
    });
    expect(agent).toHaveBeenCalledTimes(1);
    expect(
      await runSynthesis(context(), {
        agent: async () =>
          ({ type: "inspect" }) as unknown as CEOSynthesisDecision,
      })
    ).toMatchObject({ status: "failed", failure: "invalid-output" });
  });
});

describe("Codex CEO Synthesis transport", () => {
  it("uses isolated context-only CEO runtime and cleans up its directory", async () => {
    command.mockImplementation(async (_name, _args, options) => {
      expect(isAbsolute(options.cwd)).toBe(true);
      expect(readdirSync(options.cwd)).toEqual([]);
      return {
        stdout: JSON.stringify(propose(context(true))),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
    });
    expect(
      (await runSynthesis(context(true), { timeoutMs: 1000 })).status
    ).toBe("proposed");
    const [name, args, options] = command.mock.calls[0];
    expect(name).toBe("codex");
    for (const flag of [
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "--ephemeral",
      "--skip-git-repo-check",
      "read-only",
      'approval_policy="never"',
      'web_search="disabled"',
      "project_doc_max_bytes=0",
    ])
      expect(args).toContain(flag);
    expect(args.join(" ")).toContain("shell_tool=false");
    expect(args.join(" ")).toContain("multi_agent=false");
    const prompt = args.at(-1)!;
    expect(JSON.parse(prompt.split("SynthesisContext:\n")[1])).toEqual(
      context(true)
    );
    expect(prompt).toContain("untrusted data");
    expect(options.timeoutMs).toBe(1000);
    expect(existsSync(options.cwd)).toBe(false);
  });
  it.each(["timeout", "process", "json", "schema"])(
    "fails safely on %s",
    async (kind) => {
      command.mockResolvedValue({
        stdout: kind === "schema" ? "{}" : "malformed",
        stderr: "private details",
        exitCode: kind === "process" ? 1 : 0,
        timedOut: kind === "timeout",
      });
      expect((await runSynthesis(context(true))).status).toBe("failed");
      expect(command).toHaveBeenCalledTimes(1);
      expect(existsSync(command.mock.calls[0][2].cwd)).toBe(false);
    }
  );
});
