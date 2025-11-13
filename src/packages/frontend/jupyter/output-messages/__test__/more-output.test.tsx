import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MoreOutput } from "../more-output";
import { fromJS } from "immutable";
import { JupyterActions } from "@cocalc/jupyter/redux/actions";

describe("test More Output button with no actions (so not enabled)", () => {
  it("shows 'Additional output not available'", () => {
    render(<MoreOutput message={fromJS({})} id={""} />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "Additional output not available",
    );
  });

  it("clicks the disabled button; nothing happens", () => {
    render(<MoreOutput message={fromJS({})} id={""} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    // No error expected, nothing to assert
  });
});

describe("test More Output button with actions", () => {
  const actions = {
    fetch_more_output: jest.fn(),
  };

  beforeEach(() => {
    actions.fetch_more_output.mockClear();
  });

  it("shows 'Fetch additional output'", () => {
    render(
      <MoreOutput
        actions={actions as unknown as JupyterActions}
        message={fromJS({})}
        id="id"
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent(
      "Fetch additional output",
    );
  });

  it("calls fetch_more_output on click", () => {
    render(
      <MoreOutput
        actions={actions as unknown as JupyterActions}
        message={fromJS({})}
        id="id"
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(actions.fetch_more_output).toHaveBeenCalledTimes(1);
    expect(actions.fetch_more_output).toHaveBeenCalledWith("id");
  });
});

