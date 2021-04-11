/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Register all the types.

// The order of registering these does NOT matter and has no
// impact on semantics or speed.

// IMPORTANT: You must import the entire module **and** separately import
// the type; otherwise the code in the module to register it is not run.

import { Meta } from "./meta";
import "./meta";

import { Checkbox } from "./checkbox";
import "./checkbox";

import { Emoji } from "./emoji";
import "./emoji";

import { Hashtag } from "./hashtag";
import "./hashtag";

import { HR } from "./hr";
import "./hr";

import { Paragraph } from "./paragraph";
import "./paragraph";

import { CodeBlock } from "./code_block";
import "./code_block";

import { Hardbreak, Softbreak } from "./linebreak";
import "./linebreak";

import { DisplayMath, InlineMath } from "./math";
import "./math";

import { Heading } from "./heading";
import "./heading";

import { HtmlBlock, HtmlInline } from "./html";
import "./html";

import { Mention } from "./mention";
import "./mention";

import { Table, THead, TBody, TR, TD, TH } from "./table";
import "./table";

import { BlockQuote } from "./blockquote";
import "./blockquote";

import { Link } from "./link";
import "./link";

import { Image } from "./image";
import "./image";

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
      | Meta
      | Checkbox
      | Emoji
      | Hashtag
      | HR
      | Paragraph
      | CodeBlock
      | Hardbreak
      | Softbreak
      | DisplayMath
      | InlineMath
      | Heading
      | HtmlBlock
      | HtmlInline
      | Mention
      | Table
      | THead
      | TBody
      | TR
      | TD
      | TH
      | BlockQuote
      | Link
      | Image
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
