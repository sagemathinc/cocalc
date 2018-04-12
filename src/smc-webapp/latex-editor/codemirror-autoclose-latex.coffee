###
Make it so Codemirror has an option to automatically close latex environments.

Inspired a little bit by
  - https://codemirror.net/demo/closetag.html
  - https://codemirror.net/addon/edit/closetag.js
###

{splitlines} = require('smc-util/misc')

CodeMirror.defineOption "autoCloseLatex", false, (cm, val, old) ->
    if old and old != CodeMirror.Init
        cm.removeKeyMap("autoCloseLatex")
    if not val
        return
    map =
        name    : "autoCloseLatex"
        "Enter" : (cm) -> auto_close_latex(cm)
    cm.addKeyMap(map)

auto_close_latex = (cm) ->
    if cm.getOption("disableInput")
        return CodeMirror.Pass
    replacements = []
    selections   = []
    did_subs     = false
    extra_lines  = 0

    no_op = (pos) ->
        replacements.push('\n')
        new_pos = {line:pos.line+1, ch:0}
        extra_lines += 1
        selections.push({head:new_pos, anchor:new_pos})

    for range in cm.listSelections()
        if not range.empty()  # if any range is non-empty do nothing.
            return CodeMirror.Pass
        pos = range.head
        tok = cm.getTokenAt(pos)
        inner = CodeMirror.innerMode(cm.getMode(), tok.state)
        state = inner.state
        if inner.mode.name != "stex"
            no_op(pos)
            continue
        if tok.type != 'bracket' and tok.string != '}'
            no_op(pos)
            continue
        next_token = cm.getTokenAt({line:pos.line, ch:pos.ch+1})
        if next_token.start != tok.start  #has to be end of line.
            no_op(pos)
            continue

        line = cm.getLine(pos.line)
        i = line.lastIndexOf('\\begin{')
        if i == -1
            no_op(pos)
            continue
        environment = line.slice(i + '\\begin{'.length, pos.ch-1)
        end = "\\end{#{environment}}"
        s = cm.getRange({line:pos.line+1,ch:0}, {line:pos.line+1000,ch:0})
        i = s.indexOf("\\end{#{environment}}")
        j = s.indexOf("\\begin{#{environment}}")
        if i != -1 and (j == -1 or j > i)
            no_op(pos)
            continue
        middle = extra_content(environment)
        replacements.push("#{middle}\n#{end}\n")
        new_pos = {line:pos.line + extra_lines + 1, ch:middle.length}
        extra_lines += splitlines(replacements[replacements.length-1]).length + 1
        selections.push({head:new_pos, anchor:new_pos})
        did_subs = true

    if did_subs
        # now make all the replacements
        cm.replaceSelections(replacements)
        # TODO: selections aren't quite right with multiple ones...
        cm.setSelections(selections)
        return
    else
        return CodeMirror.Pass

# See http://latex.wikia.com/wiki/List_of_LaTeX_environments for inspiration.
extra_content = (environment) ->
    switch environment
        when 'enumerate', 'itemize', 'list'
            return '\n\\item First \n\\item Second '
        when 'description'
            return '\n\\item [label] First \n\\item [label] Second '
        when 'figure'
            return  '\n% body of the figure\n\\caption{figure title}'
        else
            return '\n'