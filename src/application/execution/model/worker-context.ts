import type { InspectedFile } from "@/contracts/inspected-file.js";

export type WorkerContext = {
  inspectedFiles: InspectedFile[];
};
