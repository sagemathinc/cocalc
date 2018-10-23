import { SpellCheck } from "../spell-check";
import * as React from "react";
import * as renderer from "react-test-renderer";

test("renders correctly", () => {
  const tree = renderer
    .create(<SpellCheck value="Hello" set={() => "false"} />)
    .toJSON();
  expect(tree).toMatchSnapshot();
});
