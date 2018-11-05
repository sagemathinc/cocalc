import * as React from "react";
import { shallow } from "enzyme";
import { Saving } from "../saving";

test("smoke test", () => {
  const rendered = shallow(<Saving />);
  expect(rendered).toMatchSnapshot();
});
