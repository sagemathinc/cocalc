import { Settings } from "../editor";
import * as React from "react";
import { shallow } from "enzyme";
import { Map } from "immutable";
import { ALL_AVAIL } from "../../../project_configuration";

test("renders a list of languages", () => {
  const actions: any = {};
  actions.set_settings = () => undefined;

  const settings = Map({ spell: "Value" });

  const available_features = ALL_AVAIL;

  const render = shallow(
    <Settings
      actions={actions}
      settings={settings}
      available_features={available_features}
      id="unused??"
    />
  );

  expect(render).toMatchSnapshot();
});
