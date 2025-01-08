import { webapp_client } from "@cocalc/frontend/webapp-client";

export async function getSyncTable({
  course_project_id,
  course_server_id,
  fields,
}: {
  course_project_id: string;
  course_server_id: number;
  fields: string[];
}) {
  const spec: any = { id: null, course_project_id, course_server_id };
  for (const field of fields) {
    if (spec[field] === undefined) {
      spec[field] = null;
    }
  }
  const query = {
    compute_servers_by_course: [spec],
  };

  return await webapp_client.sync_client.sync_table(query);
}

export async function getComputeServers({
  project_id,
  course_project_id,
  course_server_id,
  fields = [],
}: {
  project_id: string;
  course_project_id: string;
  course_server_id: number;
  fields?: string[];
}) {
  const spec: any = {
    id: null,
    course_project_id,
    course_server_id,
    project_id,
  };
  for (const field of fields) {
    if (spec[field] === undefined) {
      spec[field] = null;
    }
  }
  const v = await webapp_client.async_query({
    query: { compute_servers: [spec] },
  });
  return v.query.compute_servers;
}
