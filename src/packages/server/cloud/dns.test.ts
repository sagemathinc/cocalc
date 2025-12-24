let browseMock: jest.Mock;
let addMock: jest.Mock;
let editMock: jest.Mock;
let delMock: jest.Mock;

jest.mock("@cocalc/database/settings/server-settings", () => ({
  getServerSettings: jest.fn(async () => ({
    compute_servers_dns: "example.com",
    compute_servers_cloudflare_api_key: "token",
  })),
}));

jest.mock("cloudflare", () => {
  browseMock = jest.fn(async () => ({
    result: [{ name: "example.com", id: "zone-1" }],
  }));
  addMock = jest.fn(async () => ({
    result: { id: "record-1" },
  }));
  editMock = jest.fn(async () => ({}));
  delMock = jest.fn(async () => ({}));

  return class CloudFlare {
    zones = { browse: browseMock };
    dnsRecords = {
      add: addMock,
      edit: editMock,
      del: delMock,
      browse: jest.fn(),
    };
    constructor(_opts?: any) {}
  };
});

describe("cloud dns", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("creates a proxied A record for the host", async () => {
    const { ensureHostDns } = await import("./dns");
    const result = await ensureHostDns({
      host_id: "abc",
      ipAddress: "203.0.113.5",
    });
    expect(result.name).toBe("host-abc.example.com");
    expect(result.record_id).toBe("record-1");

    const record = addMock.mock.calls[0][1];
    expect(record.type).toBe("A");
    expect(record.content).toBe("203.0.113.5");
    expect(record.name).toBe("host-abc.example.com");
    expect(record.proxied).toBe(true);
  });

  it("updates an existing record when record_id is provided", async () => {
    const { ensureHostDns } = await import("./dns");
    await ensureHostDns({
      host_id: "abc",
      ipAddress: "203.0.113.6",
      record_id: "record-xyz",
    });
    const [zoneId, recordId, payload] = editMock.mock.calls[0];
    expect(zoneId).toBe("zone-1");
    expect(recordId).toBe("record-xyz");
    expect(payload.content).toBe("203.0.113.6");
    expect(payload.proxied).toBe(true);
  });

  it("ignores deletion when record is not found", async () => {
    delMock.mockImplementationOnce(async () => {
      const err: any = new Error("Not Found");
      throw err;
    });
    const { deleteHostDns } = await import("./dns");
    await expect(deleteHostDns({ record_id: "record-1" })).resolves.toBe(
      undefined,
    );
  });
});
