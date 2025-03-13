/*
Tools for stress testing nats so we understand it better.
*/

import { createNatsUser, deleteNatsUser } from "./auth";

function intToUuid(n) {
  const base8 = n.toString(8);
  const padded = base8.padStart(32, "0");
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20, 32)}`;
}

function progress({ n, stop }) {
  console.log(`${n}/${stop}`);
}

export async function createProjects({
  start,
  stop,
}: {
  start: number;
  stop: number;
}) {
  for (let n = start; n < stop; n++) {
    progress({ n, stop });
    try {
      await createNatsUser({ project_id: intToUuid(n) });
    } catch (err) {
      console.log(err);
    }
  }
}

export async function deleteProjects({
  start,
  stop,
}: {
  start: number;
  stop: number;
}) {
  for (let n = start; n < stop; n++) {
    progress({ n, stop });
    try {
      await deleteNatsUser({ project_id: intToUuid(n) });
    } catch (err) {
      console.log(err);
    }
  }
}

export async function createAccounts({
  start,
  stop,
}: {
  start: number;
  stop: number;
}) {
  for (let n = start; n < stop; n++) {
    progress({ n, stop });
    await createNatsUser({ account_id: intToUuid(n) });
  }
}

export async function deleteAccounts({
  start,
  stop,
}: {
  start: number;
  stop: number;
}) {
  for (let n = start; n < stop; n++) {
    progress({ n, stop });
    try {
      await deleteNatsUser({ account_id: intToUuid(n) });
    } catch (err) {
      console.log(err);
    }
  }
}
