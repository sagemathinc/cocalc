/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { toPairs } from "lodash";

import { SOFTWARE_ENV_NAMES } from "@cocalc/util/consts/software-envs";
import { SOFTWARE_FALLBACK, SOFTWARE_URLS } from "./software-data";
import { EnvData } from "./types";

test("3 known software environments", () => {
  expect(SOFTWARE_ENV_NAMES.length).toBe(3);
});

describe("Download URLs", () => {
  it.each(toPairs(SOFTWARE_URLS))("check %s", async (name, url) => {
    // TODO: jest can't use fetch? well, we just check the URLs
    expect(url.startsWith("https://")).toBe(true);
    expect(url.endsWith(`/software-inventory-${name}.json`)).toBe(true);
    // const response = await fetch(url);
    // expect(response.status).toBe(200);
    // const spec = await response.json();
    // checkSoftwareSpec(spec as any);
  });

  it.each(toPairs(SOFTWARE_FALLBACK))(
    "check fallback %s",
    (_, fallbackSpec) => {
      checkSoftwareSpec(fallbackSpec);
    }
  );
});

function checkSoftwareSpec(spec: EnvData) {
  // check that data has the expected structure
  expect(spec.timestamp).toBeTruthy();
  const inventory = spec.inventory;
  expect(inventory).toBeTruthy();
  expect(inventory.julia).toBeTruthy();
  expect(inventory.language_exes).toBeTruthy();
  expect(inventory.octave).toBeTruthy();
  expect(inventory.python).toBeTruthy();
  expect(inventory.R).toBeTruthy();
  const data = spec.data;
  expect(data).toBeTruthy();
  expect(data.executables).toBeTruthy();
  expect(data.julia).toBeTruthy();
  expect(data.octave).toBeTruthy();
  expect(data.python).toBeTruthy();
  expect(data.R).toBeTruthy();
}
