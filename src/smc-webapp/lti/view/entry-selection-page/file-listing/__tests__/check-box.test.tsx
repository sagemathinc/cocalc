import * as React from "react";
import { shallow } from "enzyme";
import { CheckBox, Mark } from "../check-box";

describe("Render regressions", () => {
  test("Mark.check", () => {
    const rendered = shallow(<CheckBox fill={Mark.check} on_click={_ => {}} />);

    expect(rendered).toMatchSnapshot("Box is a check mark");
  });

  test("Mark.slash", () => {
    const rendered = shallow(<CheckBox fill={Mark.slash} on_click={_ => {}} />);

    expect(rendered).toMatchSnapshot("Box is a slash");
  });

  test("Mark.empty", () => {
    const rendered = shallow(<CheckBox fill={Mark.empty} on_click={_ => {}} />);

    expect(rendered).toMatchSnapshot("Box is empty");
  });
});

describe("Interactions", () => {
  test("Click", () => {
    const mock_on_click = jest.fn();
    const evt = new MouseEvent("click");
    const fill = Mark.check;
    const rendered = shallow(<CheckBox fill={fill} on_click={mock_on_click} />);

    rendered.simulate("click", evt);
    expect(mock_on_click.mock.calls.length).toBe(1);
    expect(mock_on_click.mock.calls[0][0]).toBe(fill);
  });
});
