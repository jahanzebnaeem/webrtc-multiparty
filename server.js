const express = require('express')
const app = express()
let http = require('http').Server(app)
let minimist = require('minimist')

let argv = minimist(process.argv.slice(2), {
  default: {
    as_uri: 'http//localhost:3000',
    ws_uri: 'ws://localhost:8888/kurento'
  }
})

app.use(express.static('public'))

http.listen(3000, () => {
  console.log('App is running')
})