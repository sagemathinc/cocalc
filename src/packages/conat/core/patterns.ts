/*


*/

import { matchesPattern } from "@cocalc/conat/util";

export class Patterns<T> {
  private patterns: { [pattern: string]: T } = {};
  constructor() {}

  *matches(subject: string) {
    for (const pattern in this.patterns) {
      if (matchesPattern({ pattern, subject })) {
        yield pattern;
      }
    }
  }

  get = (pattern: string): T | undefined => {
    return this.patterns[pattern];
  };

  set = (pattern: string, t: T) => {
    this.patterns[pattern] = t;
  };

  delete = (pattern: string) => {
    delete this.patterns[pattern];
  };
}
