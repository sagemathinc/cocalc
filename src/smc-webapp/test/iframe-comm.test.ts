import { block_origin } from "../iframe-communication";

describe("IFrame Communication", () => {
  const HOSTS = ["bar.com", ".baz.com"];

  test("allow base domain", () => {
    const mesg = { origin: "https://bar.com" };
    expect(block_origin(mesg, HOSTS)).toBe(false);
  });

  test("blocks wrong domain", () => {
    const mesg = { origin: "https://abc.com" };
    expect(block_origin(mesg, HOSTS)).toBe(true);
  });

  test("blocks sneaky domain", () => {
    const mesg = { origin: "https://foobar.com" };
    expect(block_origin(mesg, HOSTS)).toBe(true);
  });

  test("blocks spoofing the original domain", () => {
    const mesg = { origin: "https://bar.com.co" };
    expect(block_origin(mesg, HOSTS)).toBe(true);
  });

  test("allow base domain", () => {
    const mesg = { origin: "https://baz.com" };
    expect(block_origin(mesg, HOSTS)).toBe(false);
  });

  test("allow sub domain", () => {
    const mesg = { origin: "https://www.baz.com" };
    expect(block_origin(mesg, HOSTS)).toBe(false);
  });
});
