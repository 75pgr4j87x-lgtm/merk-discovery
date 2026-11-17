import net from 'node:net';
// Loopback-only SMTP receiver for real Nodemailer transport tests. No delivery
// leaves the machine; no production credentials are accepted or needed.
export async function startSmtpFixture(){
 const messages=[],sockets=new Set();
 const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.write('220 localhost E2E SMTP\r\n');let buffer='',inData=false,data='',login=0;
  socket.on('data',chunk=>{buffer+=chunk.toString();for(;;){const end=buffer.indexOf('\r\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(inData){if(line==='.') {messages.push(data);data='';inData=false;socket.write('250 2.0.0 Accepted locally\r\n');}else data+=line+'\r\n';continue;}if(login){login--;socket.write(login?'334 UGFzc3dvcmQ6\r\n':'235 2.7.0 Authenticated locally\r\n');continue;}if(/^EHLO|^HELO/i.test(line))socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 5242880\r\n');else if(/^AUTH LOGIN/i.test(line)){login=2;socket.write('334 VXNlcm5hbWU6\r\n');}else if(/^AUTH PLAIN/i.test(line))socket.write('235 2.7.0 Authenticated locally\r\n');else if(/^MAIL FROM:|^RCPT TO:|^RSET|^NOOP/i.test(line))socket.write('250 OK\r\n');else if(/^DATA/i.test(line)){inData=true;socket.write('354 End with dot\r\n');}else if(/^QUIT/i.test(line)){socket.end('221 Bye\r\n');}else socket.write('502 Unsupported test command\r\n');}});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {messages,port:server.address().port,close:()=>new Promise(resolve=>{for(const socket of sockets)socket.destroy();server.close(resolve);})};
}
