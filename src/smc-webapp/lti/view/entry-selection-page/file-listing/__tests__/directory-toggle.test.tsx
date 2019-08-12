import * as React from "react";
import { shallow } from "enzyme";
import { DirectoryToggle } from "../directory-toggle";

describe("Render regressions", () => {
  test("is closed", () => {
    const rendered = shallow(<DirectoryToggle is_open={false} on_click={_ => {}} />);

    expect(rendered).toMatchSnapshot("Right pointing triangle");
  });

  test("is opened", () => {
    const rendered = shallow(<DirectoryToggle is_open={true} on_click={_ => {}} />);

    expect(rendered).toMatchSnapshot("Down pointing triangle");
  });
});

describe("Interactions", () => {
  test("Click", () => {
    const mock_on_click = jest.fn();
    const evt = new MouseEvent("click");
    const opened = true;
    const rendered = shallow(<DirectoryToggle is_open={opened} on_click={mock_on_click} />);

    rendered.simulate("click", evt);
    expect(mock_on_click.mock.calls.length).toBe(1);
    expect(mock_on_click.mock.calls[0][0]).toBe(opened);
  });
});
