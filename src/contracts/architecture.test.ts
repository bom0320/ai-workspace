import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const contractsRoot = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const compilerOptions: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  paths: { "@/*": [join(sourceRoot, "*")] },
};

it("keeps production contracts independent of higher layers and acyclic", () => {
  const graph = new Map<string, string[]>();
  const violations: string[] = [];
  const files = readdirSync(contractsRoot, {
    recursive: true,
    encoding: "utf8",
  }).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

  for (const file of files) {
    const filename = join(contractsRoot, file);
    const { importedFiles } = ts.preProcessFile(
      readFileSync(filename, "utf8"),
      true,
      true
    );
    const dependencies: string[] = [];
    for (const { fileName: specifier } of importedFiles) {
      if (specifier === "zod") continue;
      const resolved = ts.resolveModuleName(
        specifier,
        filename,
        compilerOptions,
        ts.sys
      ).resolvedModule;
      const dependency =
        resolved && relative(contractsRoot, resolved.resolvedFileName);
      if (
        !dependency ||
        dependency === ".." ||
        dependency.startsWith(`..${sep}`) ||
        isAbsolute(dependency) ||
        dependency.endsWith(".test.ts")
      ) {
        violations.push(`${file} imports ${specifier}`);
      } else {
        dependencies.push(dependency);
      }
    }
    graph.set(file, dependencies);
  }
  expect(violations).toEqual([]);

  const checked = new Set<string>();
  function visit(file: string, ancestors: string[]): void {
    expect(
      ancestors,
      `Contract cycle: ${[...ancestors, file].join(" → ")}`
    ).not.toContain(file);
    if (checked.has(file)) return;
    for (const dependency of graph.get(file) ?? []) {
      visit(dependency, [...ancestors, file]);
    }
    checked.add(file);
  }

  for (const file of graph.keys()) visit(file, []);
});
