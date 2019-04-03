import * as React from "react";
import { shallow, render } from "enzyme";
import { Ansi } from "../ansi";

describe("basic hello world", () => {
  const wrapper = shallow(<Ansi>Hello World</Ansi>);

  it("checks the output", () => {
    expect(wrapper.find("span").text()).toBe("Hello World");
  });
});

describe("render something with actual ANSI codes", () => {
  const wrapper = shallow(<Ansi>{"\u001b[34mhello world"}</Ansi>);

  it("checks for the ANSI output", () => {
    expect(wrapper.contains(<Ansi>hello world</Ansi>));
  });
});

describe("check that rendered text is a span of blue", () => {
  const wrapper = render(<Ansi>{"\u001b[34mhello world"}</Ansi>);
  expect(wrapper.html()).toEqual(
    '<span style="color:rgb(0, 0, 187)">hello world</span>'
  );
});
