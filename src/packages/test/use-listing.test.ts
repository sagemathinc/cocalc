import { renderHook } from "@testing-library/react";
import { fsClient } from "@cocalc/conat/files/fs";
import { before, after } from "@cocalc/backend/conat/test/setup";
import { uuid } from "@cocalc/util/misc";
import {
  createPathFileserver,
  cleanupFileservers,
} from "@cocalc/backend/conat/files/test/util";
import { useFiles } from "@cocalc/frontend/project/listing/use-listing";

beforeAll(before);

describe("use all the standard api functions of fs", () => {
  const project_id = uuid();
  let fs, server;
  it("creates fileserver service and fs client", async () => {
    server = await createPathFileserver();
    fs = fsClient({ subject: `${server.service}.project-${project_id}` });
  });

  it("test useFiles", async () => {
    const f = () => {
      return useFiles({ fs, path: "", throttleUpdate: 0 });
    };
    const { result } = renderHook(f);
    expect(result.current).toEqual({ files: null, error: null });
  });
});

afterAll(async () => {
  await after();
  await cleanupFileservers();
});
