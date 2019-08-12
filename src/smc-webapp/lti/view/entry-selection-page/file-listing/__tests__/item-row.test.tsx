import * as React from "react";
import { shallow } from "enzyme";
import { ItemRow } from "../item-row";

describe("Render regressions", () => {
  test("highlight == true", () => {
    const rendered = shallow(<ItemRow highlight={true} />);

    expect(rendered).toMatchSnapshot("highlight color is SeaGreen");
  });

  test("highlight == false", () => {
    const rendered = shallow(<ItemRow highlight={false} />);

    expect(rendered).toMatchSnapshot("highlight color is not SeaGreen");
  });
});
