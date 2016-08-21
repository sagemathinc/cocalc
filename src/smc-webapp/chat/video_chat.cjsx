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

# Events required to sync a broadcast:
#
#  1.

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
            console.log("Received a new inbound broadcast.")
            @getAllStreams()

        # Notify when users begin broadcast.
        _handleMessage: (msg) ->
            if msg.type is 'start_broadcast'
                @handlePeerBroadcast()

        # joins SMC Room
        joinSMCRoom: ->
            @joinRoom(@SMCRoomName)
            @connection.on('message', (x) => @_handleMessage(x))

        leaveSMCRoom: ->
            @leaveRoom(@SMCRoomName)

        # gets all remote media streams
        getPeerStreams: () ->
            # [x.stream for x in @webrtc.peers]
            window.peerstreams = @webrtc.peers
            streams = (x for x in @webrtc.peers)
            console.log("webrtc peer streams: ", streams)

            return streams

        getLocalStream: ->
            @webrtc.localStreams[0]

        getAllStreams: ->
            streams = []
            streams = @getPeerStreams()
            local_stream = @getLocalStream()
            if local_stream?
                streams.push(local_stream)
            return streams

    window.SMCWebRTC = SMCWebRTC


VideoFeed = rclass
    displayName: "VideoFeed"

    propTypes:
        local_feed    : rtypes.object
        remote_feeds  : rtypes.object

    shouldComponentUpdate: (next) ->
        return @props.local_feed != next.local_feed or
               @props.remote_feed != next.remote_feed


    componentDidUpdate: ->
        if @props.local_feed.size > 0
            ReactDOM.findDOMNode(@refs.testing).srcObject = @props.local_feed.first()

    video_content: ->
        <video autoPlay style={width:"291px", transform: "scaleX(-1)"} ref="testing" id="test"></video>

    render: ->
        <div>
            {@video_content()}
        </div>

exports.VideoChatRoom = VideoChatRoom = rclass
    displayName: "VideoChatRoom"

    propTypes:
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        path        : rtypes.string

    componentWillMount: ->
        webrtc = new SMCWebRTC
            autoRequestMedia : false

        webrtc.SMCRoomName = "SMCDAYS81"
        webrtc.joinSMCRoom()
        window.webrtc = webrtc
        # webrtc.on('videoAdded', @add_peer)
        # webrtc.on('createdPeer', @add_peer2)
        @new_stream_object = immutable.List()
        @remote_feed_object = immutable.List()

    # componentDidMount: ->
    #     @temp_feed_object = immutable.List()
    #     size = webrtc.webrtc.peers.length
    #     console.log("size of peers", size)
    #     if size > 0
    #         for x in [0, 1]
    #             console.log("peer stream: ", webrtc.webrtc.peers[x].stream)
    #             if webrtc.webrtc.peers[x].stream
    #                 @temp_feed_object = @remote_feed_object.push(webrtc.webrtc.peers[x].stream)
    #                 @forceUpdate()
        #@new_stream_object = @stream_object.push(webrtc.webrtc.peers[0].stream)

#     add_peer: (videoEl, peer) ->
#         console.log("add_peer",videoEl)
#         console.log("add_peer",peer)

#     add_peer2: (peer) ->
#         console.log("add_peer2",peer)

    #grabs local stream
    start_broadcast: ->
        webrtc.startBroadcast(@on_received_stream)
        webrtc.joinSMCRoom()
        @forceUpdate()

    add_local_stream: ->
        @stream_object = immutable.List()
        @new_stream_object = @stream_object.push(webrtc.webrtc.localStreams[0])
        # webrtc.leaveSMCRoom()
        @forceUpdate()

    on_received_stream: (err, stream) ->
        if err
            console.log("Error getting stream: ", err)
        else
            @add_local_stream()

    render: ->
        #video container
        <div>
            <Button onClick={@start_broadcast}>
                <Icon name='arrow-up'/> Start Video
            </Button>
            <VideoFeed local_feed={@new_stream_object} remote_feed={@new_stream_object} />
        </div>

render = (constraints) ->
    <VideoChatRoom constraints={constraints} />

exports.render = (dom_node, constraints) ->
    ReactDOM.render(render(constraints), dom_node)