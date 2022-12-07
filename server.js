const http = require("http"),
  express = require("express"),
  app = express(),
  socketIo = require("socket.io"),
  fs = require("fs"),
  cors = require('cors');

const server = http.Server(app).listen(5000),
  io = socketIo(server),
  clients = {};

const allowed_domain = "https://sage-toffee-de617f.netlify.app";

const path = './wins.json',
  nft_path = './nft_minted.json';

// Ban all requests not from our frontend
app.use(cors({
  'allowedHeaders': ['Content-Type'],
  'origin': allowed_domain,
  'methods': 'GET'
}));


// Ban requests from browser too
app.use('/*', (req, res, next) => {
  if (req.get('origin') === allowed_domain)
    next();
  else
    res.sendStatus(404);
});

// Save hashes for winners to show them in profile page
app.get('/save_tx', (req, res) => {
  let wins_arr = JSON.parse(fs.readFileSync(path, 'utf8'));

  if ([req.query.address] in wins_arr)
    wins_arr[req.query.address].push(req.query.txhash);
  else
    wins_arr[req.query.address] = [req.query.txhash];

  fs.writeFile(path, JSON.stringify(wins_arr, null, 2), (error) => {
    if (error)
      res.sendStatus(404);
  });

  res.sendStatus(200);
});

// Save ids for minter nfts by users
app.get('/save_mint', (req, res) => {
  let nft_arr = JSON.parse(fs.readFileSync(nft_path, 'utf8'));

  if ([req.query.address] in nft_arr)
    nft_arr[req.query.address] = {
      [req.query.wins_count]: req.query.token_id
    };
  else
    nft_arr[req.query.address] = {
      [req.query.wins_count]: req.query.token_id
    };

  fs.writeFile(nft_path, JSON.stringify(nft_arr, null, 2), (error) => {
    if (error)
      res.sendStatus(404);
  });

  res.sendStatus(200);
});

// Show wins hashes by user wallet address
app.get('/winner_hashes', (req, res) => {

  let wins_arr = JSON.parse(fs.readFileSync(path, 'utf8'));

  if ([req.query.address] in wins_arr)
    res.json({ result: JSON.stringify(wins_arr[req.query.address]) });
  else
    res.json({ result: [] });
})

// Show minter nfts ids
app.get('/minted', (req, res) => {
  let minted = JSON.parse(fs.readFileSync(nft_path, 'utf8'));

  if ([req.query.address] in minted)
    res.json({ result: JSON.stringify(minted[req.query.address]) });
  else
    res.json({ result: [] });
})

// New client connected
const addClient = socket => {
  current_player = socket.id
  clients[socket.id] = socket;
};

// Client disconnected
const removeClient = socket => {
  delete clients[socket.id];
};

io.sockets.on("connection", socket => {
  let id = socket.id;

  addClient(socket);

  socket.on("mousemove", data => {
    data.id = id;
    socket.broadcast.emit("moving", data);
  });

  socket.on("disconnect", () => {
    removeClient(socket);
    socket.broadcast.emit("clientdisconnect", id);
  });

});

var players = {},
  unmatched;

function joinGame(socket) {
  // Add the player to our object of players
  players[socket.id] = {
    /* The opponent will either be the socket that is
    currently unmatched, or it will be null if no
    players are unmatched */
    opponent: unmatched,

    // The symbol will become 'O' if the player is unmatched
    symbol: "X",

    // The socket that is associated with this player
    socket: socket
  };

  /* Every other player is marked as 'unmatched', which means
    there is not another player to pair them with yet. As soon
    as the next socket joins, the unmatched player is paired with
    the new socket and the unmatched variable is set back to null */
  if (unmatched) {
    players[socket.id].symbol = "O";
    players[unmatched].opponent = socket.id;
    unmatched = null;
  } else {
    unmatched = socket.id;
  }
}

// Returns the opponent socket
function getOpponent(socket) {
  if (!players[socket.id].opponent)
    return;

  return players[players[socket.id].opponent].socket;
}

io.on("connection", function (socket) {
  joinGame(socket);

  // Once the socket has an opponent, we can begin the game
  if (getOpponent(socket)) {
    socket.emit("game.begin", {
      symbol: players[socket.id].symbol
    });

    /* console.log(players[current_player])
    console.log("CURRENT PLAYER " + current_player) */

    getOpponent(socket).emit("game.begin", {
      symbol: players[getOpponent(socket).id].symbol
    });
  }

  /* Listens for a move to be made and emits an event to both
  players after the move is completed */
  socket.on("make.move", function (data) {
    if (!getOpponent(socket))
      return;

    socket.emit("move.made", data);
    getOpponent(socket).emit("move.made", data);
  });

  // Emit an event to the opponent when the player leaves
  socket.on("disconnect", function () {
    if (getOpponent(socket))
      getOpponent(socket).emit("opponent.left");
  });
});
