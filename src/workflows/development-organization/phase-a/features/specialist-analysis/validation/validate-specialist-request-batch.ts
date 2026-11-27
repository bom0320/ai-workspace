import {
  invokeSpecialistRequestSchema,
  type ApprovedOperatingScope,
  type InvokeSpecialistRequest,
} from "@/application/governance/index.js";

export type SpecialistDecisionsWorkflowInput = {
  scopeId: string;
  requests: InvokeSpecialistRequest[];
};

export function validateSpecialistRequestBatch(
  input: SpecialistDecisionsWorkflowInput,
  scope: ApprovedOperatingScope
):
  | {
      status: "ready";
      scope: ApprovedOperatingScope;
      requests: InvokeSpecialistRequest[];
    }
  | {
      status: "failed";
      stage: "preflight";
      reason: string;
      assignmentId?: string;
    } {
  let assignmentId: string | undefined;
  try {
    // 1. Validate Input Shape
    if (
      !input ||
      typeof input.scopeId !== "string" ||
      !input.scopeId.trim() ||
      !Array.isArray(input.requests) ||
      input.requests.length === 0
    )
      throw new Error(
        "A Scope ID and non-empty Assignment request list are required."
      );
    // 2. Validate the Batch Against the Supplied Scope
    // This is a batch consistency check, not proof of approval. The caller must
    // load Scope through Governance; Authorization rechecks current authority.
    if (input.scopeId !== scope.id)
      throw new Error("Batch Scope ID does not match the supplied Scope.");
    const assignmentIds = new Set<string>();
    // 3. Validate and Detach Every Request
    // Array.from visits sparse slots so missing requests fail validation too.
    const requests = Array.from(input.requests, (raw) => {
      assignmentId =
        typeof raw?.assignmentId === "string" ? raw.assignmentId : undefined;
      const request = invokeSpecialistRequestSchema.parse(raw);
      if (
        request.scopeId !== scope.id ||
        request.scopeVersion !== scope.version
      )
        throw new Error(
          "Requests must use the same approved Scope ID and version."
        );
      const assignment = scope.assignments.find(
        (item) => item.assignmentId === request.assignmentId
      );
      if (!assignment)
        throw new Error("Assignment does not belong to the approved Scope.");
      if (assignmentIds.has(assignment.assignmentId))
        throw new Error("Duplicate Assignment in Decision requests.");
      assignmentIds.add(assignment.assignmentId);
      return request;
    });
    // Phase A executes every approved Assignment once, in approved order.
    // Detect missing or reordered work before any Invocation consumes budget.
    if (requests.length !== scope.assignments.length)
      throw new Error(
        "Decision requests must include every approved Assignment."
      );
    for (const [index, request] of requests.entries()) {
      assignmentId = request.assignmentId;
      if (request.assignmentId !== scope.assignments[index].assignmentId)
        throw new Error(
          "Decision requests must preserve approved Assignment order."
        );
    }
    return { status: "ready", scope, requests };
  } catch (error) {
    return {
      status: "failed",
      stage: "preflight",
      reason:
        error instanceof Error
          ? error.message
          : "Specialist Decision Workflow failed.",
      ...(assignmentId !== undefined ? { assignmentId } : {}),
    };
  }
}
