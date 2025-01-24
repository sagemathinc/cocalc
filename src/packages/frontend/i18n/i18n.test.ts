import { course, editor, jupyter, labels, menu } from "./common";
import type { IntlMessage } from "./index";

export type Data = { [key in string]: IntlMessage };

describe("i18n", () => {
  const tests: { data: Data; prefix: string }[] = [
    // forced typing necessary, because of the "unique_id_is_missing" exception – this is harmless
    { data: labels as any as Data, prefix: "labels." },
    { data: menu, prefix: "menu." },
    { data: editor, prefix: "editor." },
    { data: jupyter.editor, prefix: "jupyter.editor." },
    { data: jupyter.commands, prefix: "jupyter.commands." },
    { data: course, prefix: "course." },
  ] as const;

  tests.forEach(({ data, prefix }) => {
    expect(prefix.endsWith(".")).toBe(true);
    test(`${prefix} should have correct id prefix`, () => {
      for (const k in data) {
        if (k === "unique_id_is_missing") continue;
        const v = data[k];
        expect(v.id.startsWith(prefix)).toBe(true);
      }
    });
  });
});
