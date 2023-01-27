import { sha1, uuidsha1 } from "./sha1";
import { validate } from "uuid";

describe("compute some sha1 hashes", () => {
  it("computes sha1 hash of old SageMathCloud", () => {
    expect(sha1("SageMathCloud")).toBe(
      "31acd8ca91346abcf6a49d2b1d88333f439d57a6"
    );
  });

  it("computes sha1 hash of new CoCalc", () => {
    expect(sha1("CoCalc")).toBe("c898c97dca68742a5a6331f9fa0ca02483cbfd25");
  });
});

describe("compute some uuids", () => {
  it("computes uuid associated to 'CoCalc'", () => {
    expect(uuidsha1("CoCalc")).toBe("c898c97d-ca68-4742-a5a6-331f9fa0ca02");
  });

  it("validate uuid associated to SageMathCloud", () => {
    expect(validate(uuidsha1("SageMathCloud"))).toBe(true);
  });
});
