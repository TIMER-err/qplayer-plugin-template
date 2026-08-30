"use strict";

/**
 * Every capability declared in plugin.json must have a same-named handler.
 * A handler may return its value directly or return a Promise.
 */
module.exports = {
  handlers: {
    searchSongs: function (args) {
      var query = String(args && args.query || "").trim();
      var cursor = String(args && args.cursor || "");
      var limit = Math.max(1, Math.min(Number(args && args.limit || 50), 100));

      // Replace this with a provider request and map native results to QPlayer's
      // source-neutral Song DTO. IDs returned here are provider-native; QPlayer
      // qualifies them as <plugin-id>:song:<native-id> at the host boundary.
      void query;
      void cursor;
      void limit;
      return {items: [], nextCursor: "", hasMore: false};
    }
  }
};
