# Historical HTTP contract

`openapi.json` and the fixtures document the retired HTTP API used as the
Firebase migration's behavior reference. They are not an active service
contract or a source for the current web data layer. The active web app uses
server-only trusted Firebase services and same-origin handlers for media,
exports, and realtime hints.
