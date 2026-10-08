export type InspectRequest = {
  paths: string[];
};

export type InspectedFile = {
  path: string;
  content: string;
};

export type InspectResult = {
  files: InspectedFile[];
};

