import * as React from "react";
import { shallow } from "enzyme";
import { CloseX } from "../close-x";

describe("smoke test close-x", () => {
  test("it renders", () => {
    function nothing() {
      return undefined;
    }
    const rendered = shallow(<CloseX on_close={nothing} />);
    expect(rendered).toMatchSnapshot();
  });

  test("it calls close on click", () => {
    const close_mock = jest.fn();

    const rendered = shallow(<CloseX on_close={close_mock} />);
    rendered.simulate("click");
    expect(close_mock.mock.calls.length).toBe(1);
  });

  test("it accepts custom styling for the Icon", () => {
    const close_mock = jest.fn();
    const custom_style: React.CSSProperties = {
      marginTop: "3px",
      marginBottom: "12px"
    };
    const rendered = shallow(
      <CloseX on_close={close_mock} style={custom_style} />
    );
    expect(rendered.children().prop("style")).toBe(custom_style);

    // Not sure if this assertion is any good. Splitting hairs.
    // This one isn't too brittle anyhow.
    expect(rendered.children()).toMatchSnapshot();
  });
});
