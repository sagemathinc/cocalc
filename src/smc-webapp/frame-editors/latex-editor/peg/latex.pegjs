{
    function compare_env(g1,g2) {
        return g1.content.join("") == g2.content.join("");
    }
}

document "document"
  = (token)*

token "token"
  = special_macro
  / macro
  / full_comment
  / group
  / math_shift eq:(!math_shift t:math_token {return t})+ math_shift {return {TYPE:"inlinemath", content: eq}}
  / alignment_tab
  / sp* nl sp* nl+ sp* {return {TYPE:"parbreak"}}
  / macro_parameter
  / superscript
  / subscript
  / ignore
  / number
  / whitespace
  / x:(!nonchar_token x:. {return x})+ {return x.join("")}

math_token "math token"
  = special_macro
  / macro
  / x:full_comment {return x}
  / whitespace* x:group whitespace* {return x}
  / whitespace* x:alignment_tab whitespace* {return x}
  / whitespace* x:macro_parameter whitespace* {return x}
  / whitespace* superscript whitespace* x:math_token {return {TYPE:"superscript", content:x}}
  / whitespace* subscript whitespace* x:math_token {return {TYPE:"subscript", content:x}}
  / ignore
  / whitespace
  / .

args_token "args token"
  = special_macro
  / macro
  / full_comment
  / group
  / math_shift eq:(!math_shift t:math_token {return t})+ math_shift {return {TYPE:"inlinemath", content: eq}}
  / alignment_tab
  / sp* nl sp* nl+ sp* {return {TYPE:"parbreak"}}
  / macro_parameter
  / superscript
  / subscript
  / ignore
  / number
  / whitespace
  / x:(!(nonchar_token / "," / "]") x:. {return x})+ {return x.join("")}

nonchar_token "nonchar token"
  = escape
  / "%"
  / begin_group
  / end_group
  / math_shift
  / alignment_tab
  / nl
  / macro_parameter
  / superscript
  / subscript
  / ignore
  / sp
  / EOF

whitespace "whitespace"
  = (nl sp*/ sp+ nl sp* !nl/ sp+) {return {TYPE: "whitespace"}}

number "number"
  = a:num+ "." b:num+ {return a.join("") + "." + b.join("")}
  / "." b:num+ {return "." + b.join("")}
  / a:num+ "." {return a.join("") + "."}

special_macro "special macro" // for the special macros like \[ \] and \begin{} \end{} etc.
  = escape "verb" e:. x:(!(end:. & {return end == e}) x:. {return x})* (end:. & {return end == e})  {return {TYPE:"verb", escape:e, content:x.join("")}}  // \verb|xxx|
  / escape "begin{verbatim}" x:(!(escape "end{verbatim}") x:. {return x})* escape "end{verbatim}" {return {TYPE:"verbatim", content:x.join("")}}  // verbatim environment
  / escape "begin{comment}" x:(!(escape "end{comment}") x:. {return x})* escape "end{comment}" {return {TYPE:"commentenv", content:x.join("")}}  // comment environment provided by \usepackage{verbatim}
  / begin_display_math x:(!end_display_math x:math_token {return x})+ end_display_math {return {TYPE:"displaymath", content:x}}   //display math with \[\]
  / begin_inline_math x:(!end_inline_math x:math_token {return x})+ end_inline_math {return {TYPE:"inlinemath", content:x}}       //inline math with \(\)
  / math_shift math_shift x:(!(math_shift math_shift) x:math_token {return x})+ math_shift math_shift {return {TYPE:"displaymath", content:x}}   //display math with $$ $$
  / math_environment
  / environment


macro "macro"
  = m:(escape n:char+ {return n.join("")}
  / escape n:. {return n}) {return {TYPE:"macro", content:m}}

group "group"
  = begin_group x:(!end_group c:token {return c})* end_group {return {TYPE:"group", content:x}}


argument_list "argument list"
  = whitespace* "[" body:(!"]" x:("," / args_token) {return x})* "]" {return {TYPE:"arglist", content:body}}


environment "environment"
  = begin_env env:group args:argument_list?
  			  body:(!(end_env end_env:group & {return compare_env(env,end_env)}) x:token {return x})*
    end_env group {return {TYPE:"environment", env:env.content, args:args, content:body}}

math_environment "math environment"
  = begin_env begin_group env:math_env_name end_group
  			body: (!(end_env end_env:group & {console.log(env, end_env,  compare_env({content:[env]},end_env));return compare_env({content:[env]},end_env)}) x:math_token {return x})*
    end_env begin_group math_env_name end_group {return {TYPE:"mathenv", env:env, content:body}}


math_group "math group"  // group that assumes you're in math mode.  If you use "\text{}" this isn't a good idea....
  = begin_group x:(!end_group c:math_token {return c})* end_group {return {TYPE:"group", content:x}}

full_comment "full comment" 		// comment that detects whether it is at the end of a line or on a new line
  = nl x:comment {return {TYPE:"comment", content:x, sameline:false}}
  / x:comment {return {TYPE:"comment", content:x, sameline:true}}


begin_display_math = escape "["
end_display_math = escape "]"
begin_inline_math = escape "("
end_inline_math = escape ")"

begin_env = escape "begin"
end_env = escape "end"

math_env_name
  = "equation*"
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


escape "escape" = "\\"                             // catcode 0
begin_group     = "{"                              // catcode 1
end_group       = "}"                              // catcode 2
math_shift      = "$"                              // catcode 3
alignment_tab   = "&"                              // catcode 4
nl    "newline" = !'\r''\n' / '\r' / '\r\n'        // catcode 5 (linux, os x, windows)
macro_parameter = "#"                              // catcode 6
superscript     = "^"                              // catcode 7
subscript       = "_"                              // catcode 8
ignore          = "\0"                             // catcode 9
sp          "whitespace"   =   [ \t]+ { return " "}// catcode 10
char        "letter"       = c:[a-zA-Z]            // catcode 11
num         "digit"        = n:[0-9]               // catcode 12 (other)
punctuation "punctuation" = p:[.,;:\-\*/()!?=+<>\[\]]   // catcode 12
comment        = "%"  c:(!nl c:. {return c})* (nl / EOF) {return c.join("")}          // catcode 14, including the newline

EOF             = !.
