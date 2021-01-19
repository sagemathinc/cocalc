/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Register all the types.

// The order of registering these does NOT matter and has no
// impact on semantics or speed.

// IMPORTANT: You must import the entire module **and** separately import
// the type; otherwise the code in the module to register it is not run.

import { Checkbox } from "./checkbox";
import "./checkbox";

import { Emoji } from "./emoji";
import "./emoji";

import { HR } from "./hr";
import "./hr";

import { Paragraph } from "./paragraph";
import "./paragraph";

import { CodeBlock } from "./code_block";
import "./code_block";

import { Hardbreak, Softbreak } from "./linebreak";
import "./linebreak";

import { Math } from "./math";
import "./math";

import { Heading } from "./heading";
import "./heading";

import { HtmlBlock, HtmlInline } from "./html";
import "./html";

import { Table, THead, TBody, TR, TD, TH } from "./table";
import "./table";

import { BlockQuote } from "./blockquote";
import "./blockquote";

import { Link } from "./link";
import "./link";

import { ListItem } from "./list-item";
import "./list-item";

import { BulletList, OrderedList } from "./list";
import "./list";

import { Generic } from "./generic";
import "./generic";

import { Marks } from "../markdown-to-slate/handle-marks";

declare module "slate" {
  export interface CustomTypes {
    Element:
      | Checkbox
      | Emoji
      | HR
      | Paragraph
      | CodeBlock
      | Hardbreak
      | Softbreak
      | Math
      | Heading
      | HtmlBlock
      | HtmlInline
      | Table
      | THead
      | TBody
      | TR
      | TD
      | TH
      | BlockQuote
      | Link
      | ListItem
      | BulletList
      | OrderedList
      | Generic;
    Text: Marks;
  }
}

import { Element } from "slate";

export function isElementOfType(x, type: string | string[]): boolean {
  return (
    Element.isElement(x) &&
    ((typeof type == "string" && x["type"] == type) ||
      (typeof type != "string" && type.indexOf(x["type"]) != -1))
  );
}
