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

export function stickyChoice({
  subject,
  pattern,
  targets,
  updateSticky,
  getStickyTarget,
}: {
  subject: string;
  pattern: string;
  targets: Set<string>;
  updateSticky?;
  getStickyTarget: (opts: {
    pattern: string;
    subject: string;
    targets: Set<string>;
  }) => string | undefined;
}) {
  const v = subject.split(".");
  subject = v.slice(0, v.length - 1).join(".");
  const currentTarget = getStickyTarget({ pattern, subject, targets });
  if (currentTarget === undefined || !targets.has(currentTarget)) {
    // we use consistent hashing instead of random to make the choice, because if
    // choice is being made by two different socketio servers at the same time,
    // and they make different choices, it would be (temporarily) bad since a
    // couple messages could get routed inconsistently.
    // It's actually very highly likely to have such parallel choices
    // happening in cocalc, since when a file is opened a persistent stream is opened
    // in the browser and the project at the exact same time, and those are likely
    // to be connected to different socketio servers.  By using consistent hashing,
    // all conflicts are avoided except for a few moments when the actual targets
    // (e.g., the persist servers) are themselves changing, which should be something
    // that only happens for a moment every few days.
    const target = consistentHashingChoice(targets, subject);
    updateSticky?.({ pattern, subject, target });
    return target;
  }
  return currentTarget;
}
