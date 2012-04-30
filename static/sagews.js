/* 

sagews -- basic javascript client library for the sage workspace server

AUTHOR: 
   - William Stein
*/


/* Namespace for the application */
var sagews = {};

sagews.test = function (mesg) {
    alert(mesg);
}

sagews.Client = function(server) {

  get = function(url, callback) {
      $.getJSON(server + '/' + url, '', function(response, status) { callback(response); });
  }

  post = function(url, vars, callback) {
      $.post(server + '/' + url, vars, function(response, status) { callback(response); }, 'json');
  }

  return {

  /* All Sessions */

    /* kill processes and delete everything about all sessions */
    close_all_sessions: function(callback) { get('close_all_sessions', callback); }, 

    /* much information about all sessions */
    sessions: function(callback) { get('sessions', callback); }, 
    
  /* Session Management: creating, interrupting, killing and deleting */

    /* create a new session */
    new_session: function(callback) { get('new_session', callback); },

    /* send interrupt signal to session with given id */
    sigint: function(session_id, callback) { get('sigint/' + session_id, callback); },

    /* kill session with given id */
    sigkill: function(session_id, callback) { get('sigkill/' + session_id, callback); },

    /* kill process and remove all files for session with given id */
    close_session: function(session_id, callback) { get('close_session/' + session_id, callback); },

  /* Session Information: */

    /* extensive information about a given session */
    session: function(session_id, callback) { get('session/' + session_id, callback); },
    
    /* get status of session with given id: 'ready', 'running', 'dead' */
    status: function(session_id, callback) { get('status/' + session_id, callback); },

    /* list of cells in a given session */
    cells: function(session_id, callback) { get('cells/' + session_id, callback); },

  /* Code execution */

    /* execute block of code */    
    execute: function(session_id, code, callback) { post('execute/' + session_id, {'code':code}, callback); },

    /* incremental output produced when executing code */
    output_messages: function(session_id, cell_id, number, callback) { 
        get('output_messages/' + session_id + '/' + cell_id + '/' + number, callback);
    }, 

  /* Files: uploading, downloading, deleting and listing */

    /* return list of all files in the given session */
    files: function(session_id, callback) { get('files/' + session_id, callback); }, 

    /* put a file or files into the given session */
    put_file: function(session_id, files, callback) { put('put_file/' + session_id, files, callback); },

    /* get a file from the given session */
    get_file: function(session_id, path, callback) { get('get_file/' + session_id + '/' + path, callback); },

    /* delete a file from the session */
    delete_file: function(session_id, path, callback) { get('delete_file/' + session_id + '/' + path, callback); }

  };
}


/* 

Testing Javascript console code:

foo = sagews.Client('http://localhost:5000')

foo.sessions( function(m) { z = m.sessions; } )

z[0].status
"ready"
z.length

*/