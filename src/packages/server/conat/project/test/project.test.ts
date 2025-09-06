import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import { projectApiClient } from "@cocalc/conat/project/api";
import { getProject } from "@cocalc/server/projects/control";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import { before, after } from "@cocalc/server/test";

beforeAll(before);
afterAll(after);

describe("create account, project, then start and stop project", () => {
  const account_id = uuid();
  let project_id;

  it("create an account and a project so we can control it", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
  });

  it("creates a project", async () => {
    project_id = await createProject({
      account_id,
      title: "My First Project",
      start: false,
    });
  });

  it("restart if running (it is not)", async () => {
    await restartProjectIfRunning(project_id);
  });

  let project;
  it("get state of project", async () => {
    project = getProject(project_id);
    const { state } = await project.state();
    expect(state).toEqual("opened");

    // cached
    expect(getProject(project_id)).toBe(project);
  });

  let projectStartTime;
  it("start the project", async () => {
    projectStartTime = Date.now();
    await project.start();
    const { state } = await project.state();
    expect(state).toEqual("running");
    const startupTime = Date.now() - projectStartTime;
    // this better be fast (on unloaded system it is about 100ms)
    expect(startupTime).toBeLessThan(2000);
  });

  it("run a command in the project to confirm everything is properly working, available and the project started and connected to conat", async () => {
    const api = projectApiClient({ project_id });
    const { stdout, stderr, exit_code } = await api.system.exec({
      command: "bash",
      args: ["-c", "echo $((2+3))"],
    });
    expect({ stdout, stderr, exit_code }).toEqual({
      stdout: "5\n",
      stderr: "",
      exit_code: 0,
    });

    const firstOutputTime = Date.now() - projectStartTime;
    // this better be fast (on unloaded system is less than 1 second)
    expect(firstOutputTime).toBeLessThan(5000);
  });

  it("stop the project", async () => {
    await project.stop();
    const { state } = await project.state();
    expect(state).toEqual("opened");
  });
});
