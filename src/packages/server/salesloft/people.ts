import getClient from "./client";

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
