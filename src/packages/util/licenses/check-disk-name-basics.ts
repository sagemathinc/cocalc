/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this is the first set of tests -- the second test is uniqueness
export function testDedicatedDiskNameBasic(name: any) {
  const minLength = 6;
  const maxLength = 20;

  if (name == null) {
    throw new Error("Please enter a name.");
  } else if (name.length < minLength) {
    throw new Error(`Name must have at least ${minLength} characters.`);
  } else if (name.length > maxLength) {
    throw new Error(`Name must have at most ${maxLength} characters.`);
  } else if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(
      "Name must consist of lowercase letters, numbers, and hyphens only."
    );
  }
}
