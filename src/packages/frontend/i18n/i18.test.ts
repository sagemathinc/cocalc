import { labels } from "./common";

describe("i18n", () => {
  test("comon", () => {
    for (const k in labels) {
      const v = labels[k];
      expect(v.id.startsWith("labels.")).toBe(true);
    }
  });
});
