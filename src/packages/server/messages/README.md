# Messaging

See util/db-schema/messages.ts for the database schema.

See frontend/messages for the frontend client app.

There could eventually be a lot here related to messages,
since we are also going to build a support system around this.
However, for now it is really simple.

## Maintenance

- periodically delete messages that are marked for deletion

- if user has an email on file, send out an email about their new unread messages.

## Server functionality

A function that takes as input:

- account_id
- subject
- body (formatted as markdown)

then does the following:

- if the user has email configured, sends an email to the user with the markdown converted to html
- creates a message to the user from "cocalc".

## Admin/monitoring functionality

A function to make it easy to notify the admins if something should be investigated. It sends a message to all admins...
