import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import {
  server as createFileServer,
  client as createFileClient,
} from "@cocalc/conat/files/file-server";
import { uuid } from "@cocalc/util/misc";

beforeAll(before);

describe("create basic mocked file server and test it out", () => {
  let client1, client2;
  it("create two clients", () => {
    client1 = connect();
    client2 = connect();
  });

  const volumes = new Set<string>();
  const quotaSize: { [project_id: string]: number } = {};
  it("create file server", async () => {
    await createFileServer({
      client: client1,
      mount: async ({ project_id }): Promise<{ path: string }> => {
        volumes.add(project_id);
        return { path: `/mnt/${project_id}` };
      },

      // create project_id as an exact lightweight clone of src_project_id
      clone: async (opts: {
        project_id: string;
        src_project_id: string;
      }): Promise<void> => {
        volumes.add(opts.project_id);
      },

      getUsage: async (_opts: {
        project_id: string;
      }): Promise<{
        size: number;
        used: number;
        free: number;
      }> => {
        return { size: 0, used: 0, free: 0 };
      },

      getQuota: async (_opts: {
        project_id: string;
      }): Promise<{
        size: number;
        used: number;
      }> => {
        return { size: quotaSize[project_id] ?? 0, used: 0 };
      },

      setQuota: async ({
        project_id,
        size,
      }: {
        project_id: string;
        size: number | string;
      }): Promise<void> => {
        quotaSize[project_id] = typeof size == "string" ? parseInt(size) : size;
      },

      cp: async (_opts: {
        // the src paths are relative to the src volume
        src: { project_id: string; path: string | string[] };
        // the dest path is relative to the dest volume
        dest: { project_id: string; path: string };
        options?;
      }): Promise<void> => {},
    });
  });

  let project_id;
  it("make a client and test the file server", async () => {
    project_id = uuid();
    const fileClient = createFileClient({
      client: client2,
    });
    const { path } = await fileClient.mount({ project_id });
    expect(path).toEqual(`/mnt/${project_id}`);
    expect(volumes.has(project_id));

    expect(await fileClient.getUsage({ project_id })).toEqual({
      size: 0,
      used: 0,
      free: 0,
    });

    expect(await fileClient.getQuota({ project_id })).toEqual({
      size: 0,
      used: 0,
    });

    await fileClient.setQuota({ project_id, size: 10 });

    expect(await fileClient.getQuota({ project_id })).toEqual({
      size: 10,
      used: 0,
    });

    await fileClient.cp({
      src: { project_id, path: "x" },
      dest: { project_id, path: "y" },
    });
  });
});

afterAll(after);
