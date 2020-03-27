import * as React from "react";
import { shallow } from "enzyme";
import { MoreOutput } from "../more-output";
import { fromJS } from "immutable";
import { JupyterActions } from "../../actions";

describe("test More Output button with no actions (so not enabled)", () => {
  const wrapper = shallow(<MoreOutput message={fromJS({})} id={""} />);

  it("checks the output", () => {
    expect(wrapper.find("Button").html()).toContain(
      "Additional output not available"
    );
  });

  it("clicks and nothing happens (no traceback/error)", () => {
    wrapper.find("Button").simulate("click");
  });
});

describe("test More Output button with actions", () => {
  const actions = {
    fetch_more_output: jest.fn(),
  };
  const wrapper = shallow(
    <MoreOutput
      actions={(actions as unknown) as JupyterActions}
      message={fromJS({})}
      id={"id"}
    />
  );

  it("checks the button text", () => {
    expect(wrapper.find("Button").html()).toContain("Fetch additional output");
  });

  it("clicks and sees that fetch_more_output is properly called", () => {
    wrapper.find("Button").simulate("click");
    expect(actions.fetch_more_output.mock.calls.length).toBe(1);
    expect(actions.fetch_more_output.mock.calls[0][0]).toBe("id");
  });
});
