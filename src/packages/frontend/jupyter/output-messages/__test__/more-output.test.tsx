import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
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
    fetchMoreOutput: jest.fn(),
  };

  beforeEach(() => {
    actions.fetchMoreOutput.mockClear();
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

  it("calls fetchMoreOutput on click", async () => {
    render(
      <MoreOutput
        actions={actions as unknown as JupyterActions}
        message={fromJS({})}
        id="id"
      />,
    );
    await act(async () => {
      await fireEvent.click(screen.getByRole("button"));
    });
    expect(actions.fetchMoreOutput).toHaveBeenCalledTimes(1);
    expect(actions.fetchMoreOutput).toHaveBeenCalledWith("id");
  });
});
