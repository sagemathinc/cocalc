import type { Retention } from "../retention";

export default async function update({
  model,
  start,
  stop,
  period,
  dataEnd,
}: Retention): Promise<void> {
  console.log("update", { model, start, stop, period, dataEnd });
  throw Error("todo");
}
