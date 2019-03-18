import * as React from "react";
import { shallow } from "enzyme";
import { TextPlain } from "../text-plain";

describe("basic hello world", () => {
  const wrapper = shallow(<TextPlain value="Hello World" />);

  it("checks the output", () => {
    expect(wrapper.find("span").text()).toBe("Hello World");
  });

  it("changes the value and checks new output", () => {
    wrapper.setProps({ value: "xyz" });
    expect(wrapper.find("span").text()).toBe("xyz");
  });
});
