let queryMock: jest.Mock;
let readFileMock: jest.Mock;
let writeFileMock: jest.Mock;

jest.mock("@cocalc/database/pool", () => ({
  __esModule: true,
  default: jest.fn(() => ({ query: queryMock })),
}));

jest.mock("@cocalc/backend/data", () => ({
  secrets: "/tmp/secrets",
}));

jest.mock("fs/promises", () => ({
  readFile: (...args: any[]) => readFileMock(...args),
  writeFile: (...args: any[]) => writeFileMock(...args),
}));

const HOST_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";

describe("project-backup", () => {
  beforeEach(() => {
    jest.resetModules();
    queryMock = jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes("FROM project_hosts")) {
        return { rows: [{ region: "us-west1" }] };
      }
      if (sql.includes("FROM server_settings")) {
        const key = params?.[0];
        return { rows: [{ value: settings[key] ?? null }] };
      }
      if (sql.includes("FROM project_backup_secrets")) {
        return { rows: [{ secret: settings.project_secret ?? "plain-secret" }] };
      }
      if (sql.startsWith("UPDATE project_backup_secrets")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO project_backup_secrets")) {
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    readFileMock = jest.fn(async () => masterKeyBase64);
    writeFileMock = jest.fn(async () => undefined);
  });

  const masterKeyBase64 = Buffer.alloc(32, 7).toString("base64");
  let settings: Record<string, string | undefined> = {};

  it("returns empty config when R2 settings are missing", async () => {
    settings = {};
    const { getBackupConfig } = await import("./index");
    const result = await getBackupConfig({ host_id: HOST_ID });
    expect(result.toml).toBe("");
    expect(result.ttl_seconds).toBe(0);
  });

  it("builds per-project config when settings exist", async () => {
    settings = {
      r2_account_id: "account",
      r2_access_key_id: "access",
      r2_secret_access_key: "secret",
      r2_bucket_prefix: "cocalc-backups",
      project_secret: "project-secret",
    };
    const { getBackupConfig } = await import("./index");
    const result = await getBackupConfig({
      host_id: HOST_ID,
      project_id: PROJECT_ID,
    });
    expect(result.toml).toContain("repository = \"opendal:s3\"");
    expect(result.toml).toContain("password = \"project-secret\"");
    expect(result.toml).toContain("bucket = \"cocalc-backups-us-west1\"");
    expect(result.toml).toContain(`root = \"rustic/project-${PROJECT_ID}\"`);
    expect(result.ttl_seconds).toBeGreaterThan(0);
  });
});
