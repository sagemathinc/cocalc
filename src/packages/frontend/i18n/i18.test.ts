import { labels } from "./common";
import { menu } from "./menus";

describe("i18n", () => {
  test("comon", () => {
    for (const k in labels) {
      const v = labels[k];
      expect(v.id.startsWith("labels.")).toBe(true);
    }
  });

  test("menus", () => {
    for (const k in menu) {
      const v = menu[k];
      expect(v.id.startsWith("menu.")).toBe(true);
    }
  });
});
