/*
Got via `aspell dump dicts` on Ubuntu 18.04, after doing `apt-get install aspell-*`,
and removing dups.  Maybe update this someday...
*/

import { language } from "../generic/misc-page";

const langs = require("langs");

export const DICTS: string[] = [
  "default",
  "disabled",
  "af",
  "am",
  "ar",
  "ar-large",
  "bg",
  "bg-w_english",
  "bg-wo_english",
  "bn",
  "br",
  "ca",
  "ca-general",
  "ca-valencia",
  "cs",
  "cy",
  "da",
  "de",
  "de-1901",
  "de-neu",
  "de_AT",
  "de_AT-neu",
  "de_CH",
  "de_CH-1901",
  "de_CH-neu",
  "de_DE",
  "de_DE-1901",
  "de_DE-neu",
  "el",
  "en",
  "en-variant_0",
  "en-variant_1",
  "en-variant_2",
  "en-w_accents",
  "en-wo_accents",
  "en_AU",
  "en_AU-variant_0",
  "en_AU-variant_1",
  "en_AU-w_accents",
  "en_AU-wo_accents",
  "en_CA",
  "en_CA-variant_0",
  "en_CA-variant_1",
  "en_CA-w_accents",
  "en_CA-wo_accents",
  "en_GB",
  "en_GB-ise",
  "en_GB-ise-w_accents",
  "en_GB-ise-wo_accents",
  "en_GB-ize",
  "en_GB-ize-w_accents",
  "en_GB-ize-wo_accents",
  "en_GB-variant_0",
  "en_GB-variant_1",
  "en_GB-w_accents",
  "en_GB-wo_accents",
  "en_US",
  "en_US-variant_0",
  "en_US-variant_1",
  "en_US-w_accents",
  "en_US-wo_accents",
  "eo",
  "eo-cx",
  "es",
  "et",
  "eu",
  "fa",
  "fa-common",
  "fa-generic",
  "fa-scientific",
  "fo",
  "fr",
  "fr-40",
  "fr-60",
  "fr-80",
  "fr-lrg",
  "fr-med",
  "fr-sml",
  "fr_CH",
  "fr_CH-40",
  "fr_CH-60",
  "fr_CH-80",
  "fr_CH-lrg",
  "fr_CH-med",
  "fr_CH-sml",
  "fr_FR",
  "fr_FR-40",
  "fr_FR-60",
  "fr_FR-80",
  "fr_FR-lrg",
  "fr_FR-med",
  "fr_FR-sml",
  "ga",
  "gl",
  "gl-minimos",
  "gu",
  "he",
  "hi",
  "hr",
  "hsb",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "kk",
  "kn",
  "ku",
  "lt",
  "lv",
  "ml",
  "mr",
  "nb",
  "nl",
  "nn",
  "no",
  "nr",
  "ns",
  "or",
  "pa",
  "pl",
  "pt_BR",
  "pt_PT",
  "ro",
  "ru",
  "sk",
  "sk_SK",
  "sl",
  "ss",
  "st",
  "sv",
  "ta",
  "te",
  "tl",
  "tl_PH",
  "tn",
  "ts",
  "uk",
  "uz",
  "xh",
  "zu"
];

// Slightly more human readable discription of dict.
export function dict_desc(dict: string): string {
  if (dict == "default") {
    const lang = language();
    if (lang == "default") {
      return lang;
    }
    return dict_desc(lang);
  }
  if (dict == "disabled") {
    return "Disabled (no spell check)";
  }
  const country = dict.slice(0, 2);
  const other = dict.slice(3);
  if (!langs.has("1", country)) {
    return dict;
  }
  let s: string = langs.where("1", country).name;
  if (other) {
    s += ` (${other})`;
  }
  return s;
}
