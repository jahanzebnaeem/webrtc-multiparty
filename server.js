const express = require('express')
const app = express()
let http = require('http').Server(app)
let minimist = require('minimist')
let io = require('socket.io')(http)
const kurento = require('kurento-client')
const { pipeline } = require('stream')

let kurentoClient = null
let iceCandidateQueues = {}

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

function joinRoom(socket, username, roomname, callback) {
  getRoom(socket, roomname, (err, myRoom) => {
    if (err) {
      return callback(err)
    }

    myRoom.pipeline.create('WebRtcEndpoint', (err, outgoingMedia) => {
      if (err) {
        return callback(err)
      }

      let user = {
        id: socket.id,
        name: username,
        outgoingMedia: outgoingMedia,
        incomingMedia: {}
      }

      let iceCandidateQueue = iceCandidateQueues[user.id]
      if (iceCandidateQueue) {
        while (iceCandidateQueue.length) {
          let ice = iceCandidateQueue.shift()
          user.outgoingMedia.addIceCandidate(ice.candidate)
        }
      }

      user.outgoingMedia.on('OnIceCandidate', event => {
        let candidate = kurento.register.complexTypes.IceCandidate(event.candidate)
        socket.emit('message', {
          event: 'candidate',
          userid: user.id,
          candidate: candidate
        })
      })

      socket.to(roomname).emit('message', {
        event: 'newParticipantArrived',
        userid: user.id,
        username: user.name
      })

      let existingUsers = []
      for(let i in myRoom.participants) {
        if(myRoom.participants[i].id != user.id) {
          existingUsers.push({
            id: myRoom.participants[i].id,
            name: myRoom.participants[i].name
          })
        }
      }

      socket.emit('message', {
        event: 'existingParticipants',
        existingUsers: existingUsers,
        userid: user.id
      })

      myRoom.participants[user.id] = user
    })
  })
}

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

function getEnpointForUser(socket, roomname, senderid, callback) {
  let myRoom = io.sockets.adapter.rooms.get(roomname)
  let asker = myRoom.participants[socket.id]
  let sender = myRoom.participants[senderid]

  if (asker.id === sender.id) {
    return callback(null, asker.outgoingMedia)
  }

  if (asker.incomingMedia[sender.id]) {
    sender.outgoingMedia.connect(asker.incomingMedia[sender.id], err => {
      if (err) return callback(err)
      callback(null, asker.incomingMedia[sender.id])
    })
  } else {
    myRoom.pipeline.create('WebRtcEndpoint', (err, incoming) => {
      if (err) {
        return callback(err)
      }

      asker.incomingMedia[sender.id] = incoming

      let iceCandidateQueue = iceCandidateQueues[sender.id]
      if (iceCandidateQueue) {
        while (iceCandidateQueue.length) {
          let ice = iceCandidateQueue.shift()
          user.incoming.addIceCandidate(ice.candidate)
        }
      }

      user.incoming.on('OnIceCandidate', event => {
        let candidate = kurento.register.complexTypes.IceCandidate(event.candidate)
        socket.emit('message', {
          event: 'candidate',
          userid: user.id,
          candidate: candidate
        })
      })

      sender.outgoingMedia.connect(asker.incoming, err => {
        if (err) return callback(err)
        callback(null, asker.incoming)
      })
    })
  }
}

function receiveVideoFrom(socket, userid, roomName, sdpOffer, callback) {
  getEnpointForUser(socket, roomName, userid, (err, endpoint) => {
    if (err) return callback (err)

    endpoint.processOffer(sdpOffer, (err, sdpAnswer) => {
      if (err) return callback(err)

      socket.emit('message', {
        event: 'receiveVideoAnswer',
        senderid: userid,
        sdpAnswer: sdpAnswer
      })

      endpoint.gatherCandidates(err => {
        if (err) return callback(err)
      })
    })
  })
}

function addIceCandidate(socket, senderid, roomName, iceCandidate, callback) {
  let user = io.sockets.adapter.rooms.get(roomName).participants[socket.id]
  if (user != null) {
    let candidate = kurento.register.complexTypes.IceCandidate(iceCandidate)
    if (senderid === user.id) {
      if(user.outgoingMedia) {
        user.outgoingMedia.addIceCandidate(candidate)
      } else {
        iceCandidateQueues[user.id].push({candidate: candidate})
      }
    } else {
      if (user.incomingMedia[senderid]) {
        user.incomingMedia[senderid].addIceCandidate(candidate)
      } else {
        if (!iceCandidateQueues[senderid]) {
          iceCandidateQueues[senderid] = []
        }
        iceCandidateQueues[senderid].push({candidate: candidate})
      }
    }
    callback(null)
  } else {
    callback(new Error("addIceCandidate failed"))
  }
}

app.use(express.static('public'))

http.listen(3000, () => {
  console.log('App is running')
})
