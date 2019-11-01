import * as React from "react";
import { shallow } from "enzyme";
import { Javascript } from "../javascript";

describe("test a single string of javascript", () => {
  const wrapper = shallow(<Javascript value={"window.value=2+3"} />);

  it("checks the html (a div)", () => {
    expect(wrapper.html()).toBe("<div></div>");
  });

  it("checks the javascript eval side effect", () => {
    expect((window as any).value).toBe(5);
  });
});
