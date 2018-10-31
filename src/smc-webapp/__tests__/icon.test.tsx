import { Icon } from "../icon";
import * as React from "react";
import * as renderer from "react-test-renderer";

describe("Icon", () => {

  test("renders a money icon", () => {
    const tree = renderer
      .create(<Icon name="money"/>)
      .toJSON();

    expect(tree).toMatchSnapshot();
  });

  test("renders a spinning money icon", () => {
    const tree = renderer
      .create(<Icon spin name="money"/>)
      .toJSON();

    expect(tree).toMatchSnapshot();
  });
});