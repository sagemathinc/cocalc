export async function getMutagenAgent(): Promise<{
  path: string;
  version: string;
}> {
  return {
    path: "/home/wstein/build/cocalc-lite/src/packages/file-server/ssh/agent",
    // *MUST* be the same version that the project uses
    version: "0.19.0-dev",
  };
}
