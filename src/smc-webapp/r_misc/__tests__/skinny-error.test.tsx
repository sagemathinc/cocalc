/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { shallow } from "enzyme";
import { SkinnyError } from "../skinny-error";

test("smoke test", () => {
  const rendered = shallow(
    <SkinnyError on_close={() => undefined} error_text={"Error testing text"} />
  );
  expect(rendered).toMatchSnapshot();
});

test("test interaction", () => {
  const mock_on_close = jest.fn();
  const rendered = shallow(
    <SkinnyError on_close={mock_on_close} error_text={"Error testing text"} />
  );

  const evt = new MouseEvent("click");

  rendered.children().first().simulate("click", evt);
  expect(mock_on_close.mock.calls.length).toBe(1);
});
