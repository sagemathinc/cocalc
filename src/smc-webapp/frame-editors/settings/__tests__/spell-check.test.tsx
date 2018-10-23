import { SpellCheck } from "../spell-check";
import * as React from "react";
import * as renderer from "react-test-renderer";
import { shallow } from "enzyme";
import { MenuItem } from "react-bootstrap";

test("renders a list of languages", () => {
  const tree = renderer
    .create(<SpellCheck value="Hello" set={() => undefined} />)
    .toJSON();
  expect(tree).toMatchSnapshot();
});

test("calls set with the right lang on click", () => {
  const mock = jest.fn();
  const Selector = shallow(<SpellCheck value="Hello" set={mock} />);
  Selector.find(MenuItem)
    .first()
    .simulate("select");
  expect(mock).toHaveBeenCalled();
});
