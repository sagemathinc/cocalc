import { webapp_client } from "../webapp-client";

// Delete the files/directories in the given project with the given list of paths.
export async function delete_files(
  project_id: string,
  paths: string[]
): Promise<void> {
  // Get project api
  const api = (await webapp_client.project_websocket(project_id)).api;
  // Send message requesting to delete the files
  await api.delete_files(paths);
}
