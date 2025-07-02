import { render } from "@testing-library/react";
import A from "./A";

test("A opens a new tab at the right url", () => {
  const { getByRole } = render(<A href="https://cocalc.com">CoCalc</A>);
  const link = getByRole("link", { name: "CoCalc" });

  // @ts-ignore
  expect(link).toHaveAttribute("target", "_blank");
  // @ts-ignore
  expect(link).toHaveAttribute("href", "https://cocalc.com");
  // @ts-ignore
  expect(link).toHaveAttribute("rel", "noopener");
  // @ts-ignore
  expect(link).toHaveTextContent("CoCalc");
});
