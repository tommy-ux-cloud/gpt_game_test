# PeerJS 1.5.5

`peerjs.min.js` is the pinned, bundled browser client from
https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js . Only its source-map
comment is removed. MIT license: `PEERJS-LICENSE.txt`; the offline HTML retains it.

The library is local and makes no connection until a player creates or joins a
room. Its free public PeerServer supplies signaling; game state travels over
WebRTC DataChannels. `room-network.js` retains the public STUN/TURN configuration supplied by
PeerJS 1.5.5 and adds TCP relay candidates. These are upstream public settings,
not private credentials; public service availability is not guaranteed. No npm installation is needed
for the game or GitHub Pages.
