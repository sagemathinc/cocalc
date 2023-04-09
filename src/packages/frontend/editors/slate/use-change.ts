/*
A hook that can be used so that each mounted and rendered component updates
itself in some way on every change to the document.  Obviously this is potentially
very inefficient, so should be used with care or for debugging/prototyping work only.
*/

import type { SlateEditor } from "./types";
import { createContext, useContext } from "react";

export const ChangeContext = createContext<{
  change: number;
  editor: SlateEditor | null;
  setEditor?: (editor: null | any) => void;
}>({ change: 0, editor: null });
export const useChange = () => useContext(ChangeContext);
