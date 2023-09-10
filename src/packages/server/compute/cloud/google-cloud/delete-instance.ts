import getClient from "./client";

interface Options {
  name: string;
  zone: string;
}

export default async function deleteInstance({ name, zone }: Options) {
  const client = await getClient();
  await client.delete({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
}
