import { defineMessages } from "react-intl";

export const MSGS = defineMessages({
  mentions: {
    id: "notifications.nav.mentions",
    defaultMessage: "Mentions",
  },
  unread: {
    id: "notifications.nav.unread",
    defaultMessage: "Unread",
    description: "Label for unread messages",
  },
  read: {
    id: "notifications.nav.read",
    defaultMessage: "Read",
    description: "Label for messages that have been read",
  },
  saved: {
    id: "notifications.nav.saved",
    defaultMessage: "Saved for Later",
    description: "Label for messages saved for later",
  },
  all: {
    id: "notifications.nav.all",
    defaultMessage: "All Mentions",
  },
  news: {
    id: "notifications.nav.news",
    defaultMessage: "News",
  },
  allNews: {
    id: "notifications.nav.allNews",
    defaultMessage: "All News",
  },
  mark_all: {
    id: "notifications.news.mark_all.label",
    defaultMessage:
      "{anyUnread, select, true {Mark all Read} other {Mark all Unread}}",
    description: "Short label on a button to mark messages as unread",
  },
  read_all: {
    id: "notifications.news.read_all.label",
    defaultMessage: "Read All",
    description: "Short label on a button to mark all messages as read",
  },
});
