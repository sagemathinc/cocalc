export type MoveProjectToHostInput = {
  project_id: string;
  dest_host_id: string;
  account_id: string;
};

export async function moveProjectToHost(
  _input: MoveProjectToHostInput,
): Promise<void> {
  // Implementation planned in src/.agents/buckets.md (Phase 2).
  throw new Error("moveProjectToHost not implemented yet");
}
