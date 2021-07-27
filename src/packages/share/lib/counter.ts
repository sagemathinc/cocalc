/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect } from "react";
import { useRouter } from "next/router";

export default function useCounter(id: string | undefined) {
  // call API to increment the counter
  const router = useRouter();
  useEffect(() => {
    if (id != null) {
      fetch(`${router.basePath}/api/public_paths/counter/${id}`);
    }
  }, [id]);
}
