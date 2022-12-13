The code in here involves using the more client-side syncdb.

This is reflected in the file itself (and TimeTravel). It stores information about views and also an audit log about what users do and chats about records (TODO -- not implemented yet). All changes made to this syncdb are sync'd in realtime across all users that have this `.crm` file open.

Note that the actual changes are stored temporarily (and immutably) in the
backend PostgreSQL database in the patches table.
