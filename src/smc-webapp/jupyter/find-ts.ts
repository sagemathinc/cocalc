/*
This code is inspired by the BSD licensed Jupyter code, in order to maintain
a compatible interpretation of how things work:

   notebook/notebook/static/notebook/js/searchandreplace.js
*/

/*
Escape a Regular expression to act as a pure search string,
though it will still have the case sensitivity options and all the benefits.
*/
function escape_regexp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function construct_regexp(string: string, flags: string, is_regexp: false): RegExp;
function construct_regexp(string: RegExp, flags: string, is_regexp: true): RegExp;
function construct_regexp(string, flags, is_regexp) {
  // return a Pseudo RegExp object that acts
  // either as a plain RegExp Object, or as a pure string matching.
  if (is_regexp) {
    return new RegExp(string, flags);
  } else {
    return new RegExp(escape_regexp(string), flags);
  }
}

/*
  Find all occurrences of `pattern` in `string`, match in a `case_sensitive` manner.

  Return {matches:[...], abort:abort, error:error}
   matches = list of matches {start:start, stop:stop} indexes in the string.
   abort   = abort Boolean, if more that 100 matches and the matches were aborted.
   error   = in case of problems compling regular expression
  */
export function find_matches(
  pattern: string | RegExp,
  string: string,
  is_case_sensitive = false,
  is_regexp = false,
  max_matches = 100
): { matches?: Array<{ start: number; stop: number }>; abort?: boolean; error?: string } {
  let flags = "g";
  if (!is_case_sensitive) {
    flags += "i";
  }
  try {
    pattern = construct_regexp(pattern as any, flags, is_regexp as any);
  } catch (error) {
    return { error: `${error}` };
  }

  const matches: any = [];
  let match: any = undefined;
  let escape_hatch = 0;
  let abort = false;
  while ((match = (pattern as any).exec(string)) != null) {
    match = { start: match.index, stop: match.index + match[0].length };
    if (match.stop === match.start) {
      // e.g., an empty search
      return { matches: [] };
    }
    matches.push(match);
    escape_hatch++;
    if (escape_hatch >= max_matches) {
      abort = true;
      break;
    }
  }

  const x: any = { matches };
  if (abort) {
    x.abort = abort;
  }
  return x;
}
