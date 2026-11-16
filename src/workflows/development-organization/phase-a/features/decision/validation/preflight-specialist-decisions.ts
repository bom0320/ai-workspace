import {
  getApprovedStaffingScope,
  invokeSpecialistRequestSchema,
  type ApprovedOperatingScope,
  type InvokeSpecialistRequest,
} from "@/application/governance/index.js";

export type SpecialistDecisionsWorkflowInput = {
  scopeId: string;
  requests: InvokeSpecialistRequest[];
};

export function preflightSpecialistDecisions(
  input: SpecialistDecisionsWorkflowInput
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
    // 2. Load Approved Scope
    const approved = getApprovedStaffingScope(input.scopeId);
    if (approved.status !== "approved")
      throw new Error(
        "reason" in approved ? approved.reason : "Approved Scope unavailable."
      );
    const scope = approved.scope;
    // 3. Validate and Detach All Requests
    const assignmentIds = new Set<string>();
    const specialistIds = new Set<string>();
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
      if (
        assignmentIds.has(assignment.assignmentId) ||
        specialistIds.has(assignment.specialistId)
      )
        throw new Error(
          "Duplicate Assignment or Specialist in Decision requests."
        );
      assignmentIds.add(assignment.assignmentId);
      specialistIds.add(assignment.specialistId);
      return request;
    });
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
