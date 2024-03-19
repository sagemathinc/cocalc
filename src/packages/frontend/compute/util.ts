
import { webapp_client } from "@cocalc/frontend/webapp-client";

export async function writeTextFileToComputeServer({
  value,
  project_id,
  compute_server_id,
  path, // won't work if path has double quotes in it!
  sudo,
}: {
  value: string;
  project_id: string;
  compute_server_id: number;
  path: string;
  sudo?: boolean;
}) {
  // Base64 encode the value.
  const base64value = Buffer.from(value).toString("base64");
  if (sudo) {
    // Decode the base64 string before echoing it.
    const args = [
      "sh",
      "-c",
      `echo "${base64value}" | base64 --decode > "${path}"`,
    ];

    await webapp_client.exec({
      filesystem: true,
      compute_server_id,
      project_id,
      command: "sudo",
      args,
    });
  } else {
    await webapp_client.exec({
      filesystem: true,
      compute_server_id,
      project_id,
      command: `echo "${base64value}" | base64 --decode > "${path}"`,
    });
  }
}
