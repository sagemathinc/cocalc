/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const is_frontend = process == null;

// empty component, for backend compatibility
export const Null: React.FC<{}> = () => {
  return null;
};
