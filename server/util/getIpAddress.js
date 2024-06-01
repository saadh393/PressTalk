const os = require('os');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const interface = interfaces[interfaceName];
    for (const alias of interface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1'; // Default to localhost if no external IP is found
}

module.exports = getLocalIpAddress; 