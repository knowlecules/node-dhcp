var dhcpd = require('../lib/dhcp.js');
var iprange = require('iprange');
var request = require('request');
var ifaces = require('os').networkInterfaces();


function ipAsNumber(ip) 
{
    var d = ip.split('.');
    return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
}

var ips = {};
var dhcpOptions = {
  // System settings
  range: [
    "192.168.0.1", "192.168.1.253"
  ],
  provider: new dhcpd.FileProvider('./dhcp-leases'),
  // Option settings
  netmask: '255.255.252.0',
  router: [
    '192.168.0.1'
  ],
  timeServer: null,
  nameServer: null,
  dns: ["8.8.8.8", "8.8.4.4"],
  hostname: "digger",
  domainName: "rdc.local",
  broadcast: '192.168.1.255',
  server: '192.168.0.71', // This is us
  maxMessageSize: 1500,
  leaseTime: 86400,
  renewalTime: 60,
  rebindingTime: 120,
};


Object.keys(ifaces).forEach(function (ifname) {
  var alias = 0;
  var lowerIpNum = ipAsNumber(dhcpOptions.range[0]) 
  var upperIpNum = ipAsNumber(dhcpOptions.range[1]) 

  ifaces[ifname].forEach(function (iface) {
    var currentIpNum =ipAsNumber(iface.address) 
    if ('IPv4' === iface.family && iface.internal === false && lowerIpNum <= currentIpNum && upperIpNum >= currentIpNum) {  
      console.log("Server interface:", iface)
      dhcpOptions.server = iface.address;
    }
  });
});


var s = dhcpd.createServer(dhcpOptions);

s.on('message', function (data) {
//  console.log(data);
});

s.on('bound', function(state) {
  console.log("BOUND:");
  console.log(state);
});

s.on("error", function (err, data) {
  console.log(err, data);
});

s.on("listening", function (sock) {
  var address = sock.address();
  console.info('Server Listening: ' + address.address + ':' + address.port);

  var range = iprange(dhcpOptions.range[0] + '/' + s.tools.CIDRFromNetmask(dhcpOptions.netmask));
  
  range.some(ip => {
    var reqOpts = {
      method:'GET',
      auth: {
        user: 'root',
        pass: 'root',
        sendImmediately: false,
      },
      uri: `http://${ip}/cgi-bin/get_system_info.cgi?1`,
      json: true, 
      timeout:10000
    }
    // Find DHCP bound machines
    request(reqOpts, function(error, response, body){

      if(!error && body.macaddr && body.ipaddress && !ips[body.ipaddress]) {
        //Requires unique ip addresses
        ips[body.ipaddress] = true;
        s.config('provider').set(body.macaddr.replace(/:/g,'-'), body.ipaddress);
      }
    });

    return (ip == dhcpOptions.range[1]);
  })
});

s.on("close", function () {
  // console.log('close');
});

s.listen();

process.on('SIGINT', () => {
    s.close();
});