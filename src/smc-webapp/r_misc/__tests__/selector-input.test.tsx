import * as React from "react";
import { shallow } from "enzyme";
import { SelectorInput } from "../selector-input";

describe("Smoke test:", () => {
  test("it renders a list of strings", () => {
    const names = ["Susan", "Harry", "Steve"];
    const tree = shallow(<SelectorInput options={names} />);
    expect(tree).toMatchSnapshot();
  });

  test("it renders a list of {value, display} objects", () => {
    const display_objects = [
      { value: "value_1", display: <div>Susan</div> },
      { value: "value_2", display: <div>Harry</div> }
    ];
    const tree = shallow(<SelectorInput options={display_objects} />)
      .children()
      .children();
    expect(tree).toMatchSnapshot();
  });

  test("it renders an object with keys mapped to react components ", () => {
    const options_map = {
      value_1: <div>Susan</div>,
      value_2: <div>Harry</div>
    };
    const tree = shallow(<SelectorInput options={options_map} />)
      .children()
      .children();
    expect(tree).toMatchSnapshot();
  });
});

describe("Interactions:", () => {
  // Not the most robust testing, but propagation isn't well supported.
  // Might as well be explicit
  test("it calls on_change using e.target.value", () => {
    const names = ["Susan", "Harry", "Steve"];
    const selection_mock = jest.fn();

    const tree = shallow(
      <SelectorInput options={names} on_change={selection_mock} />
    );
    tree.children().simulate("change", { target: { value: "Susan" } });
    expect(selection_mock.mock.calls[0][0]).toBe("Susan");
  });
});
