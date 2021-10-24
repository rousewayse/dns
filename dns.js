#!/usr/bin/env node

const dnsPacket = require('dns-packet')
const dgram = require('dgram');

roots = [
  "198.41.0.4",
  "199.9.14.201",
  "192.33.4.12",
  "199.7.91.13",
  "192.203.230.10",
  "192.5.5.241",
  "192.112.36.4",
  "198.97.190.53",
  "192.36.148.17",
  "192.58.128.30",
  "193.0.14.129",
  "199.7.83.42",
  "202.12.27.33",
];

const cache = {};

const ip = '0.0.0.0'
const port = 53

const sendUDP = (dnsMessageBin, remoteIP, remotePort) => {
    const client = dgram.createSocket('udp4');
    client.on('error', function(e) {
        throw e;
    });
    const promise = new Promise((resolve, reject) => {
        client.on('message', function (msg, rinfo) {
            client.close();
            resolve(msg);
        });
        client.send(dnsMessageBin, remotePort, remoteIP, function(err, bytesCount) {});
    }).then((msg) => { return msg });
    return promise;
}

const askServer = async (domain, addr) => {
  const question = {
    type: 'query',
    id: 1,
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{
      type: 'A',
      name: domain, 
    }]
  }
  const resp = await sendUDP(dnsPacket.encode(question), addr, 53)
    .then(e => dnsPacket.decode(e));
  if (resp.answers.length > 0) {
    const res = resp.answers;
    return res;
  }
  for (rec of resp.authorities) {
    const ans = await askServer(domain, rec.data); 
    if (ans && ans.length > 0) {
      return ans;
    }
  }
  return null;
} 

const resolve = async (domain) => {
  if (cache[domain]) return cache[domain];
  for (const root of roots) {
    const resp = await askServer(domain, root);
    if (resp && resp.length) {
      cache[domain] = resp;
      return resp;
    }
  }
  return [];
}

const server = dgram.createSocket('udp4');

server.on('error', err => {
  throw err;
})

server.on('message', async (msg, info) => {
  const data = dnsPacket.decode(msg);
  if (!data.flag_qr && data.rcode == 'NOERROR') {
    const res = await Promise.all(data.questions.map(async que => {
      const domain = que.name;
      if (que.type == 'A') {
        const answers = await resolve(domain);
        if (answers && answers.length > 0) {
          return answers;
        }
        else {
          return -1;
        }
      }
      return -1;
    })).then(res => res.filter(e => e != -1).reduce((res, e) => [...res, ...e], []));
    server.send(dnsPacket.encode({...data, answers: res, additionals: []}), info.port, info.address, (err) => {});
  }
})

server.on('listening',function(){
  const address = server.address();
  const port = address.port;
  console.log('Server is listening at port ' + port);
});

server.bind(53)
