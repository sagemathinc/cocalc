/** @jest-environment node */

const runE2E = process.env.COCALC_E2E === "true";
const describeE2E = runE2E ? describe : describe.skip;

describeE2E("/api/v2/exec e2e", () => {
  const apiKey = process.env.COCALC_API_KEY ?? "";
  const projectId = process.env.COCALC_PROJECT_ID ?? "";
  const host = process.env.COCALC_HOST ?? "http://localhost:5000";

  beforeAll(() => {
    if (!apiKey || !projectId) {
      throw new Error(
        "COCALC_API_KEY and COCALC_PROJECT_ID must be set when COCALC_E2E=true",
      );
    }
  });

  test("exec date -Is", async () => {
    const auth = Buffer.from(`${apiKey}:`).toString("base64");
    const response = await fetch(`${host}/api/v2/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        command: "date",
        args: ["-Is"],
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    if (data?.error) {
      throw new Error(`API error: ${data.error}`);
    }

    const stdout = String(data.stdout ?? "").trim();
    const stderr = String(data.stderr ?? "").trim();

    expect(data.exit_code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });

  test("exec async_call with async_get", async () => {
    const auth = Buffer.from(`${apiKey}:`).toString("base64");
    const startResp = await fetch(`${host}/api/v2/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        bash: true,
        command:
          "echo $TEST_ENV; for i in $(seq 10); do echo i=$i; sleep 0.1; done",
        timeout: 10,
        async_call: true,
        env: {
          TEST_ENV: "123",
        },
      }),
    });

    expect(startResp.status).toBe(200);
    const startData = await startResp.json();
    if (startData?.error) {
      throw new Error(`API error: ${startData.error}`);
    }

    expect(startData.type).toBe("async");
    expect(startData.job_id).toBeTruthy();
    expect(["running", "completed"]).toContain(startData.status);

    const pollResp = await fetch(`${host}/api/v2/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        async_get: startData.job_id,
        async_stats: true,
        async_await: true,
      }),
    });

    expect(pollResp.status).toBe(200);
    const pollData = await pollResp.json();
    if (pollData?.error) {
      throw new Error(`API error: ${pollData.error}`);
    }

    const stdout = String(pollData.stdout ?? "").trim();
    const stderr = String(pollData.stderr ?? "").trim();

    expect(pollData.type).toBe("async");
    expect(pollData.job_id).toBe(startData.job_id);
    expect(pollData.status).toBe("completed");
    expect(pollData.exit_code).toBe(0);
    expect(stderr).toBe("");
    const stdoutLines = stdout.split("\n");
    expect(stdoutLines[0]).toBe("123");
    expect(stdout).toContain("i=10");
  });
});
