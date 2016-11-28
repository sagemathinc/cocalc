###############################################################################
#
#    SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, SageMath, Inc.
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

{alert_message} = require('./alerts')
{salvus_client} = require('./salvus_client')

# load dependencies asynchronously
exports.load = (element, project) ->
  # FUTURE: use require to load these if we decide to go with react.
  jQuery.getScript 'https://fb.me/react-0.13.3.min.js', ->
    jQuery.getScript 'https://cdnjs.cloudflare.com/ajax/libs/dropbox.js/0.10.2/dropbox.min.js', ->
      DropboxFolderSelector = React.createClass
        getInitialState: ->
          {  # SMELL: probably don't need these braces.
            selected: null
            new_folder: "something"
          }

        click: (folder) ->
          =>
            @props.setFolderSelection(folder)

        newFolder: ->
          @props.newFolder(@state.new_folder)

        onNewFolderChange: (event) ->
          @setState { new_folder: event.target.value }

        render: ->
          folders = @props.folders.map (folder) => <li onClick={@click(folder)} className="list-group-item">{folder}</li>

          <div>
            <div>
              <form>
                <div className="form-group">
                  <label>Create a new folder in your Dropbox account to sync to your project</label>
                  <input onChange={@onNewFolderChange} className="form-control" type="text" name="new-folder" value={@state.new_folder} />
                </div>
                <button type="button" className="btn btn-default" onClick={@newFolder}>Create</button>
             </form>
            </div>
            <hr />
            <div>
             <p>Or, please select a folder from <tt>{@props.folderPath}</tt></p>
             <ul className="list-group">
               {folders}
             </ul>
            </div>
          </div>

      DropboxButton = React.createClass
        authorize: ->
          # The key below is the Dropbox public key that you register with Dropbox to get.
          # FUTURE: replace with wstein's key
          client = new Dropbox.Client({ key: '4nkctd7tebtf3o9' })
          client.authDriver(new Dropbox.AuthDriver.Popup({
            receiverUrl: "https://dev.sagemath.com/static/dropbox_oauth_receiver.html"}))
          client.authenticate (error, client) =>
            if error
              console.log(error)
              return
            @props.setClient(client)
        render: ->
          <div className="smc-dropbox-area">
            <button onClick={@authorize} className="btn btn-default btn-lg">Authorize with Dropbox</button>
          </div>

      DropboxSection = React.createClass
        getInitialState: ->
          {
            client: null
            authorized: false
            folders: []
            folderPath: null
            processing: false
          }
        readFolder: (path) ->
          @state.client.readdir path, null, (error, files, stat, stats) =>
            folders = stats.filter((entry) -> entry.isFolder).map((entry) -> entry.path)
            @setState { folderPath: path, folders: folders }
        setClient: (client) ->
          @setState { client: client, authorized: true }, ->
            @readFolder('/')
        setFolderSelection: (path) ->
          # we're done... so send this to the backend
          console.log("Sending folder", path, "to backend")
          @setState { processing: true }
          salvus_client.update_project_data
            project_id : project.project_id
            data       : {dropbox_folder: path, dropbox_token: @state.client.credentials().token}
            cb         : (err, mesg) ->
                if err
                    alert_message(type:'error', message:"Error contacting server to save dropbox settings.")
                else if mesg.event == "error"
                    alert_message(type:'error', message:mesg.error)
                else
                  # success!
                  # ....
                  alert("okay")

        newFolder: (folder) ->
          @setState { processing: true }
          console.log("Creating new folder", folder)
          path = @state.folderPath + '/' + folder
          @state.client.mkdir path, (error, stat) =>
            if error
              alert(error)
              return
            @setFolderSelection(path)
        render: ->
          if @state.processing
            <div>Processing <span className="fa fa-spin fa-refresh" /></div>
          else if @state.authorized
            <DropboxFolderSelector client={@state.client} folders={@state.folders} folderPath={@state.folderPath}
              setFolderPath={@readFolder} setFolderSelection={@setFolderSelection} newFolder={@newFolder} />
          else
            <DropboxButton setClient={@setClient} />

      ReactDOM.render(<DropboxSection />, element)

