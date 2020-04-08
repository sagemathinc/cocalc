import * as React from "react";
import { shallow } from "enzyme";
import { NumberInput } from "../number-input";

describe("smoke testing", () => {
  test("renders with required values", () => {
    const mock_change = jest.fn();
    const starting_num = 0;
    const min = 10;
    const max = 20;
    const updated_number = 12;

    const rendered = shallow(
      <NumberInput
        number={starting_num}
        min={min}
        max={max}
        on_change={mock_change}
      />
    );
    expect(rendered).toMatchSnapshot();

    rendered.setProps({
      number: updated_number,
    });

    expect(rendered).toMatchSnapshot();
  });

  test("renders with a unit", () => {
    const mock_change = jest.fn();
    const starting_num = 0;
    const min = 10;
    const max = 20;
    const unit = "lbs";

    const rendered = shallow(
      <NumberInput
        number={starting_num}
        min={min}
        max={max}
        on_change={mock_change}
        unit={unit}
      />
    );
    expect(rendered).toMatchSnapshot();
  });

  test("renders disabled", () => {
    const mock_change = jest.fn();
    const starting_num = 0;
    const min = 10;
    const max = 20;
    const disabled = true;

    const rendered = shallow(
      <NumberInput
        number={starting_num}
        min={min}
        max={max}
        on_change={mock_change}
        disabled={disabled}
      />
    );
    expect(rendered).toMatchSnapshot();
  });
});

describe("input behavior", () => {
  test("should call on_change when blurred", () => {
    const mock_change = jest.fn();
    const starting_num = 12;
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

  test("should cap at max", () => {
    const mock_change = jest.fn();
    const starting_num = 12;
    const min = 10;
    const max = 20;
    const over_max = 25;
    const final_value = max;

    const rendered = shallow(
      <NumberInput
        number={starting_num}
        min={min}
        max={max}
        on_change={mock_change}
      />
    );
    const form = rendered.find("FormControl").first();
    form.simulate("change", { target: { value: over_max } });
    form.simulate("blur");
    expect(mock_change.mock.calls.length).toBe(1);
    expect(mock_change.mock.calls[0][0]).toBe(final_value);

    // When passed as prop
    rendered.setProps({ number: over_max });
    form.simulate("blur");
    expect(mock_change.mock.calls.length).toBe(2);
    expect(mock_change.mock.calls[1][0]).toBe(final_value);
  });

  test("should floor at min", () => {
    const mock_change = jest.fn();
    const starting_num = 12;
    const min = 10;
    const max = 20;
    const under_min = 5;
    const final_value = min;

    const rendered = shallow(
      <NumberInput
        number={starting_num}
        min={min}
        max={max}
        on_change={mock_change}
      />
    );
    const form = rendered.find("FormControl").first();
    form.simulate("change", { target: { value: under_min } });
    form.simulate("blur");
    expect(mock_change.mock.calls.length).toBe(1);
    expect(mock_change.mock.calls[0][0]).toBe(final_value);

    // When passed as prop
    rendered.setProps({ number: under_min });
    form.simulate("blur");
    expect(mock_change.mock.calls.length).toBe(2);
    expect(mock_change.mock.calls[1][0]).toBe(final_value);
  });
});
