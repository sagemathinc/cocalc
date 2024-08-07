/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export interface OutputMessage {}

export interface OutputMessages {
  [key: string]: OutputMessage;
}

export interface CellObject {
  id: string;
  pos?: number;
  flags?: string;
  input?: string;
  output?: OutputMessages;
}
