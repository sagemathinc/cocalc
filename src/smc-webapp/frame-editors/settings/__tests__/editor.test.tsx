import { Settings } from "../editor";
import * as React from "react";
import * as renderer from "react-test-renderer";
import { Map } from "immutable";

test("renders a list of languages", () => {
  const actions: any = {};
  actions.set_settings = () => undefined;

  const settings = Map({ spell: "Value" });

  const tree = renderer
    .create(<Settings actions={actions} settings={settings} id="unused??" />)
    .toJSON();

  expect(tree).toMatchSnapshot();
});
