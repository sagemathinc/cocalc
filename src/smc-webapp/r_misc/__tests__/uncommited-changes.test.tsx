import * as React from "react";
import { act } from 'react-dom/test-utils';
import { render, mount } from "enzyme";
import { UncommittedChanges } from "../uncommited-changes";

jest.useFakeTimers();

test("Works without props", () => {
  const wrapper = render(<UncommittedChanges />);
  expect(wrapper.text()).toBe("");
  expect(wrapper).toMatchSnapshot("Should have no warning");
});

test("Doesn't show error before 5000ms", () => {
  const wrapper = mount(<UncommittedChanges has_uncommitted_changes={true} />);
  act(() => {
    jest.advanceTimersByTime(4000);
  });
  expect(wrapper.text()).toBe("");
  wrapper.update();
  expect(wrapper).toMatchSnapshot("Should have no warning");
})

test("Setting it to true and letting it sit", () => {
  const wrapper = mount(<UncommittedChanges has_uncommitted_changes={true} />);
  act(() => {
    jest.advanceTimersByTime(6000);
  });
  expect(wrapper.text()).toBe("NOT saved!");
  wrapper.update()
  expect(wrapper).toMatchSnapshot("Should now have a warning");
});

test("Setting it to true but switching it back early", () => {
  const wrapper = mount(<UncommittedChanges has_uncommitted_changes={true} />);
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  wrapper.update();
  wrapper.setProps({has_uncommitted_changes: false});
  act(() => {
    jest.advanceTimersByTime(6000);
  });

  expect(wrapper.text()).toBe("");
  wrapper.update();
  expect(wrapper).toMatchSnapshot("Should still have no warning");
});