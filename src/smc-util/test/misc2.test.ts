import { is_valid_email_address } from "../misc2";

describe("is_valid_email_address is", () => {
  it("true for test@test.com", () => {
    expect(is_valid_email_address("test@test.com")).toBe(true);
  });

  it("false for test@test.r", () => {
    expect(is_valid_email_address("test@test.r")).toBe(false);
  });

  it("false for blabla", () => {
    expect(is_valid_email_address("blabla")).toBe(false);
  });
});
