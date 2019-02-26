import * as React from "react";
import { shallow } from "enzyme";
import { TextInput } from "../text-input";

test("smoke test", () => {
  const starting_text = "initial";
  const mock_change = jest.fn();

  const rendered = shallow(
    <TextInput text={starting_text} on_change={mock_change} />
  );
  expect(rendered).toMatchSnapshot();
});
