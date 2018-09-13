/* Register the frame-tree based editors. */

import "./generic/jquery-plugins";

import "./code-editor/register";  // should be first.

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

import "./lean-editor/register";

import "./generic/test/init";