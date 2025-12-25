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
    expect(catalog.machine_types_by_zone["us-east1-b"][0].name).toBe(
      "n2-standard-8",
    );
    expect(catalog.gpu_types_by_zone["us-east1-b"][0].name).toBe(
      "nvidia-tesla-t4",
    );
  });
});
