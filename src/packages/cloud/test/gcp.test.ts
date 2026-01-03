import { GcpProvider } from "../gcp";
import type { HostSpec } from "../types";

const insertMock = jest.fn();
const getMock = jest.fn();
const startMock = jest.fn();
const stopMock = jest.fn();
const deleteMock = jest.fn();
const waitMock = jest.fn();

jest.mock("@google-cloud/compute", () => {
  class ImagesClient {
    get = getMock;
    getFromFamily = () => [{ selfLink: "/my/image" }];
    constructor(_opts?: any) {}
  }
  class InstancesClient {
    insert = insertMock;
    get = getMock;
    start = startMock;
    stop = stopMock;
    delete = deleteMock;
    constructor(_opts?: any) {}
  }
  class ZoneOperationsClient {
    wait = waitMock;
    constructor(_opts?: any) {}
  }
  return { InstancesClient, ZoneOperationsClient, ImagesClient };
});

function buildSpec(overrides: Partial<HostSpec> = {}): HostSpec {
  return {
    name: "ph-test",
    region: "us-west1",
    cpu: 4,
    ram_gb: 8,
    disk_gb: 100,
    disk_type: "balanced",
    ...overrides,
  };
}

describe("GcpProvider", () => {
  beforeEach(() => {
    insertMock.mockReset();
    getMock.mockReset();
    startMock.mockReset();
    stopMock.mockReset();
    deleteMock.mockReset();
    waitMock.mockReset();
  });

  it("creates a host with boot + data disks and startup script", async () => {
    insertMock.mockResolvedValueOnce([
      { latestResponse: { name: "op-1", status: "DONE" } },
    ]);
    waitMock.mockResolvedValueOnce([{ status: "DONE" }]);
    getMock.mockResolvedValueOnce([
      {
        networkInterfaces: [{ accessConfigs: [{ natIP: "203.0.113.10" }] }],
      },
    ]);

    const provider = new GcpProvider();
    const spec = buildSpec({
      metadata: {
        boot_disk_gb: 15,
        bootstrap_url: "https://example.com/bootstrap.sh",
      },
    });
    const runtime = await provider.createHost(spec, {
      project_id: "proj-1",
      client_email: "svc@example.com",
      private_key: "key",
    });

    const insertArgs = insertMock.mock.calls[0][0];
    const disks = insertArgs.instanceResource.disks;
    expect(disks).toHaveLength(2);
    expect(disks[0].boot).toBe(true);
    expect(disks[0].initializeParams.diskSizeGb).toBe("15");
    expect(disks[1].boot).toBe(false);
    expect(disks[1].initializeParams.diskSizeGb).toBe("100");
    expect(
      insertArgs.instanceResource.metadata.items.find(
        (item: any) => item.key === "startup-script",
      )?.value,
    ).toContain("bootstrap.sh");

    expect(runtime.public_ip).toBe("203.0.113.10");
    expect(runtime.instance_id).toBe("ph-test");
  });

  it("adds GPU accelerator when configured", async () => {
    insertMock.mockResolvedValueOnce([
      { latestResponse: { name: "op-2", status: "DONE" } },
    ]);
    waitMock.mockResolvedValueOnce([{ status: "DONE" }]);
    getMock.mockResolvedValueOnce([{ networkInterfaces: [] }]);

    const provider = new GcpProvider();
    const spec = buildSpec({
      gpu: { type: "nvidia-tesla-t4", count: 1 },
    });
    await provider.createHost(spec, {
      project_id: "proj-1",
      client_email: "svc@example.com",
      private_key: "key",
    });

    const insertArgs = insertMock.mock.calls[0][0];
    expect(insertArgs.instanceResource.guestAccelerators).toHaveLength(1);
    expect(
      insertArgs.instanceResource.guestAccelerators[0].acceleratorType,
    ).toContain("nvidia-tesla-t4");
  });

  it("starts, stops, and deletes a host", async () => {
    const provider = new GcpProvider();
    const runtime = {
      provider: "gcp" as const,
      instance_id: "ph-test",
      zone: "us-west1-b",
      ssh_user: "ubuntu",
    };
    const creds = {
      project_id: "proj-1",
      client_email: "svc@example.com",
      private_key: "key",
    };
    await provider.startHost(runtime, creds);
    await provider.stopHost(runtime, creds);
    await provider.deleteHost(runtime, creds);

    expect(startMock).toHaveBeenCalledWith({
      project: "proj-1",
      zone: "us-west1-b",
      instance: "ph-test",
    });
    expect(stopMock).toHaveBeenCalledWith({
      project: "proj-1",
      zone: "us-west1-b",
      instance: "ph-test",
    });
    expect(deleteMock).toHaveBeenCalledWith({
      project: "proj-1",
      zone: "us-west1-b",
      instance: "ph-test",
    });
  });

  it("respects custom zone and source image", async () => {
    insertMock.mockResolvedValueOnce([
      { latestResponse: { name: "op-3", status: "DONE" } },
    ]);
    waitMock.mockResolvedValueOnce([{ status: "DONE" }]);
    getMock.mockResolvedValueOnce([{ networkInterfaces: [] }]);

    const provider = new GcpProvider();
    const spec = buildSpec({
      region: "us-east1",
      zone: "us-east1-b",
      metadata: {
        source_image: "projects/custom/global/images/custom-image",
      },
    });
    await provider.createHost(spec, {
      project_id: "proj-1",
      client_email: "svc@example.com",
      private_key: "key",
    });

    const insertArgs = insertMock.mock.calls[0][0];
    expect(insertArgs.zone).toBe("us-east1-b");
    expect(
      insertArgs.instanceResource.disks[0].initializeParams.sourceImage,
    ).toBe("projects/custom/global/images/custom-image");
    expect(insertArgs.instanceResource.machineType).toContain("us-east1-b");
  });
});
