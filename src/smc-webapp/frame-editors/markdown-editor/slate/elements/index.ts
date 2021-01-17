/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Register all the types.


import "./generic"; // dynamically covers unregistered types

// The order of registering these does NOT matter and has no
// impact on semantics or speed.

import "./checkbox";
import "./emoji";
import "./hr";
import "./paragraph";
import "./code_block";
import "./linebreak";
import "./math";
import "./heading";
import "./html";
import "./table";
import "./blockquote";
import "./link";
import "./list-item";
import "./list";