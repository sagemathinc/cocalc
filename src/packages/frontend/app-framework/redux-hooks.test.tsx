/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cocalc/src/packages/frontend/app-framework/redux-hooks.test.tsx

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { List, Map } from "immutable";
import { useEffect } from "react";

import type { AccountState } from "@cocalc/frontend/account/types";
import {
  project_redux_name,
  redux,
  redux_name,
} from "@cocalc/frontend/app-framework";
import { useEditorRedux, useRedux, useTypedRedux } from "./redux-hooks";

// Avoid opening real socket connections during unit tests. Some imports in
// app-framework pull in webapp-client, which otherwise starts a client.
jest.mock("@cocalc/frontend/webapp-client", () => ({
  WebappClient: function WebappClient() {},
  webapp_client: {
    sync_client: {
      synctable_no_changefeed: jest.fn(() => ({
        on: jest.fn(),
        close: jest.fn(),
        set: jest.fn(),
        save: jest.fn(),
      })),
      sync_table: jest.fn(() => ({
        on: jest.fn(),
        close: jest.fn(),
        set: jest.fn(),
        save: jest.fn(),
      })),
    },
  },
}));

type EditorState = {
  tasks: number;
  pages: number;
};

const PROJECT_ID = "00000000-0000-4000-8000-000000000000";
const NOTEBOOK_PATH = "notebooks/example.ipynb";

let storeSeq = 0;
const cleanupStores: string[] = [];

function createStoreName(prefix: string) {
  storeSeq += 1;
  return `${prefix}-${storeSeq}`;
}

function trackStore(name: string) {
  cleanupStores.push(name);
  return name;
}

afterEach(() => {
  cleanup();
  for (const name of cleanupStores.splice(0)) {
    redux.removeStore(name);
  }
});

