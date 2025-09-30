import ConsistentHash from "consistent-hash";
import { hash_string } from "@cocalc/util/misc";

export function consistentHashingChoice(
  v: Set<string>,
  resource: string,
): string {
  if (v.size == 0) {
    throw Error("v must have size at least 1");
  }
  if (v.size == 1) {
    for (const x of v) {
      return x;
    }
  }
  const hr = new ConsistentHash({ distribution: "uniform" });
  const w = Array.from(v);
  w.sort();
  for (const x of w) {
    hr.add(x);
  }
  // we hash the resource so that the values are randomly distributed even
  // if the resources look very similar (e.g., subject.1, subject.2, etc.)
  // I thought that "consistent-hash" hashed the resource, but it doesn't really.
  return hr.get(hash_string(resource));
}

export async function stickyChoice({
  subject,
  pattern,
  targets,
  updateSticky,
  getStickyTarget,
}: {
  subject: string;
  pattern: string;
  targets: Set<string>;
  updateSticky;
  getStickyTarget: (opts: {
    pattern: string;
    subject: string;
  }) => string | undefined;
}): Promise<string> {
  const v = subject.split(".");
  subject = v.slice(0, v.length - 1).join(".");
  const currentTarget = getStickyTarget({ pattern, subject });
  if (currentTarget === undefined || !targets.has(currentTarget)) {
    const target = consistentHashingChoice(targets, subject);
    updateSticky({ pattern, subject, target, ttl: 5_000 });
    return target;
  }
  return currentTarget;
}
