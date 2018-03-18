math_katex = require('../math_katex')
katex = require('katex')
expect = require('expect')

describe 'math processing', ->
    it 'renders identically to katex', ->
        math_string = "\\sqrt{\\frac{2}{3}}"
        target_string = "$" + math_string + "$"

        rendered_math = math_katex.render(target_string)
        rendered_by_katex = katex.renderToString(math_string)

        expect(rendered_math.html)
            .toEqual(rendered_by_katex)


markdown = require('../markdown')
describe 'markdown math', ->
    it 'renders identically to katex', ->
        math_string = "\\sqrt{x^3}"
        target_string = "$" + math_string + "$"

        rendered_math = markdown.markdown_to_html(target_string, {katex : false})
        rendered_by_katex = katex.renderToString(math_string)

        expect(rendered_math)
            .toEqual("<p>" + rendered_by_katex + "</p>\n")
