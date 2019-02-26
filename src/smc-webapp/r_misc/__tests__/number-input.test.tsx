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

test("input save on blur", () => {
  const starting_num = 12;
  const mock_change = jest.fn();
  const min = 10;
  const max = 20;

  const final_value = 15;

  const rendered = shallow(
    <NumberInput
      number={starting_num}
      min={min}
      max={max}
      on_change={mock_change}
    />
  );
  const form = rendered.find("FormControl").first();
  form.simulate("change", { target: { value: final_value } });
  form.simulate("blur");
  expect(mock_change.mock.calls.length).toBe(1);
  expect(mock_change.mock.calls[0][0]).toBe(final_value);
});
