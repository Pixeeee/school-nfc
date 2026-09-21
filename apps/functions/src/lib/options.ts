
export const callableOptions = {
  region: "asia-southeast1" as const,
  enforceAppCheck: true,
  cors: true,
  timeoutSeconds: 60,
  memory: "256MiB" as const,
  maxInstances: 50,
};
