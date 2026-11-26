import {
  agentDecisionSchema,
  validateDecisionEvidence,
} from "@/application/specialist/analysis/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type { GovernanceLedger } from "../../../../../model/ledger.js";
import type { Handoff } from "../../../../../records/assignment-plans/prepare-assignment-context.js";
import { executionBoundsSchema } from "../../../../../approval/features/system-policy/model/execution-system-policy.js";
import {
  AssignmentExecutionError,
  authorizedAssignmentReadExecutionSchema,
  digestPreparedAssignmentTask,
  type AuthorizedAssignmentExecution,
} from "../../../../../model/assignment-execution.js";
import { withGovernanceLedger } from "../../../../../records/governance-transaction.js";
import { consumeIssuedAssignmentClaim } from "../claim/claim-assignment-execution.js";
import { checkWriteEligibility } from "./check-write-eligibility.js";
import { loadAssignmentReadContext } from "./load-assignment-read-context.js";
import { resolveLiveReadClaim } from "./resolve-live-read-claim.js";
import { validatePreparedTask } from "./validate-prepared-task.js";

export function consumeAssignmentReadContext(
  handoff: Handoff,
  claimed: AuthorizedAssignmentExecution
) {
  consumeIssuedAssignmentClaim(claimed);
  const permit = authorizedAssignmentReadExecutionSchema.parse(claimed);
  const trustedHandoff = structuredClone(handoff);
  const resolveLiveClaim = (ledger: GovernanceLedger) =>
    resolveLiveReadClaim(ledger, trustedHandoff, permit);

  const { context, specialist, workItem, assignment, deadlineMs } =
    withGovernanceLedger((ledger) => {
      const { resolved, deadlineMs, remainingTime } = resolveLiveClaim(ledger);
      const context = loadAssignmentReadContext(
        resolved,
        permit.readScopes,
        remainingTime,
        permit.initialReadPaths
      );
      return {
        context,
        specialist: resolved.specialist,
        workItem: resolved.workItem,
        assignment: resolved.assignment,
        deadlineMs,
      };
    });
  const isReadAssignment = assignment.repositoryAccessCeiling === "read";
  let inspectedContext = context;
  let detailing = false;
  let inspections = 0;
  const inspectionLimits = {
    maxRounds: 4,
    maxFilesPerRequest: 4,
    maxTotalFiles: 32,
  } as const;
  const validateAnalysis = (input: unknown) => {
    try {
      const decision = agentDecisionSchema.parse(input);
      if (decision.specialistId !== permit.specialistId) throw new Error();
      validateDecisionEvidence(context, decision);
      return decision;
    } catch {
      throw new AssignmentExecutionError("validation");
    }
  };

  let finalized = false;
  return {
    context: structuredClone(context),
    specialist,
    workItem,
    assignment,
    authority: permit.authority,
    deadlineMs,
    inspectionLimits,
    checkWriteEligibility() {
      if (finalized) throw new AssignmentExecutionError("claim");
      const bounds = withGovernanceLedger((ledger) =>
        checkWriteEligibility(resolveLiveClaim(ledger), permit.readScopes)
      );
      detailing = true;
      return bounds;
    },
    inspect(paths: string[]) {
      if (!detailing || finalized) throw new AssignmentExecutionError("claim");
      if (++inspections >= inspectionLimits.maxRounds)
        throw new AssignmentExecutionError("validation");
      const requested = executionBoundsSchema.shape.readPaths.parse(paths);
      if (
        !requested.length ||
        requested.length > inspectionLimits.maxFilesPerRequest
      )
        throw new AssignmentExecutionError("validation");
      inspectedContext = withGovernanceLedger((ledger) => {
        const live = resolveLiveClaim(ledger);
        checkWriteEligibility(live, permit.readScopes);
        return loadAssignmentReadContext(
          live.resolved,
          permit.readScopes,
          live.remainingTime,
          requested,
          inspectedContext
        );
      });
      return structuredClone(inspectedContext);
    },
    recordPreparedTask(input: unknown) {
      if (!detailing || finalized) throw new AssignmentExecutionError("claim");
      finalized = true;
      return withGovernanceLedger((ledger, save) => {
        const live = resolveLiveClaim(ledger);
        const bounds = checkWriteEligibility(live, permit.readScopes);
        const task = validatePreparedTask(
          input,
          bounds,
          inspectedContext,
          permit.snapshot,
          live.remainingTime
        );
        const result = {
          status: "task-prepared" as const,
          task,
          contextDigest: governanceDigest(inspectedContext),
        };
        const { record } = live;
        const digests = digestPreparedAssignmentTask(record, result);
        record.result = { ...result, ...digests };
        live.remainingTime();
        save();
        return {
          invocationId: record.id,
          resultDigest: digests.digest,
          taskContractBinding: digests.taskContractBinding,
        };
      });
    },
    recordResult(input: unknown) {
      if (!isReadAssignment || detailing || finalized)
        throw new AssignmentExecutionError("claim");
      finalized = true;
      const decision = validateAnalysis(input);
      const contextDigest = governanceDigest(inspectedContext);
      return withGovernanceLedger((ledger, save) => {
        const { record, remainingTime } = resolveLiveClaim(ledger);
        const resultDigest = governanceDigest({
          id: record.id,
          binding: record.binding,
          decision,
          contextDigest,
        });
        record.result = { decision, contextDigest, digest: resultDigest };
        remainingTime();
        save();
        return { invocationId: record.id, resultDigest };
      });
    },
  };
}

// This session stays in the process that consumed the Claim.
export type AssignmentReadSession = ReturnType<
  typeof consumeAssignmentReadContext
>;
