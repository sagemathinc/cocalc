export default async function setMetrics({
  compute_server_id,
  bytes_get,
  bytes_put,
  objects_get,
  objects_put,
  objects_delete,
}: {
  compute_server_id: number;
  bytes_get?: number;
  bytes_put?: number;
  objects_get?: number;
  objects_put?: number;
  objects_delete?: number;
}) {
  console.log({
    compute_server_id,
    bytes_get,
    bytes_put,
    objects_get,
    objects_put,
    objects_delete,
  });
}
