export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function getDevUser() {
  return {
    id: process.env.AARUSH_DEV_USER_ID ?? "00000000-0000-0000-0000-000000000001",
    name: process.env.AARUSH_DEV_USER_NAME ?? "Owner",
  };
}

export function isElevenLabsEnabled(): boolean {
  return process.env.ELEVENLABS_ENABLED === "true";
}
