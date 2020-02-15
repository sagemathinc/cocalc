# 3rd Party Libraries
immutable = require('immutable')
sha1 = require("sha1");

# Internal Libraries
{user_tracking} = require('../user-tracking')
{Actions} = require('../app-framework')
{webapp_client} = require('../webapp_client')

{delay} = require('awaiting')

{ IS_MOBILE, isMobile } = require("../feature")

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
        @setState({last_sent: mesg, search:""})
        # NOTE: we clear search, since it's very confusing to send a message and not even see it (if it doesn't match search).
        # NOTE: further that annoyingly the search box isn't controlled so the input isn't cleared, which is also confusing. todo -- fix.
        @save()
        @set_input('')
        user_tracking("send_chat", {project_id:@syncdb.project_id, path:@syncdb.path})

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

    # Make sure everything is sent to the project.
    save: =>
        @syncdb.commit()
        await @syncdb.save()

    # Make sure everything saved to DISK.
    save_to_disk: =>
        this.setState(is_saving:true)
        await @syncdb.save_to_disk()
        this.setState(is_saving:false)

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

    set_unsent_user_mentions: (user_mentions = immutable.List(), message_plain_text = "") =>
        @setState(unsent_user_mentions: user_mentions, message_plain_text: message_plain_text)

    submit_user_mentions: (project_id, path) =>
        CONTEXT_SIZE = 80
        account_store = @redux.getStore('account')
        if account_store == undefined
            return
        @store.get('unsent_user_mentions').map((mention) =>
            end_of_mention_index = mention.get('plainTextIndex') + mention.get('display').length
            end_of_context_index = end_of_mention_index + CONTEXT_SIZE

            # Add relevant ellpises depending on size of full message
            description = ""
            if mention.get('plainTextIndex') != 0
                description = "... "
            description += @store.get('message_plain_text').slice(end_of_mention_index, end_of_context_index).trim()
            if end_of_context_index < @store.get('message_plain_text').length
                description += " ..."

            webapp_client.mention({
                project_id: project_id
                path: path
                target: mention.get('id')
                priority: 2
                description: description
                source: account_store.get_account_id()
            })
        )
        @setState(unsent_user_mentions: immutable.List())

    save_scroll_state: (position, height, offset) =>
        # height == 0 means chat room is not rendered
        if height != 0
            @setState(saved_position:position, height:height, offset:offset)

    show: =>
        if (not IS_MOBILE or isMobile.Android()) and @name
            # TODO: The chat is shown, but it might already have been mounted,
            # so we must manually autofocus the input box.
            # We use sha1 for uniqueness of id and it being a simple string.
            await delay(0)
            $("#" + sha1(@name)).focus()

exports.ChatActions = ChatActions