/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { shallow, render } from "enzyme";
import { Stderr } from "../stderr";
import { Ansi } from "../ansi";
import { fromJS } from "immutable";

describe("basic Stderr hello test", () => {
  const wrapper = shallow(<Stderr message={fromJS({ text: "Hello World" })} />);

  it("checks for the output", () => {
    expect(wrapper.contains(<span>Hello World</span>)).toBeTruthy();
  });

  it("changes the message and checks that correct new output appears", () => {
    wrapper.setProps({ message: fromJS({ text: "Hello CoCalc!" }) });
    expect(wrapper.contains(<span>Hello CoCalc!</span>)).toBeTruthy();
  });
});

describe("test ANSI rendering by Stderr", () => {
  const wrapper = shallow(
    <Stderr message={fromJS({ text: "\u001b[34mhello world" })} />
  );
  it("checks for the ANSI output", () => {
    expect(wrapper.contains(<Ansi>hello world</Ansi>));
  });
});

describe("Stderr style test", () => {
  const wrapper = render(<Stderr message={fromJS({ text: "Hello World" })} />);
  it("checks the style -- has a red background.", () => {
    expect(wrapper.attr("style")).toContain("background-color:#fdd");
  });
});
