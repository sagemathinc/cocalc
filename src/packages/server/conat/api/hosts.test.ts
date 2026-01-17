export {};

let queryMock: jest.Mock;
let isAdminMock: jest.Mock;

jest.mock("@cocalc/database/pool", () => ({
  __esModule: true,
  default: jest.fn(() => ({ query: queryMock })),
}));

jest.mock("@cocalc/server/accounts/is-admin", () => ({
  __esModule: true,
  default: (...args: any[]) => isAdminMock(...args),
}));

const HOST_ID = "host-123";
const ACCOUNT_ID = "acct-123";

const SUMMARY_ROW = {
  host_id: HOST_ID,
  total: "3",
  provisioned: "2",
  running: "1",
  provisioned_up_to_date: "1",
  provisioned_needs_backup: "1",
};

const PROJECT_ROWS_PAGE_1 = [
  {
    project_id: "proj-3",
    title: "Gamma",
    state: "running",
    provisioned: true,
    last_edited: new Date("2026-01-03T00:00:00Z"),
    last_backup: new Date("2026-01-02T00:00:00Z"),
    needs_backup: true,
    collab_count: "2",
  },
  {
    project_id: "proj-2",
    title: "Beta",
    state: "off",
    provisioned: true,
    last_edited: new Date("2026-01-02T00:00:00Z"),
    last_backup: new Date("2026-01-01T00:00:00Z"),
    needs_backup: true,
    collab_count: "1",
  },
  {
    project_id: "proj-1",
    title: "Alpha",
    state: "off",
    provisioned: false,
    last_edited: new Date("2026-01-01T00:00:00Z"),
    last_backup: null,
    needs_backup: false,
    collab_count: "3",
  },
];

const PROJECT_ROWS_PAGE_2 = [
  {
    project_id: "proj-0",
    title: "Delta",
    state: "off",
    provisioned: true,
    last_edited: new Date("2026-01-01T00:00:00Z"),
    last_backup: new Date("2026-01-01T00:00:00Z"),
    needs_backup: false,
    collab_count: "0",
  },
];

describe("hosts.listHostProjects", () => {
  beforeEach(() => {
    jest.resetModules();
    isAdminMock = jest.fn(async () => true);
    queryMock = jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes("FROM project_hosts")) {
        return {
          rows: [
            {
              id: HOST_ID,
              metadata: { owner: ACCOUNT_ID },
              last_seen: new Date("2026-01-05T00:00:00Z"),
            },
          ],
        };
      }
      if (sql.includes("COUNT(*) AS total")) {
        return { rows: [SUMMARY_ROW] };
      }
      if (sql.includes("LEFT(COALESCE(title")) {
        if (params.length === 2) {
          return { rows: PROJECT_ROWS_PAGE_1 };
        }
        if (params.length === 4) {
          return { rows: PROJECT_ROWS_PAGE_2 };
        }
      }
      throw new Error(`unexpected query: ${sql}`);
    });
  });

  it("paginates with cursor", async () => {
    const { listHostProjects } = await import("./hosts");
    const first = await listHostProjects({
      account_id: ACCOUNT_ID,
      id: HOST_ID,
      limit: 2,
    });
    expect(first.rows).toHaveLength(2);
    expect(first.next_cursor).toBeDefined();
    const second = await listHostProjects({
      account_id: ACCOUNT_ID,
      id: HOST_ID,
      limit: 2,
      cursor: first.next_cursor,
    });
    expect(second.rows).toHaveLength(1);
    expect(second.next_cursor).toBeUndefined();
  });

  it("adds the risk filter when requested", async () => {
    const listSqls: string[] = [];
    queryMock.mockImplementation(async (sql: string, _params: any[]) => {
      if (sql.includes("FROM project_hosts")) {
        return {
          rows: [
            {
              id: HOST_ID,
              metadata: { owner: ACCOUNT_ID },
            },
          ],
        };
      }
      if (sql.includes("COUNT(*) AS total")) {
        return { rows: [SUMMARY_ROW] };
      }
      if (sql.includes("LEFT(COALESCE(title")) {
        listSqls.push(sql);
        return { rows: PROJECT_ROWS_PAGE_1.slice(0, 1) };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const { listHostProjects } = await import("./hosts");
    await listHostProjects({
      account_id: ACCOUNT_ID,
      id: HOST_ID,
      limit: 1,
      risk_only: false,
    });
    await listHostProjects({
      account_id: ACCOUNT_ID,
      id: HOST_ID,
      limit: 1,
      risk_only: true,
    });
    const [baseSql, riskSql] = listSqls;
    expect(baseSql).toBeDefined();
    expect(riskSql).toBeDefined();
    const baseCount = (baseSql.match(/last_backup IS NULL/g) || []).length;
    const riskCount = (riskSql.match(/last_backup IS NULL/g) || []).length;
    expect(riskCount).toBeGreaterThan(baseCount);
  });
});
