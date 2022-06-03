// This file started exactly copied from
//
//      unified-latex/packages/unified-latex-util-pegjs/grammars/latex.pegjs
//
// The copyright is from there still, of course, and it stays licensed
// under the MIT license exactly as upstream.
// I removed this, since I think for my purposes I don't need anything nearly
// as complicated as the full unified-latex; at least not for now (maybe later).

{
    function toString(e) {
        if (typeof e === "string") {
            return e;
        }
        if (typeof e.content === "string") {
            return e.content;
        }
        if (e && e.type === "whitespace") {
            return " ";
        }
        return e;
    }

    function compare_env(g1, g2) {
        const g1Name =
            typeof g1 === "string" ? g1 : g1.content.map(toString).join("");
        const g2Name =
            typeof g2 === "string" ? g2 : g2.content.map(toString).join("");
        return g1Name === g2Name;
    }

    function createNode(type, extra = {}) {
        return { type, ...extra, position: location() };
    }
}

document "document" = content:token* { return createNode("root", { content }); }

// This rule is used as the entry rule to parse when you know that the string only contains math
math "math" = math_token*

token "token"
    = special_macro
    / macro
    / full_comment
    / group
    / math_shift eq:(!math_shift t:math_token { return t; })+ math_shift {
            return createNode("inlinemath", { content: eq });
        }
    / alignment_tab
    / parbreak
    / macro_parameter
    / ignore
    / number
    / whitespace
    / punctuation
    / s:$(!nonchar_token .)+ { return createNode("string", { content: s }); }
    // If all else fails, we allow special tokens. If one of these
    // is matched, it means there is an unbalanced group.
    / begin_group
    / end_group
    / math_shift
    / s:. { return createNode("string", { content: s }); }

parbreak "parbreak"
    = (
        // Comments eat the whitespace in front of them, so if a
        // parbreak is follwed by a comment, we don't want to eat that
        // whitespace.
        sp* nl (sp* nl)+ sp* !comment_start
        / sp* nl (sp* nl)+
    ) { return createNode("parbreak"); }

math_token "math token"
    = special_macro
    / macro
    / full_comment
    / whitespace* x:group whitespace* { return x; }
    / whitespace* x:alignment_tab whitespace* { return x; }
    / whitespace* x:macro_parameter whitespace* { return x; }
    / whitespace* superscript whitespace* {
            return createNode("macro", { content: "^", escapeToken: "" });
        }
    / whitespace* subscript whitespace* {
            return createNode("macro", { content: "_", escapeToken: "" });
        }
    / ignore
    / whitespace
    / s:. { return createNode("string", { content: s }); }

nonchar_token "nonchar token"
    = escape
    / "%"
    / begin_group
    / end_group
    / math_shift
    / alignment_tab
    / nl
    / macro_parameter
    / ignore
    / sp
    / punctuation
    / EOF

whitespace "whitespace"
    = (nl sp* / sp+ nl !comment_start sp* !nl / sp+) {
            return createNode("whitespace");
        }

number "number"
    = s:(
        a:num+ "." b:num+ { return a.join("") + "." + b.join(""); }
        / "." b:num+ { return "." + b.join(""); }
        / a:num+ "." { return a.join("") + "."; }
    ) { return createNode("string", { content: s }); }

special_macro "special macro" // for the special macros like \[ \] and \begin{} \end{} etc.
    // \verb|xxx| and \verb*|xxx|
    = escape
        env:("verb*" / "verb")
        e:.
        x:(!(end:. & { return end == e; }) x:. { return x; })*
        (end:. & { return end == e; }) {
            return createNode("verb", {
                env: env,
                escape: e,
                content: x.join(""),
            });
        }
    // verbatim environment
    / verbatim_environment
    // display math with \[...\]
    / begin_display_math
        x:(!end_display_math x:math_token { return x; })*
        end_display_math { return createNode("displaymath", { content: x }); }
    // inline math with \(...\)
    / begin_inline_math
        x:(!end_inline_math x:math_token { return x; })*
        end_inline_math { return createNode("inlinemath", { content: x }); }
    // display math with $$...$$
    / math_shift
        math_shift
        x:(!(math_shift math_shift) x:math_token { return x; })*
        math_shift
        math_shift { return createNode("displaymath", { content: x }); }
    // math with $...$
    / math_environment
    / environment

verbatim_environment "verbatim environment"
    = begin_env
        begin_group
        env:verbatim_env_name
        end_group
        body:(
            !(
                    end_env
                        end_env:group
                        & { return compare_env({ content: [env] }, end_env); }
                )
                x:. { return x; }
        )*
        end_env
        begin_group
        verbatim_env_name
        end_group {
            return createNode("verbatim", {
                env: env,
                content: body.join(""),
            });
        }

verbatim_env_name
    // standard verbatim enviroments. `verbatim*` must be listed first
    = "verbatim*"
    / "verbatim"
    / "filecontents*"
    / "filecontents"
    // comment environment provided by \usepackage{verbatim}
    / "comment"
    // lstlisting environment provided by \usepackage{listings}
    / "lstlisting"

macro "macro"
    = m:(escape n:char+ { return n.join(""); } / escape n:. { return n; }) {
            return createNode("macro", { content: m });
        }

group "group"
    = begin_group x:(!end_group c:token { return c; })* end_group {
            return createNode("group", { content: x });
        }

