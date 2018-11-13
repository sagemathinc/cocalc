import * as React from "react";
import { shallow } from "enzyme";
import { SelectorInput } from "../selector-input";

describe("Smoke test:", () => {
  test("it renders a list of strings", () => {
    const names = ["Susan", "Harry", "Steve"];
    let tree = shallow(<SelectorInput options={names} />);
    expect(tree).toMatchSnapshot();
  });

  test("it renders a list of {value, display} objects as children of <option></option>", () => {
    const display_objects = [
      { value: "value_1", display: <div>Susan</div> },
      { value: "value_2", display: <div>Harry</div> }
    ];
    let tree = shallow(<SelectorInput options={display_objects} />)
      .children()
      .children();
    expect(tree).toMatchSnapshot();
  });

  test("it renders an object with keys mapped to react components ", () => {
    const options_map = {
      value_1: <div>Susan</div>,
      value_2: <div>Harry</div>
    };
    let tree = shallow(<SelectorInput options={options_map} />)
      .children()
      .children();
    expect(tree).toMatchSnapshot();
  });
});

describe("Interactions:", () => {
  test("it calls on_change with the clicked option's value (this test uses Simulate)", () => {
    const names = ["Susan", "Harry", "Steve"];
    const selection_mock = jest.fn();

    let tree = shallow(
      <SelectorInput options={names} on_change={selection_mock} />
    );
    tree.children().simulate("change", { target: { value: "Susan" }});
    expect(selection_mock.mock.calls[0][0]).toBe("Susan");
  });
});
