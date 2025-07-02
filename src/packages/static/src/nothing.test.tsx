import { render, screen } from "@testing-library/react";

test("trivial test to get the ball rolling", () => {
  render(<div>Hello</div>);
  // @ts-ignore
  expect(screen.getByText("Hello")).toBeInTheDocument();
});
