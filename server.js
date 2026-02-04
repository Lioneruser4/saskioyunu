const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("."));

const rooms = {};

io.on("connection", socket => {

  socket.on("joinRoom", ({ roomId, user }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        owner: socket.id,
        players: {},
        started: false,
        phase: "lobby"
      };
    }

    rooms[roomId].players[socket.id] = {
      ...user,
      role: null,
      alive: true
    };

    io.to(roomId).emit("roomUpdate", rooms[roomId]);
  });

  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room) return;

    const ids = Object.keys(room.players);
    shuffle(ids);

    room.players[ids[0]].role = "mafia";
    room.players[ids[1]].role = "doctor";
    ids.slice(2).forEach(id => room.players[id].role = "citizen");

    room.started = true;
    room.phase = "night";

    io.to(roomId).emit("gameStarted", room);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      delete rooms[roomId].players[socket.id];
    }
  });

});

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

setInterval(() => {
  fetch("https://saskioyunu-1.onrender.com");
}, 30000);

server.listen(3000);
