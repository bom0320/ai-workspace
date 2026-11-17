import { consumeValidatedSynthesis } from "../validated-result.js";
import { existsSync, readdirSync } from "node:fs";
import { isAbsolute } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "@/infrastructure/process/index.js";
import {
  runSynthesis,
  type SynthesisContext,
  type CEOSynthesisDecision,
  type SourceReference,
} from "../index.js";

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
      rationale: [
        {
          text: "Retain both independent perspectives",
          sources: ctx.decisions.map((d) => source(d.specialistId)),
        },
      ],
      alternatives: [
        {
          description: "Replace the interaction entirely",
          reasonNotChosen: "Unmeasured impact",
          sources: [source("frontend")],
        },
      ],
      tradeoffs: [
        {
          benefit: "Reversible behavior limits regression risk",
          cost: "Broader UX improvement is deferred",
          reason: "Prefer reversibility until measurement gaps are resolved",
          sources:
            ctx.comparison.status === "completed"
              ? [{ kind: "finding", index: 1 }]
              : [source("frontend")],
        },
      ],
      risks: [
        {
          text: "Compatibility risk needs review",
          sources: ctx.decisions.map((d) => ({
            kind: "risk",
            specialistId: d.specialistId,
            index: 0,
          })),
        },
      ],
      unresolvedIssues: [
        {
          text: "Measurement uncertainty requires Human review before implementation",
          sources: ctx.decisions.map((d) => ({
            kind: "uncertainty",
            specialistId: d.specialistId,
            index: 0,
          })),
        },
        ...(ctx.comparison.status === "completed"
          ? [
              {
                text: "Resolve incompatible feedback priorities with the Human",
                sources: [{ kind: "finding" as const, index: 0 }],
              },
              {
                text: "Accessibility evidence is missing and remains unresolved",
                sources: [{ kind: "gap" as const, index: 0 }],
              },
            ]
          : []),
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
  it("consumes only the original validated Synthesis once with an untouched Context", async () => {
    const input = context(true);
    const result = await runSynthesis(input, {
      agent: async () => propose(input),
    });
    if (result.status !== "proposed")
      throw new Error("Missing validated Proposal");
    expect(() => consumeValidatedSynthesis(structuredClone(result))).toThrow(
      "Untrusted"
    );
    const proof = consumeValidatedSynthesis(result);
    expect(proof.context).toEqual(input);
    expect(proof.proposal).toEqual(result.proposal);
    expect(proof.proposal).not.toBe(result.proposal);
    expect(() => consumeValidatedSynthesis(result)).toThrow("consumed");
  });
  it("rejects and consumes a changed Synthesis proposal", async () => {
    const input = context(true);
    const result = await runSynthesis(input, {
      agent: async () => propose(input),
    });
    if (result.status !== "proposed")
      throw new Error("Missing validated Proposal");
    result.proposal.direction.text = "Changed after Coverage Validation";
    expect(() => consumeValidatedSynthesis(result)).toThrow("Untrusted");
    expect(() => consumeValidatedSynthesis(result)).toThrow("consumed");
  });

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
        sources: [{ kind: "finding", index: 0 }],
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
    ).toMatchObject({
      status: "failed",
      failure:
        "path" in bad ||
        ("index" in bad && (bad.index! < 0 || !Number.isInteger(bad.index)))
          ? "invalid-output"
          : "invalid-references",
    });
  });
  it.each(["risk", "uncertainty", "finding", "gap"])(
    "rejects omitted %s coverage",
    async (kind) => {
      const output = propose();
      for (const item of [
        output.proposal.direction,
        ...output.proposal.rationale,
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
      ).toMatchObject({ status: "failed", failure: "incomplete-coverage" });
    }
  );
  it.each([
    { kind: "finding" as const, index: 0 },
    { kind: "finding" as const, index: 1 },
    { kind: "gap" as const, index: 0 },
  ])(
    "rejects one individually omitted Comparison concern %j",
    async (missing) => {
      const output = propose();
      for (const item of [
        ...output.proposal.rationale,
        ...output.proposal.tradeoffs,
        ...output.proposal.unresolvedIssues,
      ]) {
        item.sources = item.sources.filter(
          (s) =>
            !(
              s.kind === missing.kind &&
              "index" in s &&
              s.index === missing.index
            )
        );
        if (item.sources.length === 0)
          item.sources = [
            { kind: "evidence", specialistId: "frontend", index: 0 },
          ];
      }
      expect(
        await runSynthesis(context(), { agent: async () => output })
      ).toMatchObject({ status: "failed", failure: "incomplete-coverage" });
    }
  );
  it("allows targeted Escalation while rejecting invalid or duplicated question sources", async () => {
    for (const sources of [
      [{ kind: "gap", index: 99 }],
      [
        { kind: "gap", index: 0 },
        { kind: "gap", index: 0 },
      ],
    ] as SourceReference[][]) {
      expect(
        await runSynthesis(context(), {
          agent: async () => ({
            type: "escalate",
            reason: "Need accessibility evidence",
            questions: ["How should accessibility be prioritized?"],
            sources,
          }),
        })
      ).toMatchObject({ status: "failed", failure: "invalid-references" });
    }
  });
  it("accepts grouped Risks/Uncertainties without copying each original sentence or citing every recommendation", async () => {
    const output = propose();
    output.proposal.rationale = [
      {
        text: "Select reversible behavior based on the supplied implementation",
        sources: [{ kind: "evidence", specialistId: "frontend", index: 0 }],
      },
    ];
    expect(
      await runSynthesis(context(), { agent: async () => output })
    ).toMatchObject({ status: "proposed" });
    expect(output.proposal.risks).toHaveLength(1);
    expect(output.proposal.risks[0].sources).toHaveLength(2);
  });
  it.each([
    "catch-all",
    "alternatives-only",
    "review-only",
    "risk-in-rationale",
  ])("rejects misplaced or merely listed concern sources: %s", async (kind) => {
    const output = propose();
    if (kind === "catch-all")
      output.proposal.unresolvedIssues = [
        { text: "All concerns reviewed", sources: sources(context()) },
      ];
    if (kind === "alternatives-only" || kind === "review-only") {
      output.proposal.unresolvedIssues =
        output.proposal.unresolvedIssues.filter(
          (item) =>
            !item.sources.some((s) => s.kind === "finding" || s.kind === "gap")
        );
      const references = [
        { kind: "finding" as const, index: 0 },
        { kind: "gap" as const, index: 0 },
      ];
      if (kind === "alternatives-only")
        output.proposal.alternatives[0].sources = references;
      else output.proposal.humanReviewItems[0].sources = references;
    }
    if (kind === "risk-in-rationale") {
      output.proposal.rationale.push(...output.proposal.risks);
      output.proposal.risks = [];
    }
    expect(
      await runSynthesis(context(), { agent: async () => output })
    ).toMatchObject({ status: "failed", failure: "incomplete-coverage" });
  });
  it("requires benefit, cost and choice reason in a Trade-off", async () => {
    const output = propose();
    delete (
      output.proposal.tradeoffs[0] as Partial<
        (typeof output.proposal.tradeoffs)[number]
      >
    ).cost;
    expect(
      await runSynthesis(context(), { agent: async () => output })
    ).toMatchObject({ status: "failed", failure: "invalid-output" });
  });
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
      failure: "invalid-references",
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
      const result = await runSynthesis(context(true));
      expect(JSON.stringify(result)).not.toContain("private details");
      expect(result).toMatchObject({
        status: "failed",
        failure:
          kind === "timeout"
            ? "timeout"
            : kind === "process"
              ? "agent-execution"
              : kind === "json"
                ? "malformed-json"
                : "invalid-output",
      });
      expect(command).toHaveBeenCalledTimes(1);
      expect(existsSync(command.mock.calls[0][2].cwd)).toBe(false);
    }
  );
});
