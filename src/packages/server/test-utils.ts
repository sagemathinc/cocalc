/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";

/**
 * Wait to avoid test failures due to connection pool timing issues.
 *
 * Sometimes database writes (e.g., creating accounts, projects, or compute servers)
 * aren't immediately visible to subsequent reads when using a connection pool instead
 * of a single connection. This function adds a small delay to ensure consistency.
 *
 * TODO: This is a workaround. Ideally we should use a single connection for tests
 * or implement proper transaction/consistency guarantees.
 */
export async function waitToAvoidTestFailure(): Promise<void> {
  await delay(50);
}
