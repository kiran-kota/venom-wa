const express = require('express');
const bodyParser = require("body-parser");
const { phoneNumberFormatter } = require('./helpers/formatter');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const venom = require('venom-bot');
const cloudinary = require('cloudinary');

const app = express();

const fs      = require('fs');
const path    = require('path');
const Pdf2Img = require('pdf2img-promises');

app.use(express.static(__dirname + '/'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', __dirname);
app.use(cors());

var server = http.createServer(app);    
var io = socketIO(server);

const PORT = process.env.PORT || 3300;


cloudinary.config({ 
    cloud_name: 'vikramin-export', 
    api_key: '579396547732622', 
    api_secret: 'WS_-RNNSzhE4AxqPrVO1cTTWHpM', 
    secure: true
});

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
    start(client);
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

app.get('/post-image', (req, res)=>{
    cloudinary.uploader.upload("output/1651984581202.png", function(error, result) {console.log(result, error)});
    res.json({status: true});
});


app.post('/convert-png', async (req, res)=>{
    try {
        const file = req.body.file;
        var fileName = Date.now();
        let converter = new Pdf2Img();
        var buf = Buffer.from(file, 'base64');
        var r = await converter.convertPdf2Img(buf, `output/${fileName}.png`, 1);
        console.log(r, 'pdf status');
        if(r == null || r == undefined){
            return res.status(422).json({status: null, message: 'png convertion failed'}); 
        }
        cloudinary.uploader.upload(`output/${fileName}.png`, function(result, error) {
            if(error == undefined){
                return res.status(200).json(result);
            }
            return res.status(422).json({status: null, message: 'png convertion failed'}); 
        });
    } catch (error) {
        return res.status(422).json({status: null, message: 'png convertion failed'}); 
    }
    
})


app.post('/send-message', async (req, res)=>{
    try {
        const number = phoneNumberFormatter(req.body.number);
        const message = req.body.message;
        const sender = req.body.sender;

        //verify clinet is online
        if(waclient == null || waclient == undefined){
            io.emit('message', {id: id, text: 'client not available'});
            return res.status(422).json({status: null, message: 'client not available'}); 
        }

        // var status = await waclient.getConnectionState().then((result) =>result).catch((err) => console.error(err, 'error'));
        // console.log(status, 'conn status');
        //verify number
        const chat = await waclient?.checkNumberStatus(number).then((result) =>result).catch((err) => console.error(err, 'error'));
        if(chat == null || chat == undefined){
            io.emit('message', {id: id, text: 'invalid mobile number ' + req.body.number});
            return res.status(200).json({status: false, message: 'invalid mobile number'});
        }

        //send message
        const report = await waclient.sendText(number, message).then((result) => result).catch((err) => console.error(err, 'error'));
 
        if(report == null || report == undefined){
            io.emit('message', {id: id, text: 'faild to send message on ' + req.body.number});
            return res.status(422).json({status: null, message: 'something went wrong'}); 
        }
        io.emit('message', {id: id, text: 'success on send message to ' + req.body.number});
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        return res.status(422).json(error); 
    }
});


app.post('/send-media', async (req, res)=>{
    try {
        const number = phoneNumberFormatter(req.body.number);
        const message = req.body.message;
        const sender = req.body.sender;
        const file = req.body.file;
        const mimetype = req.body.mimetype;

        //verify clinet is online
        if(waclient == null || waclient == undefined){
            io.emit('message', {id: id, text: 'client not available'});
            return res.status(422).json({status: null, message: 'client not available'}); 
        }

        // var status = await waclient.getConnectionState().then((result) =>result).catch((err) => console.error(err, 'error'));
        // console.log(status, 'conn status');
        //verify number
        const chat = await waclient?.checkNumberStatus(number).then((result) =>result).catch((err) => console.error(err, 'error'));
        if(chat == null || chat == undefined){
            io.emit('message', {id: id, text: 'invalid mobile number ' + req.body.number});
            return res.status(200).json({status: false, message: 'invalid mobile number'});
        }

        //send message
        const report = await waclient.sendImageFromBase64(number, mimetype + file, message).then((result) => result).catch((err) => console.error(err, 'error'));
 
        if(report == null || report == undefined){
            io.emit('message', {id: id, text: 'faild to send message on ' + req.body.number});
            return res.status(422).json({status: null, message: 'something went wrong'}); 
        }
        io.emit('message', {id: id, text: 'success on send message to ' + req.body.number});
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        return res.status(422).json(error); 
    }
});

app.post('/send-image-url', async (req, res)=>{
    try {
        const number = phoneNumberFormatter(req.body.number);
        const message = req.body.message;
        const sender = req.body.sender;
        const file = req.body.file;
        const mimetype = req.body.mimetype;

        //verify clinet is online
        if(waclient == null || waclient == undefined){
            io.emit('message', {id: id, text: 'client not available'});
            return res.status(422).json({status: null, message: 'client not available'}); 
        }

        // var status = await waclient.getConnectionState().then((result) =>result).catch((err) => console.error(err, 'error'));
        // console.log(status, 'conn status');
        //verify number
        const chat = await waclient?.checkNumberStatus(number).then((result) =>result).catch((err) => console.error(err, 'error'));
        if(chat == null || chat == undefined){
            io.emit('message', {id: id, text: 'invalid mobile number ' + req.body.number});
            return res.status(200).json({status: false, message: 'invalid mobile number'});
        }

        //send message
        const report = await waclient.sendImage(number, file, req.body.filename, message).then((result) => result).catch((err) => console.error(err, 'error'));
 
        if(report == null || report == undefined){
            io.emit('message', {id: id, text: 'faild to send message on ' + req.body.number});
            return res.status(422).json({status: null, message: 'something went wrong'}); 
        }
        io.emit('message', {id: id, text: 'success on send message to ' + req.body.number});
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        return res.status(422).json(error); 
    }
});






app.post('/send-file', async (req, res)=>{
    try {
        const number = phoneNumberFormatter(req.body.number);
        const message = req.body.message;
        const sender = req.body.sender;
        const file = req.body.file;
        const filename = req.body.filename;
        const mimetype = req.body.mimetype;
        //verify clinet is online
        if(waclient == null || waclient == undefined){
            io.emit('message', {id: id, text: 'client not available'});
            return res.status(422).json({status: null, message: 'client not available'}); 
        }

        // var status = await waclient.getConnectionState().then((result) =>result).catch((err) => console.error(err, 'error'));
        // console.log(status, 'conn status');
        //verify number
        const chat = await waclient?.checkNumberStatus(number).then((result) =>result).catch((err) => console.error(err, 'error'));
        if(chat == null || chat == undefined){
            io.emit('message', {id: id, text: 'invalid mobile number ' + req.body.number});
            return res.status(200).json({status: false, message: 'invalid mobile number'});
        }

        //send message
        const report = await waclient.sendFileFromBase64(number, mimetype + file, filename, message).then((result) => result).catch((err) => console.error(err, 'error'));
 
        if(report == null || report == undefined){
            io.emit('message', {id: id, text: 'faild to send message on ' + req.body.number});
            return res.status(422).json({status: null, message: 'something went wrong'}); 
        }
        io.emit('message', {id: id, text: 'success on send message to ' + req.body.number});
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        return res.status(422).json(error); 
    }
});


app.post('/send-png', async (req, res)=>{
    try {
        const number = phoneNumberFormatter(req.body.number);
        const message = req.body.message;
        const sender = req.body.sender;
        const file = req.body.file;
        
        //verify clinet is online
        if(waclient == null || waclient == undefined){
            io.emit('message', {id: id, text: 'client not available'});
            return res.status(422).json({status: null, message: 'client not available'}); 
        }

        // var status = await waclient.getConnectionState().then((result) =>result).catch((err) => console.error(err, 'error'));
        // console.log(status, 'conn status');
        //verify number
        const chat = await waclient?.checkNumberStatus(number).then((result) =>result).catch((err) => console.error(err, 'error'));
        if(chat == null || chat == undefined){
            io.emit('message', {id: id, text: 'invalid mobile number ' + req.body.number});
            return res.status(200).json({status: false, message: 'invalid mobile number'});
        }
        var fileName = Date.now();
        let converter = new Pdf2Img();
        var buf = Buffer.from(file, 'base64');
        var r = await converter.convertPdf2Img(buf, `output/${fileName}.png`, 1);
        console.log(r, 'pdf status');
        if(r == null || r == undefined){
            return res.status(422).json({status: null, message: 'png convertion failed'}); 
        }
        
        //send message
        const report = await waclient.sendImage(number, `output/${fileName}.png`, req.body.filename, message).then((result) => result).catch((err) => console.error(err, 'error'));
 
        if(report == null || report == undefined){
            io.emit('message', {id: id, text: 'faild to send message on ' + req.body.number});
            return res.status(422).json({status: null, message: 'something went wrong'}); 
        }
        io.emit('message', {id: id, text: 'success on send message to ' + req.body.number});
        return res.status(200).json({status: true, message: 'message sent successfully'});
    } catch (error) {
        console.error(error, 'process error');
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
