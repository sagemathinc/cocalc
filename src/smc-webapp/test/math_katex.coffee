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

