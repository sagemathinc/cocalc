/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { define, required } from "./define";
import { expectType } from "tsd";

test("Defaulted value should be defined", () => {
  interface Input {
    foo: number;
    bar: string;
    baz?: string;
    biz?: string;
  }
  interface Defaults {
    baz: string;
  }
  const A = define<Input, Defaults>({ foo: 0, bar: "" }, {
    foo: required,
    bar: required,
    baz: "defaulted",
  });

  expectType<string>(A.baz);
});
