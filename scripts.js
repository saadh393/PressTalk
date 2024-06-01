getIpAddressDialog()

const userName = "Rob-" + Math.floor(Math.random() * 100000)
const password = "x";
document.querySelector('#user-name').innerHTML = userName;

//if trying it on a phone, use this instead...
// const socket = io.connect('https://LOCAL-DEV-IP-HERE:8181/',{
const socket = io.connect('https://192.168.0.103:8181/', {
    auth: {
        userName, password
    }
})

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
const call = async e => {
    console.log('Calling...')
    callInProgress = true;
    await fetchUserMedia();

    //peerConnection is all set with our STUN servers sent over
    await createPeerConnection();

    //create offer time!
    try {
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        console.log(offer);
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer', offer); //send offer to signalingServer
    } catch (err) {
        console.log(err)
    }

}

const hangup = () => {
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
    localVideoEl.srcObject = null;
    remoteVideoEl.srcObject = null;

    // Clear canvas
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    // Clear audio elements
    localAudioEl.srcObject = null;
    remoteAudioEl.srcObject = null;


    // Notify the other peer (optional, depending on your signaling server implementation)
    socket.emit('hangup', { userName });
};

const answerOffer = async (offerObj) => {
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); //just to make the docs happy
    await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
    console.log(offerObj)
    console.log(answer)
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
    console.log(offerIceCandidates)
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
            console.log(localStream)
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
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate', e => {
            console.log('........Ice candidate found!......')
            console.log(e)
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
            console.log(e)
            e.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track, remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })

            // Only set up the audio context and analyser after confirming the remote stream has an audio track
            if (e.track.kind === 'audio') {
                setupAudioContext();
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


document.querySelector('#call').addEventListener('click', call)
document.querySelector('#push-to-talk').addEventListener('click', (e) => {
    if (callInProgress) {
        hangup()
        e.target.style.backgroundColor = 'red';
    } else {
        call()
        e.target.style.backgroundColor = 'green';
    }
})