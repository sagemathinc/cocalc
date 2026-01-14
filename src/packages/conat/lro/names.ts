export function lroStreamName(op_id: string): string {
  if (!op_id) {
    throw new Error("op_id must be set");
  }
  return `lro.${op_id}`;
}
