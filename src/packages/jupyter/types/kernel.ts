/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export interface KernelParams {
  name?: string; // yes, this can be undefined since we fully support notebooks with *no* kernel at all defined.
  path: string; // filename of the ipynb corresponding to this kernel (doesn't have to actually exist)
  actions?: any; // optional redux actions object
  ulimit?: string;
}
