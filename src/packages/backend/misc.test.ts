import { is_valid_username } from "./misc";

describe("checking that a user's first or last name is valid", () => {
  it("works for usual valid names", () => {
    expect(is_valid_username("harald")).toBe(undefined);
    expect(is_valid_username("ABC FOO-BAR")).toBe(undefined);
    // DNS-like substrings easily trigger a violation. these are fine, though
    // this was relaxed in commit cafbf9c900f917
    expect(is_valid_username("is.test.ok")).not.toBe(undefined);
    return expect(is_valid_username("is.a.test")).not.toBe(undefined);
  });

  it("blocks suspicious names", () => {
    expect(is_valid_username("OPEN http://foo.com")).not.toBe(undefined);
    expect(is_valid_username("https://earn-money.cc is good")).not.toBe(
      undefined
    );
    return expect(is_valid_username("OPEN mailto:bla@bar.de")).not.toBe(
      undefined
    );
  });

  it("is not fooled to easily", () => {
    expect(is_valid_username("OPEN hTTp://foo.com")).not.toBe(undefined);
    expect(is_valid_username("httpS://earn-money.cc is good")).not.toBe(
      undefined
    );
    expect(is_valid_username("OPEN MAILTO:bla@bar.de")).not.toBe(undefined);
    expect(is_valid_username("test.account.dot")).toContain("test.account.dot");
    expect(is_valid_username("no spam EARN-A-LOT-OF.money Now")).toContain(
      ".money"
    );
    return expect(is_valid_username("spam abc.co earn")).toContain(".co");
  });
});

import { getUid } from "./misc";
describe("get the UNIX uid associated to a project_id (used on cocalc-docker)", () => {
  it("throws an error when input is not a valid uuid", () => {
    expect(() => {
      getUid("foobar");
    }).toThrow();
  });

  it("returns a valid number on a valid uuid", () => {
    const uid = getUid("812abe34-a382-4bd1-9071-29b6f4334f03");
    expect(uid).toBeGreaterThan(65537);
    expect(uid).toBeLessThan(2 ** 29);
  });
});
