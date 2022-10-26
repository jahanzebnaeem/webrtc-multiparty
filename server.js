const express = require('express')
const app = express()
let http = require('http').Server(app)
let minimist = require('minimist')
let io = require('socket.io')(http)
const kurento = require('kurento-client')
const { pipeline } = require('stream')

let kurentoClient = null

let argv = minimist(process.argv.slice(2), {
  default: {
    as_uri: 'http//localhost:3000',
    ws_uri: 'ws://localhost:8888/kurento'
  }
})

io.on('connection', socket => {
  socket.on('message', message => {
    switch(message.event) {
      case 'joinRoom':
        joinRoom(socket, message.userName, message.roomName, err => {
          if (err) {
            console.log(err)
          }
        })
        break
      case 'receiveVideoFrom':
        receiveVideoFrom(socket, message.userid, message.roomName, message.sdpOffer, err => {
          if (err) {
            console.log(err)
          }
        })
        break
      case 'candidate':
        addIceCandidate(socket, message.userid, message.roomName, message.candidate, err => {
          if (err) {
            console.log(err)
          }
        })
        break
    }
  })
})

function getKurentoClient(callback) {
  if (kurentoClient !== null) {
    return callback(null, kurentoClient)
  }

  kurento(argv.ws_uri, (err, _kurentoClient) => {
    if (err) {
      console.log(err)
      return callback(err)
    }
    kurentoClient = _kurentoClient
    callback(null, kurentoClient)
  })
}

function getRoom (socket, roomname, callback) {
  let myRoom = io.sockets.adapter.rooms.get(roomname) || {size: 0}
  let numClients = myRoom.size

  if(numClients == 0) {
    socket.join(roomname, () => {
      myRoom = io.sockets.adapter.rooms.get(roomname)
      getKurentoClient((err, kurento) => {
        kurento.create('MediaPipeline', (err, pipeline) => {
          myRoom.pipeline = pipeline
          myRoom.participants = {}
          callback(null, myRoom)
        })
      })
    })
  } else {
    socket.join(roomname)
    callback(null, myRoom)
  }
}

app.use(express.static('public'))

http.listen(3000, () => {
  console.log('App is running')
})
