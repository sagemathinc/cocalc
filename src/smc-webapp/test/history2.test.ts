import { parse_target } from "../history2";

describe("Testing inputs", () => {
  test("settings account", () => {
    const matched_paths = ["settings/", "settings/account", undefined];
    const account_settings_descriptor = { page: "account", tab: "account" };
    for (path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });
});
