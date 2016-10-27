###
Multiplexing mode -- exactly like the original CodeMirror multiplexingMode,
https://codemirror.net/demo/multiplex.html,
except use the option start:true to make it so the mode switch pattern
must be at the beginning of the line.

Original copyright on https://codemirror.net/addon/mode/multiplex.js:
   CodeMirror, copyright (c) by Marijn Haverbeke and others
   Distributed under an MIT license: http://codemirror.net/LICENSE
###


CodeMirror.smc_multiplexing_mode = (outer) ->
    # Others should be {open, close, mode [, delimStyle] [, innerStyle]} objects
    others = Array::slice.call(arguments, 1)

    indexOf = (string, pattern, from, returnEnd) ->
        if typeof pattern == 'string'
            found = string.indexOf(pattern, from)
            if returnEnd and found > -1
                return found + pattern.length
            else
                return found
        m = pattern.exec(if from then string.slice(from) else string)
        if m
            return m.index + from + (if returnEnd then m[0].length else 0)
        else
            return -1


    obj =

        startState: ->
            outer       : CodeMirror.startState(outer)
            innerActive : null
            inner       : null

        copyState: (state) ->
            outer       : CodeMirror.copyState(outer, state.outer)
            innerActive : state.innerActive
            inner       : state.innerActive and CodeMirror.copyState(state.innerActive.mode, state.inner)

        token: (stream, state) ->
            oldContent = found = undefined
            if not state.innerActive
                cutOff     = Infinity
                oldContent = stream.string
                for other in others
                    if other.start and oldContent.slice(0,other.open.length) != other.open
                        continue
                    found = indexOf(oldContent, other.open, stream.pos)
                    if found == stream.pos
                        if not other.parseDelimiters
                            stream.match other.open
                        state.innerActive = other
                        state.inner = CodeMirror.startState(other.mode, if outer.indent then outer.indent(state.outer, '') else 0)
                        return other.delimStyle and other.delimStyle + ' ' + other.delimStyle + '-open'
                    else if found != -1 and found < cutOff
                        cutOff = found
                if cutOff != Infinity
                    stream.string = oldContent.slice(0, cutOff)
                outerToken = outer.token(stream, state.outer)
                if cutOff != Infinity
                    stream.string = oldContent
                return outerToken
            else
                curInner = state.innerActive
                oldContent = stream.string
                if not curInner.close and stream.sol()
                    state.innerActive = state.inner = null
                    return @token(stream, state)
                found = if curInner.close then indexOf(oldContent, curInner.close, stream.pos, curInner.parseDelimiters) else -1
                if found == stream.pos and not curInner.parseDelimiters
                    stream.match curInner.close
                    state.innerActive = state.inner = null
                    return curInner.delimStyle and curInner.delimStyle + ' ' + curInner.delimStyle + '-close'
                if found > -1
                    stream.string = oldContent.slice(0, found)
                innerToken = curInner.mode.token(stream, state.inner)
                if found > -1
                    stream.string = oldContent
                if found == stream.pos and curInner.parseDelimiters
                    state.innerActive = state.inner = null
                if curInner.innerStyle
                    if innerToken
                        innerToken = innerToken + ' ' + curInner.innerStyle
                    else
                        innerToken = curInner.innerStyle
                return innerToken

        indent: (state, textAfter) ->
            mode = if state.innerActive then state.innerActive.mode else outer
            if not mode.indent
                return CodeMirror.Pass
            return mode.indent((if state.innerActive then state.inner else state.outer), textAfter)

        blankLine: (state) ->
            mode = if state.innerActive then state.innerActive.mode else outer
            if mode.blankLine
                mode.blankLine if state.innerActive then state.inner else state.outer
            if not state.innerActive
                i = 0
                while i < others.length
                    other = others[i]
                    if other.open == '\n'
                        state.innerActive = other
                        state.inner = CodeMirror.startState(other.mode, if mode.indent then mode.indent(state.outer, '') else 0)
                    ++i
            else if state.innerActive.close == '\n'
                state.innerActive = state.inner = null
            return

        electricChars: outer.electricChars

        innerMode: (state) ->
            if state.inner
                state : state.inner
                mode  : state.innerActive.mode
            else
                state : state.outer
                mode  : outer

    return obj
