// Local SMTP sink: accepts demo mail without forwarding it to external recipients.
const net=require('node:net');let accepted=0,pdfMessages=0;
net.createServer(socket=>{
 let buffer='',data=false,pdf=false;
 socket.write('220 ticketbox-mail-sink ESMTP\r\n');
 socket.on('data',chunk=>{
  buffer+=chunk.toString();let end;
  while((end=buffer.indexOf('\r\n'))>=0){
   const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
   if(data){if(/^Content-Type: application\/pdf/i.test(line))pdf=true;if(line==='.') {data=false;accepted++;if(pdf)pdfMessages++;pdf=false;socket.write('250 queued locally\r\n');}continue;}
   const verb=line.split(' ')[0].toUpperCase();
   if(verb==='EHLO'||verb==='HELO')socket.write('250 ticketbox-mail-sink\r\n');
   else if(verb==='DATA'){data=true;socket.write('354 End with .\r\n');}
   else if(verb==='QUIT'){socket.write('221 bye\r\n');socket.end();}
   else socket.write('250 OK\r\n');
  }
 });socket.on('error',()=>{});
}).listen(1025,'0.0.0.0');
setInterval(()=>console.log('Fixture mail accepted:',accepted),60000).unref();

require('node:http').createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({accepted,pdfMessages}));}).listen(8080,'0.0.0.0');
