let queryMock: jest.Mock;
let readFileMock: jest.Mock;
let writeFileMock: jest.Mock;
let createBucketMock: jest.Mock;

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

jest.mock("./r2", () => ({
  createBucket: (...args: any[]) => createBucketMock(...args),
}));

const HOST_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const BUCKET_ID = "33333333-3333-3333-3333-333333333333";

describe("project-backup", () => {
  beforeEach(() => {
    jest.resetModules();
    createBucketMock = jest.fn(async () => ({
      name: "cocalc-backups-wnam",
      location: "wnam",
    }));
    queryMock = jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes("SELECT backup_bucket_id FROM projects")) {
        return {
          rows: [{ backup_bucket_id: settings.backup_bucket_id ?? null }],
        };
      }
      if (sql.includes("FROM project_hosts")) {
        return { rows: [{ region: "us-west1" }] };
      }
      if (sql.includes("SELECT host_id FROM projects")) {
        return { rows: [{ host_id: settings.project_host_id ?? HOST_ID }] };
      }
      if (sql.includes("SELECT region FROM projects")) {
        return { rows: [{ region: settings.project_region ?? "wnam" }] };
      }
      if (sql.includes("FROM project_moves")) {
        return { rows: [] };
      }
      if (sql.includes("FROM server_settings")) {
        const key = params?.[0];
        return { rows: [{ value: settings[key] ?? null }] };
      }
      if (sql.includes("FROM project_backup_secrets")) {
        return {
          rows: [{ secret: settings.project_secret ?? "plain-secret" }],
        };
      }
      if (sql.startsWith("UPDATE project_backup_secrets")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO project_backup_secrets")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO buckets")) {
        return { rows: [] };
      }
      if (sql.includes("FROM buckets WHERE provider")) {
        return { rows: [] };
      }
      if (sql.includes("FROM buckets WHERE id")) {
        return {
          rows: [
            {
              id: BUCKET_ID,
              name: "cocalc-backups-wnam",
              provider: "r2",
              purpose: "project-backups",
              region: "wnam",
              location: "wnam",
              account_id: settings.r2_account_id ?? "account",
              access_key_id: settings.r2_access_key_id ?? "access",
              secret_access_key: settings.r2_secret_access_key ?? "secret",
              endpoint: "https://account.r2.cloudflarestorage.com",
              status: "active",
            },
          ],
        };
      }
      if (sql.includes("FROM buckets WHERE name")) {
        return {
          rows: [
            {
              id: BUCKET_ID,
              name: params?.[0] ?? "cocalc-backups-wnam",
              provider: "r2",
              purpose: "project-backups",
              region: "wnam",
              location: "wnam",
              account_id: settings.r2_account_id ?? "account",
              access_key_id: settings.r2_access_key_id ?? "access",
              secret_access_key: settings.r2_secret_access_key ?? "secret",
              endpoint: "https://account.r2.cloudflarestorage.com",
              status: "active",
            },
          ],
        };
      }
      if (sql.startsWith("UPDATE projects")) {
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    readFileMock = jest.fn(async () => masterKeyBase64);
    writeFileMock = jest.fn(async () => undefined);
  });

  const masterKeyBase64 = Buffer.alloc(32, 7).toString("base64");
  let settings: Record<string, string | undefined> = {};

  it("builds per-project config when settings exist", async () => {
    settings = {
      r2_account_id: "account",
      r2_api_token: "token",
      r2_access_key_id: "access",
      r2_secret_access_key: "secret",
      r2_bucket_prefix: "cocalc-backups",
      project_secret: "project-secret",
      project_region: "wnam",
    };
    const { getBackupConfig } = await import("./index");
    const result = await getBackupConfig({
      host_id: HOST_ID,
      project_id: PROJECT_ID,
    });
    expect(result.toml).toContain('repository = "opendal:s3"');
    expect(result.toml).toContain('password = "project-secret"');
    expect(result.toml).toContain('bucket = "cocalc-backups-wnam"');
    expect(result.toml).toContain(`root = \"rustic/project-${PROJECT_ID}\"`);
    expect(result.ttl_seconds).toBeGreaterThan(0);
  });

  it("records last_backup using the provided time", async () => {
    settings = {
      project_host_id: HOST_ID,
      project_region: "wnam",
    };
    const { recordProjectBackup } = await import("./index");
    const when = new Date("2026-01-01T00:00:00Z");
    await recordProjectBackup({
      host_id: HOST_ID,
      project_id: PROJECT_ID,
      time: when.toISOString(),
    });
    const updateCall = queryMock.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE projects SET last_backup"),
    );
    expect(updateCall).toBeDefined();
    const params = updateCall?.[1] as [string, Date];
    expect(params?.[1]?.toISOString()).toBe(when.toISOString());
  });
});
