import type { InspectedFile } from "@/contracts/inspected-file.js";

export type InspectRequest = {
  paths: string[];
};

export type InspectResult = {
  files: InspectedFile[];
};
export type { InspectedFile } from "@/contracts/inspected-file.js";

