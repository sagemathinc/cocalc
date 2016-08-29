###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
# AUTHORS:
#    - Simon Luu
#    - Vivek Venkatachalam
###

# --SD81 VIDEO CHAT--
# This file consists of all the video chat stuff worked on at Sage Days 81
# Uses a SimpleWebRTC with require at ../../webapp-lib/webrtc/latest-v2.js
# The switching between main video feeds currently does not work.
# The broadcasting system does work though.

# standard non-SMC libraries
immutable = require('immutable')
{IS_MOBILE} = require('../feature')
underscore = require('underscore')

# SMC libraries
{Avatar, UsersViewingDocument} = require('../profile')
misc = require('smc-util/misc')
misc_page = require('../misc_page')
{defaults, required} = misc
{Markdown, TimeAgo, Tip} = require('../r_misc')
{salvus_client} = require('../salvus_client')
{synchronized_db} = require('../syncdb')

{alert_message} = require('../alerts')

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, Redux}  = require('../smc-react')
{Icon, Loading, TimeAgo} = require('../r_misc')
{Button, Col, Grid, Input, ListGroup, ListGroupItem, Panel, Row, ButtonGroup} = require('react-bootstrap')

{User} = require('../users')

# Grab the SimpleWebRTC library and wrap it to work smoothly for broadcasting.
require.ensure [], =>
    SimpleWebRTC = require('../../webapp-lib/webrtc/latest-v2.js')

    class SMCWebRTC extends SimpleWebRTC

        # callback signature: (err, stream) -> Any
        startBroadcast: (callback) ->
            @emit('startBroadcast')
            @webrtc.startLocalMedia(@config.media, callback)
            @sendToAll('start_broadcast')

        # handles the receipt of a new broadcast.
        handlePeerBroadcast: ->
            @leaveSMCRoom()
            @joinSMCRoom()
            console.log("Received a new inbound broadcast.")

        # Notify when users begin broadcast.
        _handleMessage: (msg) ->
            if msg.type is 'start_broadcast'
                @handlePeerBroadcast()

        # joins SMC Room
        joinSMCRoom: ->
            @joinRoom(@SMCRoomName)
            @connection.on('message', (x) => @_handleMessage(x))

        # leave SMC Room
        leaveSMCRoom: ->
            @leaveRoom(@SMCRoomName)

        # gets all remote media streams
        getPeerStreams: ->
            peer_streams = []
            peer_stream_id = []
            for x in @webrtc.peers
                if x.stream
                    if x.stream.id not in peer_stream_id
                        peer_streams.push(x.stream)
                        peer_stream_id.push(x.stream.id)
            return [peer_streams, peer_stream_id]

        getLocalStream: ->
            @webrtc.localStreams[0]

        getLocalStreamId: ->
            if @getLocalStream()
                @webrtc.localStreams[0].id
            else
                "No ID"

        getAllStreams: ->
            streams = {}
            local_stream = @getLocalStream()
            if local_stream?
                streams.localStream = local_stream
            streams.peerStreams = @getPeerStreams()[0]
            return streams

    window.SMCWebRTC = SMCWebRTC

# called ChatActions for now
# class ChatActions extends Actions
#     set_media_streams: (ms) =>
#         @setState(media_streams:ms)

VideoStream = rclass
    displayName: "VideoStream"

    propTypes:
        media_streams   : rtypes.object
        media_stream    : rtypes.object
        stream_id       : rtypes.string # Stream Id associated with the media stream
        local_stream_id : rtypes.string # Your stream id
        size            : rtypes.number # Size of media_stream list
        width           : rtypes.string
        actions         : rtypes.object
        reposition      : rtypes.func

    componentDidUpdate: ->
        # webrtc.on('videoAdded', @peer_added)
        if @props.media_stream.id is @props.local_stream_id
            ReactDOM.findDOMNode(@refs.localVideo).srcObject = @props.media_stream
        else
            ReactDOM.findDOMNode(@refs.remoteVideo).srcObject = @props.media_stream

    # peer_added: ->
    #     @forceUpdate()

    function: (e) ->
        #e.preventDefault()
        @props.reposition(@props.stream_id, @props.media_streams)

    render: ->
        if @props.size == 1
            if @props.media_stream.id is @props.local_stream_id
                <video hidden autoPlay onClick={@function} style={width:"291px", transform: "scaleX(-1)"} ref="localVideo" />
            else
                <video autoPlay onClick={@function} style={width:"291px"} ref="remoteVideo" />
        else
            if @props.media_stream.id is @props.local_stream_id
                <video autoPlay onClick={@function} style={width:@props.width, transform: "scaleX(-1)"} ref="localVideo" />
            else
                <video autoPlay onClick={@function} style={width:@props.width} ref="remoteVideo" />

