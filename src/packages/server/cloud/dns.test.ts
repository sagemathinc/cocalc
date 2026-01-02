let fetchMock: jest.Mock;

jest.mock("@cocalc/database/settings/server-settings", () => ({
  getServerSettings: jest.fn(async () => ({
    compute_servers_dns: "example.com",
    compute_servers_cloudflare_api_key: "token",
  })),
}));

const zoneResponse = {
  ok: true,
  json: async () => ({
    success: true,
    result: [{ name: "example.com", id: "zone-1" }],
  }),
};

function responseWith(result: any) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      result,
    }),
  };
}

describe("cloud dns", () => {
  beforeEach(() => {
    jest.resetModules();
    fetchMock = jest.fn(async (input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/zones?")) {
        return zoneResponse;
      }
      if (init?.method === "POST" && url.includes("/dns_records")) {
        return responseWith({ id: "record-1" });
      }
      if (init?.method === "PUT" && url.includes("/dns_records/record-xyz")) {
        return responseWith({ id: "record-xyz" });
      }
      if (init?.method === "DELETE") {
        return responseWith({ id: "record-1" });
      }
      return responseWith({});
    });
    (global as any).fetch = fetchMock;
  });

  it("creates a proxied A record for the host", async () => {
    const { ensureHostDns } = await import("./dns");
    const result = await ensureHostDns({
      host_id: "abc",
      ipAddress: "203.0.113.5",
    });
    expect(result.name).toBe("host-abc.example.com");
    expect(result.record_id).toBe("record-1");

    const addCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/dns_records") && init?.method === "POST",
    );
    const record = addCall?.[1]?.body ? JSON.parse(addCall[1].body) : undefined;
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
    const editCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/dns_records/record-xyz") &&
        init?.method === "PUT",
    );
    const payload = editCall?.[1]?.body
      ? JSON.parse(editCall[1].body)
      : undefined;
    expect(payload.content).toBe("203.0.113.6");
    expect(payload.proxied).toBe(true);
  });

  it("ignores deletion when record is not found", async () => {
    fetchMock.mockImplementation(async (input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/zones?")) {
        return zoneResponse;
      }
      if (init?.method === "DELETE" && url.includes("/dns_records/record-1")) {
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({}),
        };
      }
      return responseWith({});
    });
    const { deleteHostDns } = await import("./dns");
    await expect(deleteHostDns({ record_id: "record-1" })).resolves.toBe(
      undefined,
    );
  });
});
