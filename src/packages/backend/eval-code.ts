/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export async function eval_code(code: string): Promise<any> {
  return await eval(code);
}
