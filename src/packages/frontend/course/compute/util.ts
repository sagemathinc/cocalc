export function getUnitId(unit): string {
  const id = unit.get("assignment_id") ?? unit.get("handout_id");
  if (id == null) {
    throw Error("one of assignment_id or handout_id of unit must be defined");
  }
  return id;
}
