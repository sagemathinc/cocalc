import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import { MIN_PASSWORD_STRENGTH } from "@cocalc/util/auth";

zxcvbnOptions.setOptions({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
});

/*
See https://zxcvbn-ts.github.io/zxcvbn/guide/getting-started/#output

This returns a score that is 0, 1, 2, 3, or 4.  A safe password has a score of 3 or 4.  A score of 2 is not good.
A score of 0 or 1 is attrocious.
For scores of at most MIN_PASSWORD_STRENGTH, a warning and suggestion is also provided.
*/

export default function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  help?: string;
} {
  const { score, feedback } = zxcvbn(password);
  return {
    score,
    help:
      score <= MIN_PASSWORD_STRENGTH
        ? `Password is too weak. ${feedback?.warning ?? ""}\n ${
            feedback?.suggestions ? feedback?.suggestions.join("\n ") : ""
          }`
        : undefined,
  };
}
