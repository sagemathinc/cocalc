/* File context, for rendering files on the share server. */

//
//     const context = useFrameContext();
//
// inside of any component being used inside of a CoCalc frame,
// and you get the project_id, path, and id of that particular
// frame, and probably more as we need it.

import { createContext, useContext } from "react";

interface IFileContext {
  hrefTransform?: (url: string) => string | undefined;
}

export const FileContext = createContext<IFileContext>({});

export const useFileContext = () => {
  return useContext(FileContext);
};
