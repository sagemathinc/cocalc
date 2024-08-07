/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// see entry-point, and via this useful in all TS files
declare global {
  interface Window {
    COCALC_FULLSCREEN: string | undefined;
    COCALC_MINIMAL: boolean;
  }
}

export {};
