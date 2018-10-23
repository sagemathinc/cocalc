import { SpellCheck } from "../spell-check";
import * as React from "react";
import * as renderer from "react-test-renderer";

test("renders a list of languages", () => {
  const tree = renderer
    .create(<SpellCheck value="Hello" set={() => undefined} />)
    .toJSON();
  expect(tree).toMatchSnapshot();
});
