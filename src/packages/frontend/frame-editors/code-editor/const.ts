/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This determines how long the user has to pause typing before
// their changes are saved to time travel and broadcast to all other
// users.

export const SAVE_DEBOUNCE_MS = 750;

// for testing sync issues manually, it is much easier with this large -- do not do this in production though!
// export const SAVE_DEBOUNCE_MS = 3000;
