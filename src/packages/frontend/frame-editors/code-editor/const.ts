/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This determines how long the user has to pause typing before
// their changes are saved to time travel and broadcast to all other
// users.

// 50 words per minute is about 250ms between characters, so something bigger than that.
export const SAVE_DEBOUNCE_MS = 1000;

// for testing sync issues manually, it is much easier with this large -- do not do this in production though!
// export const SAVE_DEBOUNCE_MS = 3000;

// https://github.com/sagemathinc/cocalc/issues/4120
const MPLBACKEND = "Agg";
export const DEFAULT_TERM_ENV = { MPLBACKEND } as const;
