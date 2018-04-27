/*
Conversion from Markdown *to* HTML.

- Has the option to render math inside the markdown using KaTeX.
*/

const misc                        = require('smc-util/misc');
const {macros}                    = require('./math_katex');
const create_processor            = require('markdown-it');
const katex                       = require('@cocalc/markdown-it-katex');
const task_lists                  = require('markdown-it-task-lists');
const {remove_math, replace_math} = require('smc-util/mathjax-utils');

const checkboxes = function(s) {
    s = misc.replace_all(s, '[ ]', "<i class='fa fa-square-o'></i>");
    return misc.replace_all(s, '[x]', "<i class='fa fa-check-square-o'></i>");
};

const OPTIONS = {
    html        : true,
    typographer : true,
    linkify     : true
};

const md_with_katex = create_processor(OPTIONS)
.use(katex, {macros, "throwOnError" : true})
.use(task_lists);

const md_no_math = create_processor(OPTIONS).use(task_lists);

exports.has_math = function(html : string) : boolean {
    const [ , math] = remove_math(html, true);
    return math.length > 0;
};

exports.markdown_to_html = function(markdown_string, opts) {
    opts = misc.defaults(opts, {
        katex      : false,
        checkboxes : false
    }
    );   // if true, replace checkboxes by nice rendered version; only used if katex is false.

    if (opts.katex) {
        return md_with_katex.render(markdown_string);
    } else {
        // Assume it'll be rendered by mathjax later...
        // See https://github.com/sagemathinc/cocalc/issues/1801
        let [text, math] = remove_math(markdown_string);
        if (opts.checkboxes) {
            text = checkboxes(text);
        }
        const html = md_no_math.render(text);
        return replace_math(html, math);
    }
};
