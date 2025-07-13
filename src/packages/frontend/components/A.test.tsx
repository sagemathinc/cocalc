import { render, screen } from "@testing-library/react";
import { A } from "./A";

test("A opens in a new tab at the right URL", () => {
  render(<A href="https://cocalc.com">CoCalc</A>);
  const link = screen.getByRole("link", { name: /cocalc/i });

  // @ts-ignore
  expect(link).toHaveAttribute("href", "https://cocalc.com");
  // @ts-ignore
  expect(link).toHaveAttribute("target", "_blank");
  // @ts-ignore
  expect(link).toHaveAttribute("rel", "noopener");
});