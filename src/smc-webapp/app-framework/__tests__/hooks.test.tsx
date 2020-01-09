import * as React from "react";
import { redux, Redux } from "../../app-framework";
import { create, act } from "react-test-renderer";

const PROJECT_ID = "369491f1-9b8a-431c-8cd0-150dd15f7b11";

// Initialize everything
redux.getProjectStore(PROJECT_ID);

const CurrentPath: React.FC = () => {
  const current_path = redux.useProjectStore(PROJECT_ID, store => {
    return store.get("current_path");
  });

  return <div>{current_path}</div>;
};

describe("useProjectStore selector", () => {
  let root;
  act(() => {
    root = create(
      <Redux>
        <CurrentPath />
      </Redux>
    );
  });

  expect(root.toJSON()).toMatchSnapshot();

  redux
    .getProjectActions(PROJECT_ID)
    .setState({ current_path: "Updated Path" });

  act(() => {
    root = root.update(
      <Redux>
        <CurrentPath />
      </Redux>
    );
  });

  expect(root.toJSON()).toMatchSnapshot();
});
