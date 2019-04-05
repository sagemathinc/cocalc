import * as React from "react";
import { shallow } from "enzyme";
import { Stdout } from "../stdout";
import { Ansi } from "../ansi";
import { fromJS } from "immutable";

describe("basic Stdout hello test", () => {
  const wrapper = shallow(<Stdout message={fromJS({ text: "Hello World" })} />);

  it("checks for the output", () => {
    expect(wrapper.contains(<span>Hello World</span>)).toBeTruthy();
  });

  it("changes the message and checks that correct new output appears", () => {
    wrapper.setProps({ message: fromJS({ text: "Hello CoCalc!" }) });
    expect(wrapper.contains(<span>Hello CoCalc!</span>)).toBeTruthy();
  });
});

describe("test ANSI rendering by Stdout", () => {
  const wrapper = shallow(
    <Stdout message={fromJS({ text: "\u001b[34mhello world" })} />
  );
  it("checks for the ANSI output", () => {
    expect(wrapper.contains(<Ansi>hello world</Ansi>));
  });
});
