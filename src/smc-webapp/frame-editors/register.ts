/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import "./generic/jquery-plugins";
import "./code-editor/register"; // should be first.
import "./wiki-editor/register";
import "./rmd-editor/register";
import "./rst-editor/register";
import "./markdown-editor/register";
import "./html-editor/register";
import "./latex-editor/register";
import "./pdf-editor/register";

// Work in progress -- uncomment to use new sagews support.
// import "./sagews-editor/register";

import "./terminal-editor/register";
import "./x11-editor/register";
import "./lean-editor/register";
import "./jupyter-editor/register";
import "./generic/test/init";
import "./time-travel-editor/register";
import "./course-editor/register";
import "./csv-editor/register";