/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MIT (same as slate uses https://github.com/ianstormtaylor/slate/blob/master/License.md)
 */

// Adapted from https://github.com/ianstormtaylor/slate/blob/master/site/examples/mentions.tsx

export const insertMention = (editor, name) => {
  Transforms.insertText(editor, "@" + name);
};

export { useMentions } from "./hook";
