const express = require('express');
const bodyParser = require("body-parser");
const { phoneNumberFormatter } = require('./helpers/formatter');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const venom = require('venom-bot');
const qr = require('qrcode');
const app = express();
const axois = require('axios');

app.use(express.static(__dirname + '/'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', __dirname);
app.use(cors());

var server = http.createServer(app);    
var io = socketIO(server);

const PORT = process.env.PORT || 80;

let sessions = [];

app.get('/', (req, res)=>res.send('welcome'));

app.get('/session/:id', (req, res)=>{
    var id = req.params.id;
    res.render('session.html', {id: id});
});

app.post('/send-message', async (req, res)=>{
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;
    const sender = req.body.sender;
    const client = sessions.find(x=>x.id == sender).client;
    if(client == undefined || client == null){
        return res.status(422).json({message: 'client not found'});
    }

    try {
        //await client.checkNumberStatus(number)
        await client.sendText(number, message)
        .then((result) => {
            return res.status(200).json({status: true, message: 'message sent successfully'});
        }).catch((erro) => {
            return res.status(200).json({status: false, message: 'invalid  mob no'});
        });
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        //console.log('client is not available');
        return res.status(422).json(error);      
    }

});

app.post('/send-media', async (req, res)=>{
    const number = phoneNumberFormatter(req.body.number);
    const capton = req.body.caption;
    const message = req.body.message;
    const sender = req.body.sender;
    
    try {
        const sclient = sessions.find(x=>x.id == sender);

	    const client = sclient.client;
        //const result = await client.sendFile(number,'./amar-plastics.pdf', 'poster', message);
        let mimetype;

        const attachment = await axois.get(req.body.file, {ResponseType: 'arraybuffer'}).then(response =>{
            mimetype = response.headers['content-type'];
            return response.data.toString['base64'];
        });

        const media = new MessageMedia(mimetype, attachment, 'Media');
        await client.sendImageFromBase64(number, media, req.body.message);

        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        console.log('client not available');
        return res.status(422).json(error);
    }

});


io.on('connection', function(socket){
    socket.on('create-session', function(data){
        io.emit('message', {id: data.id, text: 'loading...'});
        createSession(data.id);
    })
})


async function createSession(id) {
    console.log(id, 'id');
    try {
        var client = await venom.create(
            id, 
            (base64Qrimg, asciiQR, attempts, urlCode) => {
              console.log('Number of attempts to read the qrcode: ', attempts);
              io.emit('qr', {id: id, url: base64Qrimg});
              io.emit('message', {id: id, text: 'QR Code received, scan please!'});            
            },
            (statusSession, session) => {
              console.log('Status Session: ', statusSession);
              console.log('Session name: ', session);
              io.emit('message', {id: id, text: statusSession});
              io.emit(statusSession, {id: session, text: statusSession})
           
            },
            {
              multidevice: true,
              folderNameToken: 'tokens',
              headless: false,
              devtools: false,
              useChrome: true,
              debug: false,
              logQR: false,
              browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
              disableSpins: true, 
              disableWelcome: true, 
              updatesLog: true,
              autoClose: 0,
              createPathFileToken: true,
              //chromiumVersion: '818858',
              waitForLogin: true
              },
            (browser, waPage) => {
              console.log('Browser PID:', browser.process().pid);
            }
          );
          if(client != null){
            // let time = 0;
            // client.onStreamChange((state) => {
            //   console.log('State Connection Stream: ' + state);
            //   clearTimeout(time);
            //   if (state === 'DISCONNECTED' || state === 'SYNCING') {
            //     time = setTimeout(() => {
            //       client.close();
            //     }, 80000);
            //   }
            // });
            
            sessions = sessions.filter(x=>x.id != id);
            sessions.push({id: id, client: client});
          }          

    } catch (error) {
        console.log('session start error');      
    } 

    
}



server.listen(PORT, ()=>console.log('server started at ' + PORT));


// const interval = setInterval(()=>{
//     sessions.forEach(async (ele)=>{
//         const id = ele.id;
//         try {
//             var conn = await ele.client.isConnected();
//             var theme = await ele.client.getTheme();
            
//         } catch (error) {   
//             await ele.client.close();        
//             sessions = sessions.filter(x=>x.id != ele.id);
//             await createSession(id);
//         }
//     });
// }, 5000)