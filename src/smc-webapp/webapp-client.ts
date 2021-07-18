/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//###########################################
// connection to back-end hub
//###########################################

import "./client/handle-hash-url";

// The following interface obviously needs to get completed,
// and then of course all of webapp client itself needs to
// be rewritten in Typescript.  In the meantime, this might
// at least prevent a typo.  When something you need from the
// actual webapp client isn't here, add it (there api is huge).

export { WebappClient, webapp_client } from "./client/client";
