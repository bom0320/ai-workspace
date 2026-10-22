import { describe, expect, it } from "vitest";

import type { PlanningState } from "../../model/state.js";
import { taskDraftSchema } from "../../protocol/planner.js";
import { createFastPathTaskDraft } from "./create-fast-path-task-draft.js";

function state(objective: string, filePath = "README.md"): PlanningState {
  return {
    goal: {
      objective,
      targetRepository: "example",
    },
    repository: {
      repositoryRoot: "/repo",
      repositoryName: "example",
      fileTree: [filePath, "package.json"],
      packageScripts: {},
    },
    inspectedFiles: [
      {
        path: filePath,
        content: "Introduction",
      },
    ],
  };
}

describe("createFastPathTaskDraft", () => {
  it.each([
    "../README.md의 문구를 수정해줘",
    "../../README.md의 문구를 수정해줘",
    "..\\README.md의 문구를 수정해줘",
    "docs/../../README.md의 문구를 수정해줘",
    '"../README.md"의 문구를 수정해줘',
  ])("rejects parent-directory path components: %s", (objective) => {
    expect(createFastPathTaskDraft(state(objective))).toBeUndefined();
  });

  it.each([
    "README.md의 소개 문구를 더 명확하게 수정해줘",
    "README.md의 문구를 수정해줘",
    "README의 문구를 수정해줘",
    "README의 오타를 수정해줘",
    "README의 프로젝트 설명을 자연스럽게 다듬어줘",
  ])("accepts an explicit single-document textual edit: %s", (objective) => {
    const input = state(objective);
    const before = structuredClone(input);

    const draft = createFastPathTaskDraft(input);

    expect(draft).toBeDefined();

    if (!draft) return;

    expect(taskDraftSchema.parse(draft)).toEqual(draft);
    expect(draft.allowedPaths).toEqual(["README.md"]);
    expect(draft.verification).toEqual(["git diff --check"]);

    expect(input).toEqual(before);
  });

  it.each([
    "README 구조를 리팩토링하고 코드 예제를 추가해줘",
    "README.md와 package.json의 문구를 수정해줘",
    "README.md를 삭제해줘",
    "README.md의 문구를 수정하고 API를 변경해줘",
    "README.md의 문구를 수정해줘 그리고 파일을 이동해줘",
    "README.md 좀 더 정확하게 수정해줘",
    "../README.md의 문구를 수정해줘",
  ])(
    "falls back on complex, destructive or ambiguous requests: %s",
    (objective) => {
      expect(createFastPathTaskDraft(state(objective))).toBeUndefined();
    }
  );

  it("requires exactly one inspected file from the repository inventory", () => {
    const input = state("README의 오타를 수정해줘");

    input.inspectedFiles = [];

    expect(createFastPathTaskDraft(input)).toBeUndefined();

    input.inspectedFiles = [
      {
        path: "README.md",
        content: "read",
      },
      {
        path: "package.json",
        content: "{}",
      },
    ];

    expect(createFastPathTaskDraft(input)).toBeUndefined();

    input.inspectedFiles = [
      {
        path: "outside.md",
        content: "read",
      },
    ];

    expect(createFastPathTaskDraft(input)).toBeUndefined();
  });

  it("supports .txt documents", () => {
    const input = state("notes.txt의 오타를 수정해줘", "notes.txt");

    expect(createFastPathTaskDraft(input)?.allowedPaths).toEqual(["notes.txt"]);
    expect(
      createFastPathTaskDraft(state("notes.txt의 문구를 수정해줘", "notes.txt"))
        ?.allowedPaths
    ).toEqual(["notes.txt"]);
  });

  it("never uses the fast path for source files", () => {
    const input = state("example.ts의 문구를 수정해줘", "example.ts");

    expect(createFastPathTaskDraft(input)).toBeUndefined();
  });

  it("falls back when a basename is ambiguous", () => {
    const input = state("guide.md의 문구를 수정해줘", "docs/guide.md");

    input.repository.fileTree = ["docs/guide.md", "examples/guide.md"];

    expect(createFastPathTaskDraft(input)).toBeUndefined();
  });
});
