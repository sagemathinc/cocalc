###
Binary tree operations
###

immutable = require('immutable')
misc      = require('smc-util/misc')

exports.set = (tree, obj) ->
    id = obj.id
    if not id?  # id must be set
        return tree
    if misc.len(obj) < 2  # nothing to do
        return tree
    done  = false
    process = (node) ->
        if not node? or done
            return node
        if node.get('id') == id
            # it's the one -- change it
            for k, v of obj
                if k != 'id'
                    node = node.set(k, immutable.fromJS(v))
            done = true
            return node
        for x in ['first', 'second']
            sub0 = node.get(x)
            sub1 = process(sub0)
            if sub0 != sub1 # changed
                node = node.set(x, sub1)
        return node
    return process(tree)

generate_id = ->
    return misc.uuid().slice(0,8)

# Ensure every node of the tree has an id set.
exports.assign_ids = (tree) ->
    process = (node) ->
        if not node?
            return node
        if not node.has('id') or not misc.is_string(node.get('id'))
            node = node.set('id', generate_id())
        for x in ['first', 'second']
            sub0 = node.get(x)
            sub1 = process(sub0)
            if sub0 != sub1 # changed
                node = node.set(x, sub1)
        return node
    return process(tree)

# Ensure ids are unique (changing tree if necessary).
# We assume every node has an id, and that they are all strings.
exports.ensure_ids_are_unique = (tree) ->
    ids = {}
    dupe = false
    process = (node) ->
        if not node?
            return node
        id = node.get('id')
        if ids[id]?
            dupe = true
            return node.set('id', generate_id())
        for x in ['first', 'second']
            sub0 = node.get(x)
            sub1 = process(sub0)
            if sub0 != sub1 # changed
                node = node.set(x, sub1)
        return node
    while true
        dupe = false
        tree = process(tree)
        if not dupe
            return tree
        # otherwise, sets dupe = false again and runs through it again, generating
        # new random ids when there is a conflict.

exports.has_id = (tree, id) ->
    has = false
    process = (node) ->
        if not node? or has
            return
        if node.get('id') == id
            has = true
            return
        for x in ['first', 'second']
            if has
                break
            process(node.get(x))
    process(tree)
    return has

exports.is_leaf = (node) ->
    return node? and not node.get('first') and not node.get('second')

# Get node in the tree with given id
exports.get_node = (tree, id) ->
    if not tree?
        return false
    the_node = undefined
    process = (node) ->
        if the_node? or not node?
            return
        if node.get('id') == id
            the_node = node
            return
        for x in ['first', 'second']
            if the_node?
                break
            process(node.get(x))
    process(tree)
    return the_node

exports.delete_node = (tree, id) ->
    if not tree?
        return
    if tree.get('id') == id
        # we never delete the root of the tree
        return tree
    done = false
    process = (node) ->
        if not node? or done
            return node
        for x in ['first', 'second']
            t = node.get(x)
            if t?.get('id') == id
                # replace this entire node by the other branch.
                done = true
                if x == 'first'
                    return node.get('second')
                else
                    return node.get('first')
            # descend the tree
            t1 = process(t)
            if t1 != t
                node = node.set(x, t1)
        return node
    return process(tree)

exports.is_leaf_id = (tree, id) ->
    return exports.is_leaf(exports.get_node(tree, id))

# Get id of some leaf node.  Assumes all ids are set.
exports.get_some_leaf_id = (tree) ->
    done = false
    id   = undefined
    process = (node) ->
        if not node? or done
            return
        # must be leaf
        if exports.is_leaf(node)
            id = node.get('id')
            done = true
            return
        for x in ['first', 'second']
            if not done
                process(node.get(x))
    process(tree)
    return id
