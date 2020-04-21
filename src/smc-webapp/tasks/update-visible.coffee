###
Update which tasks and hashtags are visible, and their order.
###

immutable  = require('immutable')

misc = require('smc-util/misc')

{search_matches, get_search} = require('./search')

{SORT_INFO, HEADINGS, HEADINGS_DIR} = require('../frame-editors/task-editor/headings-info')

# Show tasks for a few seconds, even after marked done:
# Set to 0 to disable (since it is actually really annoying, and we have undo.)
DONE_CUTOFF_MS = 0

exports.update_visible = (tasks, local_tasks, view, counts, current_task_id) ->
    if not tasks?  # not fully initialized.
        return

    show_deleted    = !!view.get('show_deleted')
    show_done       = !!view.get('show_done')

    now = new Date()
    _is_visible = {}
    is_visible = (task, id) ->
        c = _is_visible[id]
        if c?
            return c
        if (not show_deleted and task.get('deleted')) or \
           (not show_done and task.get('done') and (not DONE_CUTOFF_MS or now - (task.get('last_edited') ? 0) > DONE_CUTOFF_MS))
            _is_visible[id] = false
        else
            _is_visible[id] = true
        return _is_visible[id]

    relevant_tags = {}
    tasks.forEach (task, id) =>
        if not is_visible(task, id)
            return
        desc = task.get('desc')
        for x in misc.parse_hashtags(desc)
            tag = desc.slice(x[0]+1, x[1]).toLowerCase()
            relevant_tags[tag] = true

    search0 = get_search(view, relevant_tags)
    search = []
    if search0
        for x in misc.search_split(search0.toLowerCase())
            x = x.trim()
            if x
                search.push(x)

    v = []
    new_counts =
        done    : 0
        deleted : 0
    current_is_visible = false

    sort_column  = view.getIn(['sort', 'column'])
    sort_info    = SORT_INFO[sort_column] ?= SORT_INFO[HEADINGS[0]]
    sort_key     = sort_info.key
    sort_dir     = view.getIn(['sort', 'dir']) ? HEADINGS_DIR[0]
    if sort_info.reverse  # reverse sort order -- done for due date
        if sort_dir == 'asc'
            sort_dir = 'desc'
        else
            sort_dir = 'asc'
    # undefined always gets pushed to the bottom (only applies to due date in practice)
    if sort_dir == 'desc'
        sort_default = -1e15
    else
        sort_default = 1e15

    hashtags = {}
    tasks.forEach (task, id) =>
        if task.get('done')
            new_counts.done    += 1
        if task.get('deleted')
            new_counts.deleted += 1

        editing_desc = local_tasks.getIn([id, 'editing_desc'])
        if not editing_desc and not is_visible(task, id)
            return

        desc = task.get('desc')
        if search_matches(search, desc) or editing_desc
            visible = 1  # tag of a currently visible task
            if id == current_task_id
                current_is_visible = true
            v.push([task.get(sort_key) ? sort_default, id])
        else
            visible = 0  # not a tag of any currently visible task

        for x in misc.parse_hashtags(desc)
            tag = desc.slice(x[0]+1, x[1]).toLowerCase()
            hashtags[tag] = Math.max(hashtags[tag] ? 0, visible)
        return

    if sort_dir == 'desc'
        v.sort (a,b) -> -misc.cmp(a[0], b[0])
    else
        v.sort (a,b) -> misc.cmp(a[0], b[0])

    visible = immutable.fromJS((x[1] for x in v))

    if (not current_task_id? or not current_is_visible) and visible.size > 0
        current_task_id = visible.get(0)
    else if not current_is_visible and visible.size == 0
        current_task_id = undefined

    if counts.get('done') != new_counts.done
        counts = counts.set('done', new_counts.done)
    if counts.get('deleted') != new_counts.deleted
        counts = counts.set('deleted', new_counts.deleted)

    obj =
        visible         : visible
        current_task_id : current_task_id
        counts          : counts
        hashtags        : immutable.fromJS(hashtags)
        search_desc     : search.join(' ')
        search_terms    : immutable.Set((x for x in search when x[0] != '#' and x[0] != '-'))
        nonhash_search  : immutable.List((x for x in search when x[0] != '#'))
    return obj