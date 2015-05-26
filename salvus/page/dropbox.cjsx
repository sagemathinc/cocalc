# load dependencies asynchronously
exports.load = (element) ->
  jQuery.getScript 'https://fb.me/react-0.13.3.min.js', ->
    jQuery.getScript 'https://cdnjs.cloudflare.com/ajax/libs/dropbox.js/0.10.2/dropbox.min.js', ->
      DropboxButton = React.createClass
        authorize: ->
          client = new Dropbox.Client({ key: '4nkctd7tebtf3o9' })
          client.authDriver(new Dropbox.AuthDriver.Popup({
            receiverUrl: "https://dev.sagemath.com/static/dropbox_oauth_receiver.html"}))
          client.authenticate (error, client) ->
            if error
              console.log(error)
              return
            client.getAccountInfo (error, info) ->
              if error
                console.log(error)
                return
              alert("Hello, " + info.name + "!")
        render: ->
          <div className="dropbox-area">
            <button onClick={@authorize} className="btn btn-default btn-lg">Authorize with Dropbox</button>
          </div>
      React.render(<DropboxButton />, element)

