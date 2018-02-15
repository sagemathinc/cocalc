###
Processing React component tree before feeding it to the streaming render.

This involves:

  - Running KaTex on HTML components
  - Changing internal links.

###

{process_internal_links} = require('./process-internal-links')
{process_math} = require('./process-math')

# Pipes the html through various processors
process = (html, viewer) ->
    html = process_internal_links(html, viewer)
    html = process_math(html)

reactTreeWalker = require('react-tree-walker').default

exports.process_react_component = (component, viewer, cb) ->

    # Return true to continue walking
    # Return false to stop walking
    # For more info, see https://github.com/ctrlplusb/react-tree-walker
    visitor = (element, instance, context) ->
        # Keeps walking if no has_math is defined
        if element.props?.has_math?
            if not element.props.has_math
                return false
            if element.type?.displayName == 'Misc-HTML' and element.props.value
                process(element.props.value, viewer)
                return false
        return true

    reactTreeWalker(component, visitor)

