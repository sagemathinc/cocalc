import * as React from "react";
import { shallow } from "enzyme";
import { TextInput } from "../text-input";

test("smoke test", () => {
  const mock_change = jest.fn();
  const starting_text = "initial";
  const changed_text = "changed!";
  const updated_text = "changed from props";

  const rendered = shallow(
    <TextInput text={starting_text} on_change={mock_change} />
  );
  expect(rendered).toMatchSnapshot("initial render");

  const text_input = rendered.find("FormControl").first();
  text_input.simulate("change", { target: { value: changed_text } });
  expect(rendered).toMatchSnapshot(
    "save button appears after text changes from initial render"
  );

  const send_button = rendered.find("Button").first();
  send_button.simulate("click", new MouseEvent("click"));
  expect(mock_change.mock.calls.length).toBe(1);
  expect(mock_change.mock.calls[0][0]).toBe(changed_text);

  rendered.setProps({ text: updated_text });
  expect(rendered).toMatchSnapshot("value updated from props");
});
