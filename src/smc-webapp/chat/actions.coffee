# 3rd Party Libraries
immutable = require('immutable')

# Internal Libraries
{Actions} = require('../app-framework')
{webapp_client} = require('../webapp_client')

{delay} = require('awaiting')

# Sibling Libraries

class ChatActions extends Actions
    _process_syncdb_obj: (x) =>
        if x.event != 'chat'
            # Event used to be used for video chat, etc...; but we have a better approach now, so
            # all events we care about are chat.
            return
        if x.video_chat?.is_video_chat
            # discard/ignore anything else related to the old old video chat approach
            return
        x.date = new Date(x.date)
        if x.history?.length > 0
            # nontrivial history -- nothing to do
        else if x.payload?
            # for old chats with payload: content (2014-2016)... plus the script @hsy wrote in the work project ;-(
            x.history = []
            x.history.push
                content   : x.payload.content
                author_id : x.sender_id
                date      : new Date(x.date)
            delete x.payload
        else if x.mesg?
            # for old chats with mesg: content (up to 2014)
            x.history = []
            x.history.push
                content   : x.mesg.content
                author_id : x.sender_id
                date      : new Date(x.date)
            delete x.mesg
        x.history ?= []
        if not x.editing
            x.editing = {}
        return x

    # Initialize the state of the store from the contents of the syncdb.
    init_from_syncdb: () =>
        v = {}
        for x in @syncdb.get().toJS()
            x = @_process_syncdb_obj(x)
            if x?
                v[x.date - 0] = x

        @setState
            messages : immutable.fromJS(v)

    _syncdb_change: (changes) =>
        messages_before = messages = @store.get('messages')
        if not messages?
            # Messages need not be defined when changes appear in case of problems or race.
            return
        changes.map (obj) =>
            obj.date = new Date(obj.date)
            record = @syncdb.get_one(obj)
            x = record?.toJS()
            if not x?
                # delete
                messages = messages.delete(obj.date - 0)
            else
                # TODO/OPTIMIZATION: make into custom conversion to immutable (when rewrite)
                x = @_process_syncdb_obj(x)
                if x?
                    messages = messages.set("#{x.date - 0}", immutable.fromJS(x))
        if not messages_before.equals(messages)
            @setState(messages: messages)

    send_chat: (mesg) =>
        if not @syncdb?
            # WARNING: give an error or try again later?
            return
        sender_id = @redux.getStore('account').get_account_id()
        time_stamp = webapp_client.server_time().toISOString()
        @syncdb.set
            sender_id : sender_id
            event     : "chat"
            history   : [{author_id: sender_id, content:mesg, date:time_stamp}]
            date      : time_stamp
        @setState(last_sent: mesg)
        @save()

    set_editing: (message, is_editing) =>
        if not @syncdb?
            # WARNING: give an error or try again later?
            return
        author_id = @redux.getStore('account').get_account_id()

        if is_editing
            # FUTURE: Save edit changes
            editing = message.get('editing').set(author_id, 'FUTURE')
        else
            editing = message.get('editing').set(author_id, null)

        # console.log("Currently Editing:", editing.toJS())
        @syncdb.set
            history : message.get('history').toJS()
            editing : editing.toJS()
            date    : message.get('date').toISOString()

    # Used to edit sent messages.
    # **Extremely** shockingly inefficient. Assumes number of edits is small.
    send_edit: (message, mesg) =>
        if not @syncdb?
            # WARNING: give an error or try again later?
            return
        author_id = @redux.getStore('account').get_account_id()
        # OPTIMIZATION: send less data over the network?
        time_stamp = webapp_client.server_time().toISOString()

        @syncdb.set
            history : [{author_id: author_id, content:mesg, date:time_stamp}].concat(message.get('history').toJS())
            editing : message.get('editing').set(author_id, null).toJS()
            date    : message.get('date').toISOString()
        @save()

    # Make sure verything is sent to the project **and** then saved to disk.
    save: =>
        @syncdb.commit()
        @syncdb.save_to_disk()

    set_to_last_input: =>
        @setState(input:@store.get('last_sent'))

    set_input: (input) =>
        @setState(input:input)

    saved_message: (saved_mesg) =>
        @setState(saved_mesg:saved_mesg)

    set_is_preview: (is_preview) =>
        @setState(is_preview:is_preview)

    set_use_saved_position: (use_saved_position) =>
        @setState(use_saved_position:use_saved_position)

    save_scroll_state: (position, height, offset) =>
        # height == 0 means chat room is not rendered
        if height != 0
            @setState(saved_position:position, height:height, offset:offset)

exports.ChatActions = ChatActions