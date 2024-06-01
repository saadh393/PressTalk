let socket = null;
let userName;
const password = "x";

(async () => {
    userName = await getUserNameDialog(["name1", "name2", "name3"]);
    window.ROOM_USER_NAME = userName
    const IP_ADDRESS = await getIpAddressDialog();
    window.IP = IP_ADDRESS

    // Authorizing with Socket
    socket = io.connect(IP_ADDRESS, {
        auth: {
            userName, password
        }
    });

    socket.on('connect',async data => {
        renderMetaInfo();
    })

    socket.on('availableOffers', offers => {
        createOfferEls(offers)
    })
    
    //someone just made a new offer and we're already here - call createOfferEls
    socket.on('newOfferAwaiting', offers => {
        createOfferEls(offers)
    })
    
    socket.on('answerResponse', offerObj => {
        console.log("answerResponse", offerObj)
        addAnswer(offerObj)
    })
    
    socket.on('receivedIceCandidateFromServer', iceCandidate => {

    })

    socket.on("connectedUsers", c => renderConnectedUsers(c))

    socket.on("hangup", (connectedWith) => {
        // console.log(connectedWith)
        // document.getElementById("hangup-"+connectedWith).style.display = "none"
    })
    
    function createOfferEls(offers) {
        const answerEl = document.querySelector('#answer');

        offers.forEach(o => {
            if(o.offer.to == window.ROOM_USER_NAME){
                answerOffer(o)
                console.log("window.ROOM_USER_NAME", o)
                document.getElementById("hangup-"+o.offererUserName).style.display = "block"
            }
        })
    
        // offers.forEach(o => {
        //     const newOfferEl = document.createElement('div');
        //     newOfferEl.innerHTML = `<button class="btn btn-success col-1">Awaiting Call of ${o.offererUserName}</button>`
        //     newOfferEl.addEventListener('click', () => answerOffer(o))
        //     answerEl.appendChild(newOfferEl);
        // })
    }
})()




// document.querySelector('#user-name').innerHTML = userName;

//if trying it on a phone, use this instead...
// const socket = io.connect('https://LOCAL-DEV-IP-HERE:8181/',{


const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');

const localAudioEl = document.querySelector('#local-audio');
const remoteAudioEl = document.querySelector('#remote-audio');
const canvas = document.querySelector('#visualizer');
const canvasCtx = canvas.getContext('2d');

let localStream; //a var to hold the local video stream
let remoteStream; //a var to hold the remote video stream
let peerConnection; //the peerConnection that the two clients use to talk
let didIOffer = false;
let callInProgress = false; // flag to check if call is in progress
let audioCtx;
let analyser;

let peerConfiguration = {
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}

//when a client initiates a call
const call = async (to) => {
    console.log('Calling...')
    callInProgress = true;
    await fetchUserMedia();

    //peerConnection is all set with our STUN servers sent over
    await createPeerConnection();

    //create offer time!
    try {
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        offer.to = to
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        document.getElementById("hangup-"+to).style.display = "block"
        socket.emit('newOffer', offer); //send offer to signalingServer
    } catch (err) {
        console.log(err)
    }

}

const hangup = (connectedWith) => {
    console.log('Hanging up the call...');

    // Stop all local media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    // Close the peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Reset state variables
    localStream = null;
    remoteStream = null;
    didIOffer = false;
    callInProgress = false;

    // Clear video elements
    // localVideoEl.srcObject = null;
    // remoteVideoEl.srcObject = null;

    // Clear canvas
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    // Clear audio elements
    localAudioEl.srcObject = null;
    remoteAudioEl.srcObject = null;


    // Notify the other peer (optional, depending on your signaling server implementation)
    console.log("Hanging up with ", connectedWith)
    document.getElementById("hangup-"+connectedWith).style.display = "none"
    socket.emit('hangup', { connectedWith });
};

const answerOffer = async (offerObj) => {
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); //just to make the docs happy
    await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc

    // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
    //add the answer to the offerObj so the server knows which offer this is related to
    offerObj.answer = answer
    //emit the answer to the signaling server, so it can emit to CLIENT1
    //expect a response from the server with the already existing ICE candidates
    const offerIceCandidates = await socket.emitWithAck('newAnswer', offerObj)
    offerIceCandidates.forEach(c => {
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
}

const addAnswer = async (offerObj) => {
    //addAnswer is called in socketListeners when an answerResponse is emitted.
    //at this point, the offer and answer have been exchanged!
    //now CLIENT1 needs to set the remote
    await peerConnection.setRemoteDescription(offerObj.answer)
    // console.log(peerConnection.signalingState)
}

const fetchUserMedia = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true,
            });
            // localVideoEl.srcObject = stream;
            localAudioEl.srcObject = stream;
            localAudioEl.muted = true; // Mute the local audio element
            localStream = stream;
            resolve();
        } catch (err) {
            console.log(err);
            reject()
        }
    })
}


const createPeerConnection = (offerObj) => {
    return new Promise(async (resolve, reject) => {
        //RTCPeerConnection is the thing that creates the connection
        //we can pass a config object, and that config object can contain stun servers
        //which will fetch us ICE candidates
        peerConnection = await new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        // remoteVideoEl.srcObject = remoteStream;
        remoteAudioEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track => {
            //add localtracks so that they can be sent once the connection is established
            peerConnection.addTrack(track, localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {

        });

        peerConnection.addEventListener('icecandidate', e => {
            if (e.candidate) {
                socket.emit('sendIceCandidateToSignalingServer', {
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })
            }
        })

        peerConnection.addEventListener('track', e => {
            console.log("Got a track from the other peer!! How excting")

            e.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track, remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })

            // Only set up the audio context and analyser after confirming the remote stream has an audio track
            if (e.track.kind === 'audio') {
                setupAudioContext();
            }
        })

        peerConnection.addEventListener('iceconnectionstatechange', e => {
            console.log("ICE connection state change: ", peerConnection.iceConnectionState)
            if (peerConnection.iceConnectionState === 'disconnected') {
                console.log("Disconnected")
                hangup()
            }
        })

        if (offerObj) {
            //this won't be set when called from call();
            //will be set when we call from answerOffer()
            // console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
            await peerConnection.setRemoteDescription(offerObj.offer)
            // console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
        }
        resolve();
    })
}

const setupAudioContext = () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(remoteStream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Function to draw the audio visualization
    const draw = () => {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = 'rgb(255, 255, 255)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i];

            canvasCtx.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)';
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth + 1;
        }
    };

    draw();
};

const addNewIceCandidate = iceCandidate => {
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
}



// document.querySelector('#call').addEventListener('click', call)
// document.querySelector('#push-to-talk').addEventListener('click', (e) => {
//     if (callInProgress) {
//         hangup()
//         e.target.style.backgroundColor = 'red';
//     } else {
//         call()
//         e.target.style.backgroundColor = 'green';
//     }
// })