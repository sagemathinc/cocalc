import { normalizeGcpCatalog } from "../catalog/gcp";

describe("GCP catalog normalization", () => {
  it("normalizes self-links to short names", () => {
    const catalog = normalizeGcpCatalog({
      regions: [
        {
          name: "us-east1",
          status: "UP",
          zones: [
            "https://www.googleapis.com/compute/v1/projects/demo/zones/us-east1-b",
            "https://www.googleapis.com/compute/v1/projects/demo/zones/us-east1-c",
          ],
        },
      ],
      zones: [
        {
          name: "us-east1-b",
          status: "UP",
          region:
            "https://www.googleapis.com/compute/v1/projects/demo/regions/us-east1",
          location: "South Carolina (USA)",
          lowC02: true,
        },
      ],
      images: [
        {
          project: "ubuntu-os-cloud",
          name: "ubuntu-2404-lts-v20240101",
          family: "ubuntu-2404-lts",
          selfLink: "https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2404-lts-v20240101",
          status: "READY",
          creationTimestamp: "2024-01-01T00:00:00.000-00:00",
          gpuReady: false,
          architecture: "X86_64",
        },
        {
          project: "ubuntu-os-cloud",
          name: "ubuntu-2004-lts-v20200101",
          family: "ubuntu-2004-lts",
          selfLink: "https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2004-lts-v20200101",
          status: "READY",
          creationTimestamp: "2020-01-01T00:00:00.000-00:00",
          gpuReady: false,
          architecture: "X86_64",
        },
        {
          project: "ubuntu-os-accelerator-images",
          name: "ubuntu-accelerator-2404-amd64-with-nvidia-580-v20251217",
          family: "ubuntu-accelerator-2404-amd64-with-nvidia-580",
          selfLink: "https://www.googleapis.com/compute/v1/projects/ubuntu-os-accelerator-images/global/images/ubuntu-accelerator-2404-amd64-with-nvidia-580-v20251217",
          status: "READY",
          creationTimestamp: "2025-12-17T00:00:00.000-00:00",
          gpuReady: true,
          architecture: "X86_64",
        },
      ],
      machine_types_by_zone: {
        "us-east1-b": [{ name: "n2-standard-8", guestCpus: 8, memoryMb: 32768 }],
      },
      gpu_types_by_zone: {
        "us-east1-b": [{ name: "nvidia-tesla-t4", maximumCardsPerInstance: 4 }],
      },
    });

    expect(catalog.regions[0].zones).toEqual(["us-east1-b", "us-east1-c"]);
    expect(catalog.zones[0].region).toBe("us-east1");
    expect(catalog.zones[0].location).toBe("South Carolina (USA)");
    expect(catalog.zones[0].lowC02).toBe(true);
    const families = (catalog.images ?? []).map((img) => img.family);
    expect(families).toContain("ubuntu-2404-lts");
    expect(families).toContain("ubuntu-accelerator-2404-amd64-with-nvidia-580");
    expect(families).not.toContain("ubuntu-2004-lts");
    expect(catalog.machine_types_by_zone["us-east1-b"][0].name).toBe(
      "n2-standard-8",
    );
    expect(catalog.gpu_types_by_zone["us-east1-b"][0].name).toBe(
      "nvidia-tesla-t4",
    );
  });
});