describe("redux-hooks", () => {
  it("useRedux only re-renders when the selected field changes (named store)", async () => {
    const storeName = trackStore(createStoreName("redux-hooks-test"));
    const store = redux.createStore<{ foo: number; bar: number }>(storeName);
    store.setState({ foo: 1, bar: 1 });
    const onRender = jest.fn();

    function Foo() {
      const foo = useRedux([storeName, "foo"]);
      useEffect(() => {
        onRender(foo);
      });
      return <div>{foo}</div>;
    }

    render(<Foo />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));

    // Update an unrelated field; useRedux should not trigger a re-render.
    act(() => {
      store.setState({ bar: 2 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // Update the watched field; useRedux should re-render once.
    act(() => {
      store.setState({ foo: 2 });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
  });

  it("useRedux does not re-render when setting the same primitive value", async () => {
    const storeName = trackStore(createStoreName("redux-hooks-test"));
    const store = redux.createStore<{ foo: number; bar: number }>(storeName);
    store.setState({ foo: 1, bar: 1 });
    const onRender = jest.fn();

    function Foo() {
      const foo = useRedux([storeName, "foo"]);
      useEffect(() => {
        onRender(foo);
      });
      return <div>{foo}</div>;
    }

    render(<Foo />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));

    // Setting the same primitive value should not cause a re-render.
    act(() => {
      store.setState({ foo: 1 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("useRedux re-renders for immutable values when the reference changes", async () => {
    const storeName = trackStore(createStoreName("redux-hooks-test"));
    const store = redux.createStore<{ items: List<number>; other: number }>(
      storeName,
    );
    store.setState({ items: List([1, 2]), other: 1 });
    const onRender = jest.fn();

    function Items() {
      const items = useRedux([storeName, "items"]);
      useEffect(() => {
        onRender(items);
      });
      return <div>{items?.size ?? 0}</div>;
    }

    render(<Items />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));

    // Update unrelated field; should not re-render.
    act(() => {
      store.setState({ other: 2 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // New List reference (even with same contents) should re-render.
    act(() => {
      store.setState({ items: List([1, 2]) });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
  });

  it("useRedux preserves function-valued fields without invoking them", async () => {
    const storeName = trackStore(createStoreName("redux-hooks-test"));
    const fn = jest.fn(() => 7);
    const store = redux.createStore<{
      fn: () => number;
      other: number;
    }>(storeName);
    store.setState({ fn, other: 1 });
    const onRender = jest.fn();

    function FunctionField() {
      const selected = useRedux([storeName, "fn"]);
      useEffect(() => {
        onRender(selected);
      });
      return <div>{typeof selected}</div>;
    }

    render(<FunctionField />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));
    const selectedFn = onRender.mock.calls.at(-1)?.[0];
    expect(typeof selectedFn).toBe("function");
    expect(selectedFn()).toBe(7);

    // Updating unrelated data should not re-render.
    act(() => {
      store.setState({ other: 2 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // Updating to a new function reference should re-render.
    const fn2 = jest.fn(() => 9);
    act(() => {
      store.setState({ fn: fn2 });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
    const selectedFn2 = onRender.mock.calls.at(-1)?.[0];
    expect(selectedFn2).toBe(fn2);
    expect(selectedFn2()).toBe(9);
  });

  it("useRedux supports the project-store code path", async () => {
    const storeName = trackStore(project_redux_name(PROJECT_ID));
    const store = redux.createStore<{ status: string; other: number }>(
      storeName,
    );
    store.setState({ status: "ready", other: 1 });
    const onRender = jest.fn();

    function ProjectStatus() {
      const status = useRedux(["status"], PROJECT_ID);
      useEffect(() => {
        onRender(status);
      });
      return <div>{status}</div>;
    }

    render(<ProjectStatus />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));
    expect(onRender).toHaveBeenLastCalledWith("ready");

    act(() => {
      store.setState({ other: 2 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({ status: "running" });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
    expect(onRender).toHaveBeenLastCalledWith("running");
  });

  it("useRedux with an empty store name returns undefined", async () => {
    const onRender = jest.fn();

    function UnknownStore() {
      const value = useRedux(["", "whatever"]);
      useEffect(() => {
        onRender(value);
      });
      return <div>{value ?? "none"}</div>;
    }

    render(<UnknownStore />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));
    expect(onRender).toHaveBeenLastCalledWith(undefined);
  });

  it("useRedux removes change listeners on unmount", async () => {
    const storeName = trackStore(createStoreName("redux-hooks-test"));
    const store = redux.createStore<{ foo: number }>(storeName);
    store.setState({ foo: 1 });

    function Foo() {
      const foo = useRedux([storeName, "foo"]);
      return <div>{foo}</div>;
    }

    const { unmount } = render(<Foo />);
    await waitFor(() => expect(store.listeners("change").length).toBe(1));

    unmount();
    expect(store.listeners("change").length).toBe(0);
  });

  it("useEditorRedux tracks fields per-render and avoids unrelated updates", async () => {
    const storeName = trackStore(redux_name(PROJECT_ID, NOTEBOOK_PATH));
    const store = redux.createStore<EditorState>(storeName);
    store.setState({ tasks: 1, pages: 1 });
    const onRender = jest.fn();

    function EditorTasks() {
      const useEditor = useEditorRedux<EditorState>({
        project_id: PROJECT_ID,
        path: NOTEBOOK_PATH,
      });
      const tasks = useEditor("tasks");
      useEffect(() => {
        onRender(tasks);
      });
      return <div>{tasks}</div>;
    }

    render(<EditorTasks />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));

    // Setting the tracked field to the same primitive value should not re-render.
    act(() => {
      store.setState({ tasks: 1 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // Update an unrelated field; useEditorRedux should not re-render.
    act(() => {
      store.setState({ pages: 2 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // Update the tracked field; useEditorRedux should re-render once.
    act(() => {
      store.setState({ tasks: 2 });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
  });

  it("useEditorRedux updates tracked fields when selected field changes across renders", async () => {
    const storeName = trackStore(redux_name(PROJECT_ID, NOTEBOOK_PATH));
    const store = redux.createStore<EditorState>(storeName);
    store.setState({ tasks: 1, pages: 10 });
    const onRender = jest.fn();

    function DynamicField({ usePages }: { usePages: boolean }) {
      const useEditor = useEditorRedux<EditorState>({
        project_id: PROJECT_ID,
        path: NOTEBOOK_PATH,
      });
      const value = useEditor(usePages ? "pages" : "tasks");
      useEffect(() => {
        onRender(value);
      });
      return <div>{value}</div>;
    }

    const rendered = render(<DynamicField usePages={false} />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));
    expect(onRender).toHaveBeenLastCalledWith(1);

    act(() => {
      store.setState({ pages: 11 });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    rendered.rerender(<DynamicField usePages />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
    expect(onRender).toHaveBeenLastCalledWith(11);

    act(() => {
      store.setState({ tasks: 2 });
    });
    expect(onRender).toHaveBeenCalledTimes(2);
    expect(onRender).toHaveBeenLastCalledWith(11); // selects pages

    act(() => {
      store.setState({ pages: 12 });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(3));
    expect(onRender).toHaveBeenLastCalledWith(12);

    act(() => {
      store.setState({ tasks: 3 });
    });
    expect(onRender).toHaveBeenCalledTimes(3); // not called again
    expect(onRender).toHaveBeenLastCalledWith(12); // still selects pages
  });

  it("useEditorRedux re-renders for immutable values when the reference changes", async () => {
    const storeName = trackStore(redux_name(PROJECT_ID, NOTEBOOK_PATH));
    const store = redux.createStore<{
      tasks: List<number>;
      pages: List<number>;
    }>(storeName);
    store.setState({ tasks: List([1]), pages: List([1, 2]) });
    const onRender = jest.fn();

    function EditorTasks() {
      const useEditor = useEditorRedux<{ tasks: List<number> }>({
        project_id: PROJECT_ID,
        path: NOTEBOOK_PATH,
      });
      const tasks = useEditor("tasks");
      useEffect(() => {
        onRender(tasks);
      });
      return <div>{tasks?.size ?? 0}</div>;
    }

    render(<EditorTasks />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));

    // Update unrelated field; should not re-render.
    act(() => {
      store.setState({ pages: List([3]) });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // New List reference (even with same contents) should re-render.
    act(() => {
      store.setState({ tasks: List([1]) });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
  });

  it("useEditorRedux handles editor store being created after initial render", async () => {
    const missingEditorPath = "notebooks/missing-editor-useeditor.ipynb";
    redux.removeStore(redux_name(PROJECT_ID, missingEditorPath));
    expect(redux.getEditorStore(PROJECT_ID, missingEditorPath)).toBeUndefined();
    const onRender = jest.fn();

    function WaitingForEditorStore() {
      const useEditor = useEditorRedux<{ tasks: number }>({
        project_id: PROJECT_ID,
        path: missingEditorPath,
      });
      const tasks = useEditor("tasks");
      useEffect(() => {
        onRender(tasks);
      });
      return <div>{tasks ?? "none"}</div>;
    }

    render(<WaitingForEditorStore />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));
    expect(onRender).toHaveBeenLastCalledWith(undefined);

    const storeName = trackStore(redux_name(PROJECT_ID, missingEditorPath));
    const store = redux.createStore<{ tasks: number }>(storeName);
    act(() => {
      store.setState({ tasks: 7 });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
    expect(onRender).toHaveBeenLastCalledWith(7);
  });

  it("useRedux handles editor store being created after initial render", async () => {
    const missingEditorPath = "notebooks/missing-editor.ipynb";
    redux.removeStore(redux_name(PROJECT_ID, missingEditorPath));
    expect(redux.getEditorStore(PROJECT_ID, missingEditorPath)).toBeUndefined();
    const onRender = jest.fn();

    function WaitingForEditorStore() {
      const tasks = useRedux(["tasks"], PROJECT_ID, missingEditorPath);
      useEffect(() => {
        onRender(tasks);
      });
      return <div>{tasks ?? "none"}</div>;
    }

    render(<WaitingForEditorStore />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));
    expect(onRender).toHaveBeenLastCalledWith(undefined);

    const storeName = trackStore(redux_name(PROJECT_ID, missingEditorPath));
    const store = redux.createStore<{ tasks: number }>(storeName);
    act(() => {
      store.setState({ tasks: 7 });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
    expect(onRender).toHaveBeenLastCalledWith(7);
  });

  it("useTypedRedux preserves types and only re-renders when the field changes", async () => {
    const storeName = "account";
    redux.removeStore(storeName);
    trackStore(storeName);
    const store = redux.createStore<AccountState>(storeName);
    store.setState({
      editor_settings: { theme: "light" },
      other_settings: { dark_mode: false },
    });
    const onRender = jest.fn();

    function AccountSettings() {
      const editorSettings = useTypedRedux("account", "editor_settings");
      const typedSettings: AccountState["editor_settings"] = editorSettings;
      const theme = typedSettings.get("theme");
      useEffect(() => {
        onRender(theme);
      });
      return <div>{theme}</div>;
    }

    render(<AccountSettings />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));

    // Update an unrelated field; useTypedRedux should not re-render.
    act(() => {
      store.setState({ other_settings: { dark_mode: true } });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // Update the typed field; useTypedRedux should re-render once.
    act(() => {
      store.setState({ editor_settings: { theme: "dark" } });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
  });

  it("useTypedRedux re-renders for immutable values when the reference changes", async () => {
    const storeName = "account";
    redux.removeStore(storeName);
    trackStore(storeName);
    const store = redux.createStore<AccountState>(storeName);
    store.setState({
      editor_settings: Map({ theme: "light" }),
      other_settings: Map({ dark_mode: false }),
    });
    const onRender = jest.fn();

    function AccountSettings() {
      const editorSettings = useTypedRedux("account", "editor_settings");
      const typedSettings: AccountState["editor_settings"] = editorSettings;
      const theme = typedSettings.get("theme");
      useEffect(() => {
        onRender(theme);
      });
      return <div>{theme}</div>;
    }

    render(<AccountSettings />);
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));

    // Update unrelated field; should not re-render.
    act(() => {
      store.setState({ other_settings: Map({ dark_mode: true }) });
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    // Update the typed field to a new immutable value; should re-render.
    act(() => {
      store.setState({ editor_settings: Map({ theme: "dark" }) });
    });
    await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
  });
});
