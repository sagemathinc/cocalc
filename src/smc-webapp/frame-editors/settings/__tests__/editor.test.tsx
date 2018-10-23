import { Settings } from "../editor";
import * as React from "react";
import { shallow } from 'enzyme';
import { Map } from "immutable";

test("renders a list of languages", () => {
  const actions: any = {};
  actions.set_settings = () => undefined;

  const settings = Map({ spell: "Value" });

  const render = shallow(<Settings actions={actions} settings={settings} id="unused??" />);

  expect(render).toMatchSnapshot();
});
