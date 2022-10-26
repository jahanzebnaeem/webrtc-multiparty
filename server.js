const express = require('express')
const app = express()
let http = require('http').Server(app)
let minimist = require('minimist')
let io = require('socket.io')(http)

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

app.use(express.static('public'))

http.listen(3000, () => {
  console.log('App is running')
})
