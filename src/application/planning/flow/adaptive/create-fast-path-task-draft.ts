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

  const targetNames = getTargetNames(file.path, state.repository.fileTree);

  const objective = state.goal.objective.trim();

  if (!mentionsTargetFile(objective, targetNames)) {
    return;
  }

  if (!isSimpleTextEdit(objective)) {
    return;
  }

  return {
    objective: state.goal.objective,
    targetRepository: state.goal.targetRepository,
    allowedPaths: [file.path],
    forbiddenPaths: [],
    constraints: [
      `Only modify ${file.path}.`,
      "Do not add or update dependencies.",
      "Do not make unrelated edits.",
    ],
    acceptanceCriteria: [
      `${file.path} reflects the requested textual change without unrelated edits.`,
    ],
    verification: ["git diff --check"],
  };
}
