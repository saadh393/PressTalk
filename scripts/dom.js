// Dialog for getting the Ip Address
function getIpAddressDialog() {
    const dialog = document.getElementById('dialog');
    dialog.style.display = 'grid'

    function handleSubmit() {
        const input = document.getElementById('ip');
        window.SOCKET_IP_ADDRESS = input.value;

        // Hide the dialog and empty the content
        dialog.style.display = 'none';
        dialog.innerHTML = "";
        delete window.handleSubmit;
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
}