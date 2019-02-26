import * as React from "react";
import { shallow } from "enzyme";
import { NumberInput } from "../number-input";

test("smoke test", () => {
  const starting_num = 0;
  const mock_change = jest.fn();
  const min = 10;
  const max = 20;

  const rendered = shallow(
    <NumberInput
      number={starting_num}
      min={min}
      max={max}
      on_change={mock_change}
    />
  );
  expect(rendered).toMatchSnapshot();
});
