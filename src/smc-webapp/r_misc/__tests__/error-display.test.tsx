import * as React from "react";
import { shallow } from "enzyme";
import { ErrorDisplay } from "../error-display";

test("smoke test", () => {
  const rendered = shallow(
    <ErrorDisplay error={"Testing error"} onClose={() => undefined} />
  );
  expect(rendered).toMatchSnapshot();
});
