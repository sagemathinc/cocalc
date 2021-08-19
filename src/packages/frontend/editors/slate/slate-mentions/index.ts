/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MIT (same as slate uses https://github.com/ianstormtaylor/slate/blob/master/License.md)
 */

// Adapted from https://github.com/ianstormtaylor/slate/blob/master/site/examples/mentions.tsx

import { Transforms } from "slate";

// A super naive version for testing.
export const insertMention = (editor, value) => {
  Transforms.insertText(editor, "@" + value);
};

export { useMentions } from "./hook";
