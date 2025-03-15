/*
Copy between projects on this server
*/

export async function copy(opts: {
  source_project_id: string;
  target_project_id?: string;
  source_path: string;
  target_path: string;
  rsyncOptions?: string;
}) {
  console.log("copy", opts);
  throw Error("copy: not implemented");
}
