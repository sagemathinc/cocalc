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
  it("create file server", async () => {
    await createFileServer({
      client: client1,
      mount: async ({ project_id }) => {
        volumes.add(project_id);
      },
    });
  });

  let project_id;
  it("make a client and test the file server", async () => {
    project_id = uuid();
    const fileClient = createFileClient({
      client: client2,
    });
    await fileClient.mount({ project_id });
    expect(volumes.has(project_id));
  });
});

afterAll(after);
