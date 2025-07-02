import { render } from "@testing-library/react";
import A from "./A";

test("A opens a new tab at the right url", () => {
  const { getByRole } = render(<A href="https://cocalc.com">CoCalc</A>);
  const link = getByRole("link", { name: "CoCalc" });

  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("href", "https://cocalc.com");
  expect(link).toHaveAttribute("rel", "noopener");
  expect(link).toHaveTextContent("CoCalc");
});