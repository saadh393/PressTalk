
const fs = require('fs');
const http = require('http');
const https = require('https')
const express = require('express');
const path = require('path');
const app = express();
const socketio = require('socket.io');
const getLocalIpAddress = require('./server/util/getIpAddress');
app.use(express.static(__dirname))


//we need a key and cert to run https
//we generated them with mkcert
// $ mkcert create-ca
// $ mkcert create-cert
const key = fs.readFileSync(path.join(__dirname, './server/cert.key'));
const cert = fs.readFileSync(path.join(__dirname, './server/cert.crt'));

//we changed our express setup so we can use https
//pass the key and cert to createServer on https
const expressServer = https.createServer({ key, cert }, app);

// HTTP server to redirect HTTP to HTTPS
const httpServer = http.createServer((req, res) => {
    // Redirect any request to the HTTPS server
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
});

//create our socket.io server... it will listen to our express port
const IP_ADDRESS = getLocalIpAddress();
const io = socketio(expressServer, {
    cors: {
        origin: [
            // "https://localhost",
            // 'https://LOCAL-DEV-IP-HERE' //if using a phone or another computer
            `https://${IP_ADDRESS}`,
        ],
        methods: ["GET", "POST"]
    }
});

//offers will contain {}
const offers = [
    // offererUserName
    // offer
    // offerIceCandidates
    // answererUserName
    // answer
    // answererIceCandidates
];
const connectedSockets = [
    //username, socketId
]

io.on('connection', (socket) => {
    // console.log("Someone has connected");
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if (password !== "x") {
        socket.disconnect(true);
        return;
    }


    const index = connectedSockets.findIndex(s => s.userName === userName)

    if (index !== -1) {
        connectedSockets[index].socketId = socket.id;
        
    }else{
        connectedSockets.push({
            socketId: socket.id,
            userName
        })
    }

    io.emit('connectedUsers', connectedSockets)

    //a new client has joined. If there are any offers available,
    //emit them out
    if (offers.length) {
        socket.emit('availableOffers', offers);
    }

    socket.on('newOffer', newOffer => {
        offers.push({
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        })
        // console.log(newOffer.sdp.slice(50))
        //send out to all connected sockets EXCEPT the caller
        socket.broadcast.emit('newOfferAwaiting', offers.slice(-1))
    })

    socket.on('newAnswer', (offerObj, ackFunction) => {
        console.log("newAnswer");
        //emit this answer (offerObj) back to CLIENT1
        //in order to do that, we need CLIENT1's socketid
        const socketToAnswer = connectedSockets.find(s => s.userName === offerObj.offererUserName)
        if (!socketToAnswer) {
            console.log("No matching socket")
            return;
        }
        //we found the matching socket, so we can emit to it!
        const socketIdToAnswer = socketToAnswer.socketId;
        //we find the offer to update so we can emit it
        const offerToUpdate = offers.find(o => o.offererUserName === offerObj.offererUserName)
        if (!offerToUpdate) {
            console.log("No OfferToUpdate")
            return;
        }
        //send back to the answerer all the iceCandidates we have already collected
        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer
        offerToUpdate.answererUserName = userName
        //socket has a .to() which allows emiting to a "room"
        //every socket has it's own room
        socket.to(socketIdToAnswer).emit('answerResponse', offerToUpdate)
    })

    socket.on('sendIceCandidateToSignalingServer', iceCandidateObj => {
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        console.log("sendIceCandidateToSignalingServer");
        if (didIOffer) {
            //this ice is coming from the offerer. Send to the answerer
            const offerInOffers = offers.find(o => o.offererUserName === iceUserName);
            if (offerInOffers) {
                offerInOffers.offerIceCandidates.push(iceCandidate)
                // 1. When the answerer answers, all existing ice candidates are sent
                // 2. Any candidates that come in after the offer has been answered, will be passed through
                if (offerInOffers.answererUserName) {
                    //pass it through to the other socket
                    const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.answererUserName);
                    if (socketToSendTo) {
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate)
                    } else {
                        console.log("Ice candidate recieved but could not find answere")
                    }
                }
            }
        } else {
            //this ice is coming from the answerer. Send to the offerer
            //pass it through to the other socket

            const offerInOffers = offers.find(o => o.answererUserName === iceUserName);
            const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.offererUserName);
            if (socketToSendTo) {
                socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate)
            } else {
                console.log("Ice candidate recieved but could not find offerer")
            }
        }
        // console.log(offers)
    })

    socket.on("hangup", (info) => {
        console.log("hangup", info)
        const offerIndex = offers.findIndex(o => o.offererUserName === info.from || o.answererUserName === info.from)
        if (offerIndex !== -1) {
           offers.splice(offerIndex, 1)

            // emit to that user to hangup
            const socketToHangup = connectedSockets.find(s => s.userName === info.from)
            if (socketToHangup) {
                socket.to(socketToHangup.socketId).emit('hangup', info)
            }
        }
    })

    socket.on("disconnect", x => {
        console.log("disconnect", x)
    })



})



expressServer.listen(8181, () => {
    console.log(`Server is Connected to https://${IP_ADDRESS}:8181/`)
});
httpServer.listen(80, () => {
    console.log('HTTP Server running on port 80 and redirecting to HTTPS');
});