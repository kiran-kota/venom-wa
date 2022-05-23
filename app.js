const express = require('express');
const { phoneNumberFormatter } = require('./helpers/formatter');
const http = require('http');
const socketIO = require('socket.io');
const bodyParser = require("body-parser");
const cors = require('cors');
const venom = require('venom-bot');
const app = express();

app.use(express.static(__dirname + '/'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', __dirname);
app.use(cors());

var server = http.createServer(app);    
var io = socketIO(server);

const PORT = process.env.PORT || 80;

let id = 'test';

let waclient;

venom.create(
    id, 
    (base64Qrimg, asciiQR, attempts, urlCode) => {
        waclient = null;
        console.log('Number of attempts to read the qrcode: ', attempts);
        io.emit('qr', {id: id, url: base64Qrimg});
        io.emit('message', {id: id, text: 'QR Code received, scan please!'});       
        io.emit('message', {id: id, text: 'Number of attempts to read the qrcode: ' + attempts});        
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
    headless: true,
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
        waPage.screenshot({ path: 'screenshot.png' });
    }
).then((client)=>{ 
    waclient = client;   
    client.onStateChange(state => {
        console.log('State changed: ', state);
        io.emit('message', {id: id, text: state});
        if(state == 'CONNECTED'){
            waclient = client;
        }
        // // force whatsapp take over
        // if ('CONFLICT'.includes(state)) client.useHere();
        // // detect disconnect on whatsapp
        // if ('UNPAIRED'.includes(state)) console.log('logout');
        
    });
    //start(client);
}).catch((erro)=>{
    console.log(erro);
});


function start(client) {
    client.onMessage((message) => {
      if (message.body === 'Hi' && message.isGroupMsg === false) {
        client
          .sendText(message.from, 'Hi')
          .then((result) => {
            console.log('Result: ', result); //return object success
          })
          .catch((erro) => {
            console.error('Error when sending: ', erro); //return object error
          });
      }
    });
  }


app.get('/', (req, res)=>res.send('welcome'));

app.get('/session', (req, res)=>{    
    res.render('session.html');
});



async function sendMessage(sendObj) {
    try {
        var report = null;
        const number = phoneNumberFormatter(sendObj.number);
        const message = sendObj.message;
        const sender = sendObj.sender;
        const file = sendObj.file;
        const filename = sendObj.filename;

        if(waclient == null || waclient == undefined){
            return {status: null, message: 'client not available'}; 
        }
        const chat = await waclient?.checkNumberStatus(number).then((result) =>result).catch((err) => console.error(err, 'error'));
        if(chat == null || chat == undefined){
            return {status: false, message: 'invalid mobile number'};
        }
        if(sender == "text"){
           report = await waclient.sendText(number, message).then((result) => result).catch((err) => console.error(err, 'error'));
        } 
        if(sender == "media"){
            report = await waclient.sendImage(number, file, filename, message).then((result) => result).catch((err) => console.error(err, 'error'));
        }
        if(report == null || report == undefined){
            return {status: null, message: 'something went wrong'}; 
        }
        return {status: true, message: 'message sent successfully'};
    } catch (error) {
        return {status: null, message: 'client not available'}; 
    }
}


app.post('/send-message', async (req, res)=>{
    try {

        var result = await sendMessage(req.body);

        if(result.status == null){
            return res.status(422).json({status: null, message: 'something went wrong'}); 
        }else{
            return res.status(200).json(result);
        }
    } catch (error) {
        return res.status(422).json(error); 
    }
});

io.on('connection', function(socket){
    socket.on('create-session', function(data){
        io.emit('message', {id: id, text: 'loading...'});
        if(waclient == null || waclient == undefined){
            io.emit('message', {id: id, text: 'client is not available'});
        }
        io.emit('message', {id: id, text: 'please wait checking client status'});
    })
})


server.listen(PORT, ()=>console.log('server started at ' + PORT));
