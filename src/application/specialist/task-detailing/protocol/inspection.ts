import type { InspectedFile } from "@/contracts/repository/inspected-file.js";

export type InspectRequest = {
  paths: string[];
};

export type InspectResult = {
  files: InspectedFile[];
};
export type { InspectedFile } from "@/contracts/repository/inspected-file.js";
