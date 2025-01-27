import { sha1, sha1base64, uuidsha1 } from "./sha1";
import * as misc from "@cocalc/util/misc";

const cocalc = "CoCalc";
const hash = "c898c97dca68742a5a6331f9fa0ca02483cbfd25";
const uuid = "c898c97d-ca68-4742-a5a6-331f9fa0ca02";

describe("compute some sha1 hashes", () => {
  // This is mainly for long term backwards compatibility
  it("SageMathCloud/string", () => {
    expect(sha1("SageMathCloud")).toBe(
      "31acd8ca91346abcf6a49d2b1d88333f439d57a6",
    );
  });

  it("CoCalc/string", () => {
    expect(sha1(cocalc)).toBe(hash);
  });

  it("CoCalc/Buffer", () => {
    expect(sha1(Buffer.from(cocalc))).toBe(hash);
  });
});

describe("UUIDs", () => {
  it("CoCalc/string", () => {
    expect(uuidsha1(cocalc)).toBe(uuid);
  });

  it("CoCalc/Buffer", () => {
    expect(uuidsha1(Buffer.from(cocalc))).toBe(uuid);
  });
});

describe("compare this nodejs implementation to the pure javascript implementation", () => {
  it("CoCalc/string", () => {
    expect(sha1(cocalc)).toBe(misc.sha1(cocalc));
  });
  it("hash", () => {
    expect(sha1(hash)).toBe(misc.sha1(hash));
  });
  it("uuid", () => {
    expect(sha1(uuid)).toBe(misc.sha1(uuid));
  });
});

describe("base64: compare this nodejs implementation to the pure javascript implementation", () => {
  it("CoCalc/string", () => {
    expect(sha1base64(cocalc)).toBe(misc.sha1base64(cocalc));
  });
  it("hash", () => {
    expect(sha1base64(hash)).toBe(misc.sha1base64(hash));
  });
  it("uuid", () => {
    expect(sha1base64(uuid)).toBe(misc.sha1base64(uuid));
  });
});
