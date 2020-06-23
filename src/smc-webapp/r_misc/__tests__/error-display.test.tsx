/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { shallow } from "enzyme";
import { ErrorDisplay } from "../error-display";

test("smoke test", () => {
  const rendered = shallow(
    <ErrorDisplay error={"Testing error"} onClose={() => undefined} />
  );
  expect(rendered).toMatchSnapshot();
});
