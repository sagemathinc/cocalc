/*
 *  This file is part of CoCalc: Copyright (c) 2026 Sagemath, Inc.
 *  License: MS-RSL - see LICENSE.md for details
 */

import { randomUUID } from "node:crypto";
import { getPglite, closePglite } from "./index";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const pg = await getPglite();

  await pg.query("CREATE TABLE IF NOT EXISTS pglite_smoke (id TEXT PRIMARY KEY, note TEXT)");
  const id = randomUUID();
  await pg.query("INSERT INTO pglite_smoke (id, note) VALUES ($1, $2)", [
    id,
    "hello",
  ]);
  const { rows } = await pg.query<{ id: string; note: string }>(
    "SELECT id, note FROM pglite_smoke WHERE id = $1",
    [id],
  );
  if (rows.length !== 1 || rows[0].note !== "hello") {
    throw new Error("pglite smoke: unexpected row contents");
  }

  const channel = "pglite_smoke";
  const messages: string[] = [];
  const unsubscribe = await pg.listen(channel, (payload) => {
    messages.push(payload ?? "");
  });
  await pg.query(`NOTIFY ${channel}, 'ping'`);
  await sleep(50);
  await unsubscribe();
  if (messages.length !== 1 || messages[0] !== "ping") {
    throw new Error("pglite smoke: listen/notify failed");
  }

  await closePglite();
  console.log("pglite smoke: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
