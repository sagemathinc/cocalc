# Functionality for sending emails

There are one or two SMTP endpoints to configure for sending email:

- Priority >= 0: sent immediately, using the primary SMTP interface
- Priority <0: deferred, sent in batches, using the secondary SMTP interface (if configured, fallback primary SMTP interface)
