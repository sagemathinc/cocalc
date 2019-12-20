export function computeVersion(id?: string): "A" | "B" {
  console.log("Receiving id:", id)
  if (id) {
    return parseInt(id[0], 16) < 8 ? "B" : "A";
  } else {
    return "A";
  }
}
