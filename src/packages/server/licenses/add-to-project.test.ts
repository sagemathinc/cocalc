import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import createProject from "@cocalc/server/projects/create";
import addLicenseToProject from "./add-to-project";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("test various cases of adding a license to a project", () => {
  let project_id = uuid();
  const license_id = uuid();

  it("silently does nothing if the project doesn't exist", async () => {
    // it doesn't check for this -- it's just a db update so harmless I guess.
    await addLicenseToProject({ project_id, license_id });
  });

  it("create new project and add our license to it, then confirm it worked", async () => {
    project_id = await createProject({
      account_id: uuid(),
      title: "My First Project",
      start: false,
    });
    await addLicenseToProject({ project_id, license_id });
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT site_license FROM projects WHERE project_id=$1",
      [project_id],
    );
    expect(rows[0].site_license).toEqual({ [license_id]: {} });
  });

  it("adds same license again things still work", async () => {
    await addLicenseToProject({ project_id, license_id });
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT site_license FROM projects WHERE project_id=$1",
      [project_id],
    );
    expect(rows[0].site_license).toEqual({ [license_id]: {} });
  });

  it("adds a second license, and things  work", async () => {
    const license_id2 = uuid();
    await addLicenseToProject({ project_id, license_id: license_id2 });
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT site_license FROM projects WHERE project_id=$1",
      [project_id],
    );
    expect(rows[0].site_license).toEqual({
      [license_id]: {},
      [license_id2]: {},
    });
  });

  it("resets site_license to {} (instead of null) and checks that adding a license works", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE projects SET site_license='{}' WHERE project_id=$1",
      [project_id],
    );
    await addLicenseToProject({ project_id, license_id });
    const { rows } = await pool.query(
      "SELECT site_license FROM projects WHERE project_id=$1",
      [project_id],
    );
    expect(rows[0].site_license).toEqual({ [license_id]: {} });
  });
});