// Match a group but return its contents as a raw string.
// This is used for environment matching
group_contents_as_string = g:group { return text().slice(1, -1); }

environment "environment"
    = begin_env
        env:group_contents_as_string
        env_comment:sameline_comment?
        body:(
            !(
                    end_env
                        end_env:group_contents_as_string
                        & { return compare_env(env, end_env); }
                )
                x:token { return x; }
        )*
        end_env
        group_contents_as_string {
            return createNode("environment", {
                env,
                content: env_comment ? [env_comment, ...body] : body,
            });
        }

math_environment "math environment"
    = begin_env
        begin_group
        env:math_env_name
        end_group
        env_comment:sameline_comment?
        body:(
            !(
                    end_env
                        end_env:group
                        & { return compare_env({ content: [env] }, end_env); }
                )
                x:math_token { return x; }
        )*
        end_env
        begin_group
        math_env_name
        end_group {
            return createNode("mathenv", {
                env: env,
                content: env_comment ? [env_comment, ...body] : body,
            });
        }

// group that assumes you're in math mode.  If you use "\text{}" this isn't a good idea....
math_group "math group"
    = begin_group x:(!end_group c:math_token { return c; })* end_group {
            return createNode("group", { content: x });
        }

begin_display_math = escape "["

end_display_math = escape "]"

begin_inline_math = escape "("

end_inline_math = escape ")"

begin_env = escape "begin"

end_env = escape "end"

math_env_name
    = e:(
        "equation*"
        / "equation"
        / "align*"
        / "align"
        / "alignat*"
        / "alignat"
        / "gather*"
        / "gather"
        / "multline*"
        / "multline"
        / "flalign*"
        / "flalign"
        / "split"
        / "math"
        / "displaymath"
    ) { return createNode("string", { content: e }); }

// FOR THE FOLLOWING ITEMS:
//
// Most of the time these are used as a match only. However, in the case
// of errors, we match them as strings. Therefore, it is useful to have the returned
// match be a string node.

// catcode 0
escape "escape" = "\\" { return createNode("string", { content: "\\" }); }

// catcode 1
begin_group = s:"{" { return createNode("string", { content: s }); }

// catcode 2
end_group = s:"}" { return createNode("string", { content: s }); }

// catcode 3
math_shift = s:"$" { return createNode("string", { content: s }); }

// catcode 4
alignment_tab = s:"&" { return createNode("string", { content: s }); }

// catcode 5 (linux, os x, windows)
nl "newline"
    = !"\r" "\n"
    / "\r"
    / "\r\n"

// catcode 6
macro_parameter = s:"#" { return createNode("string", { content: s }); }

// catcode 7
superscript = s:"^" { return createNode("string", { content: s }); }

// catcode 8
subscript = s:"_" { return createNode("string", { content: s }); }

// catcode 9
ignore = "\0"

// catcode 10
sp "whitespace" = [ \t]+ { return " "; }

// catcode 11
char "letter" = c:[a-zA-Z]

// catcode 12 (other)
num "digit" = n:[0-9]

// catcode 12
punctuation "punctuation"
    = p:[.,;:\-\*/()!?=+<>\[\]`'\"~] {
            return createNode("string", { content: p });
        }

// catcode 14, including the newline
comment_start = "%"

// A comment consumes any whitespace that comes before it.
// It can be the only thing on a line, or can come at the end of a line.
// A comment will consume the newline that follows it, unless that newline
// is part of a parbreak.
full_comment "full comment"
    = ownline_comment
    / sameline_comment

// A comment that appears on a line of its own
ownline_comment
    // `leading_sp` is whitespace that starts at the beginning fo a line.
    // A comment is `sameline` if it is on the same line as other content.
    // The existance of leading whitespace for a `sameline == false` comment
    // isn't important, but we record it anyways.
    //
    // We look for `(sp nl)?` at the start so that we eat excess whitespace that occurs before
    // a comment on a new line. Otherwise, the newline itself is counted as whitespace. For example:
    // ```x
    //    %comment```
    // would be parsed as "x, <whitespace (from the newline)>, comment". We don't want this. We want
    // to parse it as "x, comment".
    = (sp* nl)? leading_sp:leading_sp comment:comment {
            return createNode("comment", {
                ...comment,
                sameline: false,
                leadingWhitespace: leading_sp.length > 0,
            });
        }

// A comment that appears at the end of a line
sameline_comment
    = spaces:sp* x:comment {
            return createNode("comment", {
                ...x,
                sameline: true,
                leadingWhitespace: spaces.length > 0,
            });
        }

comment "comment"
    // A comment normally consumes the next newline and all leading whitespace.
    // The exception is if the next line consists solely of a comment. In that case,
    // consume the newline but leave the whitespace (`full_comment` will eat the
    // leading whitspace)
    = comment_start c:(!nl c:. { return c; })* &parbreak {
            return { content: c.join(""), suffixParbreak: true };
        } // parbreaks following a comment are preserved
    / comment_start
        c:(!nl c:. { return c; })*
        (nl sp* !comment_start / nl / EOF) { return { content: c.join("") }; } // if a comment is not followed by a parbreak, the newline is consumed

// Whitespace at the start of a line only
leading_sp = $(start_of_line sp*)

start_of_line
    = & {
            var loc = location();
            return loc.start.column === 1;
        }

EOF = !.
