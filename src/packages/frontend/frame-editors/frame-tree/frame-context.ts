/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Frame context, so you can type
//
//     const context = useFrameContext();
//
// inside of any component being used inside of a CoCalc frame,
// and you get the project_id, path, and id of that particular
// frame, and probably more as we need it.

import { Map } from "immutable";
import { createContext, useContext } from "react";
import { useRedux } from "@cocalc/frontend/app-framework/redux-hooks";
import { DEFAULT_FONT_SIZE } from "@cocalc/util/db-schema/defaults";
import { Actions } from "../code-editor/actions";

export interface IFrameContext<T = Actions> {
  id: string;
  project_id: string;
  path: string;
  actions: T;
  desc: Map<string, any>; // frame tree description for this particular frame, e.g., things like scroll, font size, etc.
  isFocused: boolean; // true if this is the focused frame, i.e., active_id == id.
  isVisible: boolean; // true if the entire editor tab that contains this frame is visible.
  font_size: number;
  redux?;
}

export const defaultFrameContext = {
  id: "",
  project_id: "",
  path: "",
  actions: {} as unknown as Actions, // why is there a default context... we always set it?
  desc: Map<string, any>(),
  isFocused: false,
  isVisible: false,
  font_size: DEFAULT_FONT_SIZE,
} as const;

export const FrameContext = createContext<IFrameContext>(defaultFrameContext);

export function useFrameContext<T = Actions>(): IFrameContext<T> {
  return useContext(FrameContext) as IFrameContext<T>;
}

export function useFrameRedux(pathInStore: string[]) {
  const { project_id, path } = useFrameContext();
  return useRedux(pathInStore, project_id, path);
}
