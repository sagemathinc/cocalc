import * as React from "react";
import { shallow } from "enzyme";
import { SimpleX } from "../simple-x";

test("smoke test", () => {
  const rendered = shallow(<SimpleX onClick={() => undefined} />);
  expect(rendered).toMatchSnapshot();
});

test("test interaction", () => {
  const mock_on_click = jest.fn();
  const rendered = shallow(<SimpleX onClick={mock_on_click} />);

  const evt = new MouseEvent("click");

  rendered.simulate("click", evt);
  expect(mock_on_click.mock.calls.length).toBe(1);
});
