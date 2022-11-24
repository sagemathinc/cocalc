import A from "./A";
import renderer from "react-test-renderer";

test("some basic properites of A are correct so will open a new tab at right url", () => {
  const component = renderer.create(<A href="https://cocalc.com">CoCalc</A>);
  let tree = component.toJSON();
  expect(tree.type).toBe("a");
  expect(tree.props.target).toBe("_blank");
  expect(tree.props.href).toBe("https://cocalc.com");
  expect(tree.props.rel).toBe("noopener");
  expect(tree.children).toEqual(["CoCalc"]);
});