VideoList = rclass
    displayName: "VideoList"

    propTypes:
        media_streams    : rtypes.object
        local_stream_id  : rtypes.string
        peer_stream_ids  : rtypes.array
        actions          : rtypes.object
        reposition       : rtypes.func

    getInitialState: ->
        stream_list : {}

    componentDidMount: ->
        webrtc.on('videoAdded', @peer_added)

    peer_added: ->
        @forceUpdate()

    # reposition_stream: (stream_id) ->
    #     clicked_media_stream = []
    #     @videoFeedList = {}
    #     for key, val of @props.media_streams
    #         if key is stream_id
    #             clicked_media_stream.push(val)
    #     @videoFeedList[stream_id] = clicked_media_stream[0]
    #     if webrtc.getAllStreams().peerStreams[0]
    #         for ids, i in webrtc.getPeerStreams()[1]
    #             if ids != stream_id
    #                 @videoFeedList[ids] = webrtc.getAllStreams().peerStreams[i]
    #     if webrtc.getLocalStream()
    #         if webrtc.getLocalStreamId() != stream_id
    #             @videoFeedList[webrtc.getLocalStreamId()] = webrtc.getAllStreams().localStream
        #return @videoFeedList
        #@setState(stream_list:@videoFeedList)
        #@props.actions.set_media_streams(@videoFeedList)

    video_content: ->
        first_video = []
        video_list = []
        media_stream_size = (k for own k of @props.media_streams).length
        is_first = true
        for key, val of @props.media_streams
            if is_first
                first_video.push <VideoStream key={key} actions={@props.actions} media_stream={val} stream_id={key} local_stream_id={@props.local_stream_id} size={media_stream_size} width={"291px"} reposition={@props.reposition} media_streams={@props.media_streams} />
                is_first = false
            else
                video_list.push <VideoStream key={key} actions={@props.actions} media_stream={val} stream_id={key} local_stream_id={@props.local_stream_id} size={media_stream_size} width={"45px"} reposition={@props.reposition} media_streams={@props.media_streams} />

        return [first_video, video_list]

    render: ->
        console.log("media props: ", @props.media_streams)
        <div>
            <div>
                <div style={overflowX:"auto"}>
                    {@video_content()[1]}
                </div>
                {@video_content()[0]}
            </div>
        </div>

exports.VideoChatRoom = VideoChatRoom = rclass
    displayName: "VideoChatRoom"

    propTypes:
        project_id       : rtypes.string.isRequired
        file_use_id      : rtypes.string.isRequired
        path             : rtypes.string
        redux            : rtypes.object
        actions          : rtypes.object

    getInitialState: ->
        media_streams : {}

    componentWillMount: ->
        webrtc = new SMCWebRTC
            autoRequestMedia : false

        webrtc.SMCRoomName = @props.path
        webrtc.joinSMCRoom()
        webrtc.on('videoAdded', @peer_added)
        window.webrtc = webrtc

    obtain_media_feeds: ->
        @videoFeedList = {}
        if webrtc.getAllStreams().peerStreams[0]
            for ids, i in webrtc.getPeerStreams()[1]
                @videoFeedList[ids] = webrtc.getAllStreams().peerStreams[i]
        if webrtc.getLocalStream()
            @videoFeedList[webrtc.getLocalStreamId()] = webrtc.getAllStreams().localStream
        @setState(media_streams:@videoFeedList)
        console.log("inside obtain_media_feeds: ", @state.media_streams)

    #on click
    reposition_stream: (stream_id, all_stream) ->
        @videoFeedList = {}
        clicked_media_stream = []
        for key, val of all_stream
            if key is stream_id
                clicked_media_stream.push(val)
        @videoFeedList[stream_id] = clicked_media_stream[0]
        if webrtc.getAllStreams().peerStreams[0]
            for ids, i in webrtc.getPeerStreams()[1]
                if ids != stream_id
                    @videoFeedList[ids] = webrtc.getAllStreams().peerStreams[i]
        if webrtc.getLocalStream()
            if webrtc.getLocalStreamId() != stream_id
                @videoFeedList[webrtc.getLocalStreamId()] = webrtc.getAllStreams().localStream
        @setState(media_streams:@videoFeedList)
        console.log("what is this: ", @videoFeedList)
        console.log("Inside reposition: ", @state.media_streams)
        #@setState(stream_list:@videoFeedList)
        #@props.actions.set_media_streams(@videoFeedList)

    peer_added: ->
        @obtain_media_feeds()
        @forceUpdate()

    # starts broadcast
    start_broadcast: ->
        webrtc.startBroadcast(@on_received_stream)

    on_received_stream: (err, stream) ->
        if err
            console.log("Error getting stream: ", err)
        else
            @forceUpdate()
            console.log("A new broadcast has been started")

    render: ->
        #video container
        <div>
            <Button onClick={@start_broadcast}>
                <Icon name='arrow-up'/> Start Video
            </Button>
            <VideoList actions={@props.actions} media_streams={@state.media_streams} local_stream_id={webrtc.getLocalStreamId()} peer_stream_ids={webrtc.getPeerStreams()[1]} reposition={@reposition_stream} />
        </div>

# render = (constraints) ->
#     <VideoChatRoom constraints={constraints} />

# exports.render = (dom_node, constraints) ->
#     ReactDOM.render(render(constraints), dom_node)