"use strict";

const HTML = {
  ID: "id",
  STRONG_START: "<strong>",
  STRONG_END: "</strong>"
};
Object.freeze(HTML);

const Settings = {
  MAX_DISPLAY_TITLE_LEN: 5,
  CONTENT_PRE: 40,
  CONTENT_POST: 40,
  INIT_PROGRESS_CHECK: 100
};
Object.freeze(Settings);

const DB = {
  DB_NAME: "bookmark-content",
  URL: "url",
  TITLE: "title",
  CONTENT: "content"
};
Object.freeze(DB);
