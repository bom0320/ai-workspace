export type InspectionRequest = {
  paths: string[];
};

export type InspectedFile = {
  path: string;
  content: string;
};

export type InspectionResult = {
  files: InspectedFile[];
};
