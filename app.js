const express = require('express');
const bodyParser = require("body-parser");
const { phoneNumberFormatter } = require('./helpers/formatter');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const venom = require('venom-bot');
const qr = require('qrcode');
const app = express();

app.use(express.static(__dirname + '/'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', __dirname);
app.use(cors());

var server = http.createServer(app);    
var io = socketIO(server);

const PORT = process.env.PORT || 3000;

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
    
    try {
        const client = sessions.find(x=>x.id == sender).client;
        const result = await client.sendText(number, message);
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        console.log(error);
        return res.status(422).json(error);
    }

});

app.post('/send-media', async (req, res)=>{
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;
    const sender = req.body.sender;
    
    try {
        const client = sessions.find(x=>x.id == sender).client;
        const result = await client.sendFile(number,'./amar-plastics.pdf', 'poster', message);
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        console.log(error);
        return res.status(422).json(error);
    }

});


io.on('connection', function(socket){
    socket.on('create-session', function(data){
        console.log(data, 'data');
        io.emit('message', {id: data.id, text: 'loading...'});
        createSession(data.id);
    })
})


async function createSession(id) {
    try {
        const wa = await venom.create(
            //session
            id, //Pass the name of the client you want to start the bot
            //catchQR
            (base64Qrimg, asciiQR, attempts, urlCode) => {
              console.log('Number of attempts to read the qrcode: ', attempts);
              console.log('Terminal qrcode: ', asciiQR);
              console.log('base64 image string qrcode: ', base64Qrimg);
              console.log('urlCode (data-ref): ', urlCode);
              io.emit('qr', {id: id, url: base64Qrimg});
              io.emit('message', {id: id, text: 'QR Code received, scan please!'});
            //   qr.toDataURL(res, (err, url)=>{
            //     io.emit('qr', {id: id, url: url});
            //     io.emit('message', {id: id, text: 'QR Code received, scan please!'});
            //   })
            },
            // statusFind
            (statusSession, session) => {
              console.log('Status Session: ', statusSession); //return isLogged || notLogged || browserClose || qrReadSuccess || qrReadFail || autocloseCalled || desconnectedMobile || deleteToken || chatsAvailable || deviceNotConnected || serverWssNotConnected || noOpenBrowser
              //Create session wss return "serverClose" case server for close
              console.log('Session name: ', session);
              io.emit('message', {id: id, text: statusSession});
              io.emit(statusSession, {id: session, text: statusSession})
            },
            // options
            {
              multidevice: true, // for version not multidevice use false.(default: true)
              folderNameToken: 'tokens', //folder name when saving tokens
              mkdirFolderToken: '', //folder directory tokens, just inside the venom folder, example:  { mkdirFolderToken: '/node_modules', } //will save the tokens folder in the node_modules directory
              headless: true, // Headless chrome
              devtools: false, // Open devtools by default
              useChrome: true, // If false will use Chromium instance
              debug: false, // Opens a debug session
              logQR: true, // Logs QR automatically in terminal
              browserWS: '', // If u want to use browserWSEndpoint
              browserArgs: [''], //Original parameters  ---Parameters to be added into the chrome browser instance
              puppeteerOptions: {}, // Will be passed to puppeteer.launch
              disableSpins: true, // Will disable Spinnies animation, useful for containers (docker) for a better log
              disableWelcome: true, // Will disable the welcoming message which appears in the beginning
              updatesLog: true, // Logs info updates automatically in terminal
              autoClose: 60000, // Automatically closes the venom-bot only when scanning the QR code (default 60 seconds, if you want to turn it off, assign 0 or false)
              createPathFileToken: true, // creates a folder when inserting an object in the client's browser, to work it is necessary to pass the parameters in the function create browserSessionToken
              //chromiumVersion: '818858', // Version of the browser that will be used. Revision strings can be obtained from omahaproxy.appspot.com.
              addProxy: [''], // Add proxy server exemple : [e1.p.webshare.io:01, e1.p.webshare.io:01]
              userProxy: '', // Proxy login username
              userPass: '' // Proxy password
            },
            // BrowserInstance
            (browser, waPage) => {
              console.log('Browser PID:', browser.process().pid);
            }
          );
        sessions = sessions.filter(x=>x.id != id);
        sessions.push({id: id, client: wa});
    } catch (error) {
        console.log(error, 'error');      
    }
}



server.listen(PORT, ()=>console.log('server started at ' + PORT));