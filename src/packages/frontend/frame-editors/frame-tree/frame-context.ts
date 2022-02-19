/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Frame context, so you can type
//
//     const context = useFrameContext();
//
// inside of any component being used inside of a CoCalc frame,
// and you get the project_id, path, and id of that particular
// frame, and probably more as we need it.

import { createContext, useContext } from "react";
import { Actions } from "../code-editor/actions";
import { Map } from "immutable";
import { useRedux } from "@cocalc/frontend/app-framework/redux-hooks";

export interface IFrameContext {
  id: string;
  project_id: string;
  path: string;
  actions: Actions;
  desc: Map<string, any>; // frame tree description for this particular frame, e.g., things like scroll, font size, etc.
  isFocused: boolean; // true if this is the focused frame, i.e., active_id == id.
}

export const defaultFrameContext = {
  id: "",
  project_id: "",
  path: "",
  actions: {} as unknown as Actions, // why is there a default context... we always set it?
  desc: Map<string, any>(),
  isFocused: false,
} as const;

export const FrameContext = createContext<IFrameContext>(defaultFrameContext);

export const useFrameContext: () => IFrameContext = () => {
  return useContext(FrameContext);
};

export function useFrameRedux(pathInStore: string[]) {
  const { project_id, path } = useFrameContext();
  return useRedux(pathInStore, project_id, path);
}
