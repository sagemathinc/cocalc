/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// If the user makes the viewport really wide, it is very hard to read
// the iframe or markdown, so we max the width out at 900px.  I have no idea if 900px
// is a good choice...

export const MAX_WIDTH_NUM: number = 900
export const MAX_WIDTH: string = `${MAX_WIDTH_NUM}px`;
