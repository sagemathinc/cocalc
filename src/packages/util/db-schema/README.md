# Database Schema

The files here define permissions and tables for our database.

The most important tables are:

- accounts: id's and information about all registered users
- projects: id's and information (e.g., who can use) all projects
- public\_paths: which paths in projects are public
- server\_settings: how the server is configured
- site\_licenses: all the site licenses that people have bought

I think that if we had just those and nothing else then we could recreate the site, and only loose the history of editing files, the logs from what has happened in projects, and all analytics.
