// basically check, that all valid fields for PII values work and give a suitable date in the future

import {
  EXTRAS,
  pii_retention_parse,
} from "@cocalc/util/db-schema/site-settings-extras";

import { pii_retention_to_future } from "@cocalc/database/postgres/account/pii";

function getValid(): string[] {
  const vals = EXTRAS.pii_retention.valid;

  // make TS happy
  if (vals == null) return [];

  return vals as string[];
}

test.each(getValid())("pii(%s)", async (pii: string) => {
  const pii_val = pii_retention_parse(pii);
  const v = await pii_retention_to_future(pii_val);
  if (pii === "never") {
    expect(v).toBeUndefined();
  } else {
    expect(v).toBeInstanceOf(Date);
    const now = new Date();
    const diff = v!.getTime() - now.getTime();
    expect(diff).toBeGreaterThan(1000 * 60 * 60 * 24);
  }
});
