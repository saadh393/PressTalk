const names = [{
    name: "Lab",
    value: "room-0",
},
{
    name: "Dining",
    value: "room-1",
},
{
    name: "Bed Room",
    value: "room-2",
}]

// Dialog for getting the Ip Address
function getIpAddressDialog() {
    const ipAddress_local = localStorage.getItem("ip") || null;
    if (ipAddress_local != null && ipAddress_local != 'null' && ipAddress_local != 'undefined') {
        return `https://${ipAddress_local}:8181/`
    }

    return new Promise((resolve) => {
        const dialog = document.getElementById('dialog');
        dialog.style.display = 'grid'

        function handleSubmit() {
            const input = document.getElementById('ip');
            window.SOCKET_IP_ADDRESS = input.value;

            // Hide the dialog and empty the content
            dialog.style.display = 'none';
            dialog.innerHTML = "";
            delete window.handleSubmit;

            // set local localStorage
            localStorage.setItem("ip", input.value)
            resolve(`https://${input.value}:8181/`);
        }


        const content = `<div class="dialogContent">
        <h4>Private IP Address of you Local Network</h4>
        <input type='text' id="ip" value="192.168.0."/>
    
        <div>
        <button class='button' onclick="handleSubmit()">Ok</button>
        <div>
    </div>
    `

        dialog.innerHTML = content
        document.getElementById('ip').focus();
        window.handleSubmit = handleSubmit
    })

}

function getUserNameDialog() {


    const room_id = localStorage.getItem("room") || null;
    if (room_id != null && room_id != undefined && room_id != 'undefined') {
        return room_id
    }


    return new Promise((resolve) => {
        const dialog = document.getElementById('dialog');
        dialog.style.display = 'grid'

        function handleSubmit() {
            const input = document.getElementById('room__id');
            // Hide the dialog and empty the content
            dialog.style.display = 'none';
            dialog.innerHTML = "";
            delete window.handleSubmit;

            localStorage.setItem('room', input.value)
            resolve(input.value);
        }


        const content = `<div class="dialogContent">
        <h4>Select Room</h4>
        <select id="room__id">
            ${names.map(({ name, value }) => `<option value="${value}">${name}</option>`).join('')}
        </select>
    
        <div>
        <button class='button' onclick="handleSubmit()">Ok</button>
        <div>
    </div>
    `

        dialog.innerHTML = content
        window.handleSubmit = handleSubmit
    })

}

function renderConnectedUsers(connectedUsers) {
    console.log("Connected User", connectedUsers, ROOM_USER_NAME)

    const users = connectedUsers.filter(u => u.userName != ROOM_USER_NAME).map(u => {
        const roomName = names.find(n => n.value == u.userName);
        return `<li class="online">
        <div onclick="call('${u.userName}')">
            <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-home-share"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2c.247 0 .484 .045 .702 .127" /><path d="M19 12h2l-9 -9l-9 9h2v7a2 2 0 0 0 2 2h5" /><path d="M16 22l5 -5" /><path d="M21 21.5v-4.5h-4.5" /></svg> 
                <span>Connect  ${roomName.name}</span>
            </div>
            <div style="display:none" id="hangup-${u.userName}" onclick="hangup('${u.userName}')"> Hangup </div>
        </li>`
    }).join('\n');

    document.getElementById('answer').innerHTML = `<ul>${users}</ul>`
}

function renderMetaInfo() {
    const userNameDom = document.getElementById('username')
    const ipDom = document.getElementById('ip_addr')

    const roomName = names.find(n => n.value == userName);
    userNameDom.innerText = roomName.name + " | " +  userName
    userNameDom.onclick = () => { localStorage.removeItem('room'); location.reload() }

    ipDom.innerText = window.IP
    ipDom.onclick = () => { localStorage.removeItem('ip'); location.reload() }
}