import { basename, extname, sep } from "node:path";

import type { PlanningState } from "../../model/state.js";
import type { TaskDraft } from "../../protocol/planner.js";

const TEXT_FILE_EXTENSIONS = new Set([".md", ".txt"]);

const TEXTUAL_TARGET_PATTERN =
  /(문구|텍스트|오타|표현|소개|설명|wording|text|typo|copy|description)/i;

const SIMPLE_EDIT_ACTION_PATTERN =
  /(수정|고쳐|교정|다듬|변경|바꿔|정정|edit|fix|correct|rewrite|reword|change|clarify)/i;

const COMPLEX_INTENT_PATTERN =
  /(추가|구현|리팩토링|리팩터|삭제|제거|이동|이름\s*변경|의존성|패키지|코드|로직|함수|컴포넌트|API|스키마|설정|빌드|테스트|add|implement|refactor|delete|remove|move|rename|dependency|package|code|logic|function|component|api|schema|config|build|test)/i;

function isSupportedTextFile(path: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(extname(path).toLowerCase());
}

function getTargetNames(filePath: string, fileTree: string[]): string[] {
  const normalizedPath = filePath.split(sep).join("/");
  const fileName = basename(filePath);

  const basenameCount = fileTree.filter(
    (path) => basename(path).toLowerCase() === fileName.toLowerCase()
  ).length;

  const names = [normalizedPath];

  if (basenameCount === 1) {
    names.push(fileName);
  }

  if (normalizedPath.toLowerCase() === "readme.md" && basenameCount === 1) {
    names.push("README");
  }

  return names;
}

function mentionsTargetFile(objective: string, targetNames: string[]): boolean {
  const normalizedObjective = objective.replaceAll("\\", "/").toLowerCase();

  // Parent-directory path components cannot identify a Fast Path target.
  if (/(?:^|[\s/"'`([{])\.\.(?=\/)/.test(normalizedObjective)) {
    return false;
  }

  return targetNames.some((name) =>
    normalizedObjective.includes(name.toLowerCase())
  );
}

function isSimpleTextEdit(objective: string): boolean {
  return (
    TEXTUAL_TARGET_PATTERN.test(objective) &&
    SIMPLE_EDIT_ACTION_PATTERN.test(objective) &&
    !COMPLEX_INTENT_PATTERN.test(objective)
  );
}

function matchesPhrase(text: string, phrases: string[]): boolean {
  return phrases.includes(text.trim().replace(/\.$/, ""));
}

function isTypoCorrection(text: string, path: string): boolean {
  return matchesPhrase(text, [
    `Fix typos in ${path}`,
    `Correct typos in ${path}`,
    `Correct spelling errors in ${path}`,
    `${path}의 오타를 수정해줘`,
    `${path}의 오타를 교정한다`,
    `${path} 오타 수정`,
  ]);
}

function isTypoCorrectionDeliverable(text: string, path: string): boolean {
  return matchesPhrase(text, [
    `Corrected typos in ${path}`,
    `${path} with typos corrected`,
    `${path}의 오타 수정본`,
    `오타를 교정한 ${path}`,
  ]);
}

function supportsDetailedFastPath(
  goal: PlanningState["goal"],
  direction: string,
  path: string
): boolean {
  return (
    isTypoCorrection(direction, path) &&
    (isTypoCorrection(goal.objective, path) ||
      matchesPhrase(goal.objective, [
        "Improve the documentation",
        "Improve documentation quality",
        "문서 품질 개선",
        "문서 품질을 개선한다",
      ])) &&
    (goal.constraints ?? []).every((constraint) =>
      matchesPhrase(constraint, [
        "Keep changes scoped",
        "Keep changes minimal",
        "Do not change code",
        "Do not add or update dependencies",
        "Do not make unrelated edits",
        `Only modify ${path}`,
      ])
    )
  );
}

function getFastPathObjective(
  { detail, goal, repository }: PlanningState,
  filePath: string
): string | undefined {
  if (detail) {
    const path = filePath.split(sep).join("/");
    // Restrict the path token and match whole supported phrases. Free-form
    // goals, approval directions, and constraints require the Planner.
    if (
      /^(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(
        path
      ) &&
      isTypoCorrection(detail.objective, path) &&
      isTypoCorrectionDeliverable(detail.deliverable, path) &&
      supportsDetailedFastPath(goal, detail.direction, path)
    ) {
      return detail.objective;
    }
    return;
  }

  const objective = goal.objective.trim();
  const targetNames = getTargetNames(filePath, repository.fileTree);
  if (
    mentionsTargetFile(objective, targetNames) &&
    isSimpleTextEdit(objective)
  ) {
    return goal.objective;
  }
}

export function createFastPathTaskDraft(
  state: PlanningState
): TaskDraft | undefined {
  if (state.inspectedFiles.length !== 1) {
    return;
  }

  const file = state.inspectedFiles[0];

  if (!file) {
    return;
  }

  if (!state.repository.fileTree.includes(file.path)) {
    return;
  }

  if (!isSupportedTextFile(file.path)) {
    return;
  }

  const objective = getFastPathObjective(state, file.path);
  if (!objective) {
    return;
  }

  return {
    objective,
    targetRepository: state.goal.targetRepository,
    allowedPaths: [file.path],
    forbiddenPaths: [],
    constraints: [
      `Only modify ${file.path}.`,
      "Do not add or update dependencies.",
      "Do not make unrelated edits.",
    ],
    acceptanceCriteria: [
      state.detail?.deliverable ??
        `${file.path} reflects the requested textual change without unrelated edits.`,
    ],
    verification: ["git diff --check"],
  };
}
