import type { InspectedFile } from "@/contracts/repository/inspected-file.js";

export type WorkerContext = {
  inspectedFiles: InspectedFile[];
};
