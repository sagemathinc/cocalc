import getClient from "./client";
import getPool from "@cocalc/database/pool";

// https://developers.salesloft.com/docs/api/people-index
export async function list(params: object) {
  const client = await getClient();
  const { data } = await client.get("people", { params });
  return data;
}

export async function create(newPerson: object) {
  const client = await getClient();
  const { data } = await client.post("people", newPerson);
  return data;
}

export async function destroy(personId: string) {
  const db = getPool("long");
  // this would likely be slow, due to no index.
  await db.query(
    "UPDATE accounts SET salesloft_id=NULL WHERE salesloft_id=$1",
    [personId]
  );
  const client = await getClient();
  await client.delete(`/people/${personId}`);
}

export async function fetch(personId: string) {
  const client = await getClient();
  const { data } = await client.get(`/people/${personId}`);
  return data;
}

export async function update(personId: string, changes: object) {
  const client = await getClient();
  const { data } = await client.put(`/people/${personId}`, changes);
  return data;
}
