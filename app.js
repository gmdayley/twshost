var  express = require('express')
    , app = express()
    , server = require('http').createServer(app)
    , twilio = require('twilio')
    , io = require('socket.io').listen(server)
    , _ = require('underscore');


// Configure Socket IO
if(process.env.PORT){
    console.log("Falling back to xhr-polling");
    io.configure(function () {
        io.set("transports", ["xhr-polling"]);
        io.set("polling duration", 10);
        io.set("log level", 0);
    });
}

io.sockets.on('connection', function (socket) {
    socket.emit('connection', players);
});


// Load twilio properties
var TWILIO_SID = process.env.TWILIO_SID,
    TWILIO_AUTHTOKEN = process.env.TWILIO_AUTHTOKEN;

// Create twilio client
var twilioClient = twilio(TWILIO_SID, TWILIO_AUTHTOKEN);


// Start server
var port = process.env.PORT || 5000;
server.listen(port);
console.log("server listening on port " + port);


// Configure express
app.use(express.bodyParser());
app.use("/", express.static(__dirname + '/public'));

// Configure routes
app.get('/startover', function(request, response){
	players = [];
	response.send('Game Reset');
});

app.get('/twilio/account', function(request, response) {
    twilioClient.accounts(TWILIO_SID).get(function(err, account) {
        if(err) {
            response.send({});
        } else {
            response.send({
                friendlyName: account.friendly_name,
                created: account.date_created,
                sid: account.sid,
                status: account.status
            });
        }
    });
});


app.post('/sms/send/:to', function(request, response){
    var to = request.params.to;
    var msg = request.body;


    twilioClient.sendSms({
        to: to,
        from: msg.from,
        body: msg.body
    },function(error, responseData){
        console.log('error', error, responseData);
    });

    response.end('success');
});


var players = [];

app.post("/host/sms", function(request, response) {
	var twiml = new twilio.TwimlResponse();
    var msg = request.body;

    console.log("SMS >>> ", msg);
    var sms = parseSms(msg);


    var player = findPlayer(sms.from);
    console.log('matched player', player);

    switch(sms.type.toUpperCase()){
        case 'HELLO':
           	if(player){
           		console.log("found existing player", player);
           		player.state = 0;
           	} else {
           		player = {
	                number: sms.from,
	                name: sms.msg,
	                state: 0
	            };	

	            players.push(player);
           	}

            advancePlayer(player, 0, 0);   

            twiml.sms("Hi "+ sms.msg);
            break;
        // case 'JS' :
        	// advancePlayer(player, 0, 1);
        	// break;
        case 'CALLME' :
            twiml.sms("MP3 http://twiliosurvivor.coderighteo.us/cmm.mp3");
            advancePlayer(player, 0, 1);
            break;
        case 'TWILIOROCKS':
        	advancePlayer(player, 1, 2);
            break;
        case '33':
            twilioClient.makeCall({
                to: sms.from,
                from:'+18016236842',
                url: 'http://twiliosurvivor.coderighteo.us/host/congrats'
            });
        	break;
        case 'WINNER':
        	//Check for winner
        	if(
        	sms.msg.indexOf('Any') > -1 || 
            sms.msg.indexOf('way') > -1 || 
            sms.msg.indexOf('matter') > -1 || 
            sms.msg.indexOf('wind') > -1 || 
            sms.msg.indexOf('blows') > -1) {
        		twiml.sms("You are a winner!!");
            }
            advancePlayer(player, 2, 3);
            break;
        default:
        	twiml.sms('I don\'t recognize your message');
    }

    response.writeHead(200, {'Content-Type': 'text/xml'});
    response.end(twiml.toString());
});


app.post("/host/voice", function(request, response){
    var twiml = new twilio.TwimlResponse();
    twiml.say('Hello there. Are you having fun yet?')
        .pause({length: 2})
        .say('Twilio is awesome, thanks for playing ', {voice: 'woman'});

    response.writeHead(200, {'Content-Type': 'text/xml'});
    response.end(twiml.toString());
});


app.post('/host/congrats', function(req, res){
    var twiml = new twilio.TwimlResponse();
    twiml.pause({length: 3});
    twiml.say('Any way the wind blows, doesn\'t really matter two me');

    res.writeHead(200, {'Content-Type': 'text/xml'});
    res.end(twiml.toString());
});


app.post('/sound/:name', function (req, res){
    var name = req.params.name;
    io.sockets.emit('playsound', {
        name: name,
        start: 0
    });
    res.end('ok');
});


function advancePlayer(player, from, to){
   	if(player && player.state === from) {
   		player.state = to;
        io.sockets.emit('msg', player);
        
        if(player.state === 0){
            io.sockets.emit('playsound', {
                name: 'readygo'
            });
        }
        else if(player.state === 3) {
            io.sockets.emit('playsound', {
                name: 'theme'
            });
        }
        else {
            io.sockets.emit('playsound', {
                name: 'daffy'
            });
        }
   	}	
}

function findPlayer(number) {
	return _.find(players, function(player){
    	return player.number === number;
    });	
}

function parseSms(msg){
    var parts = msg.Body.split(/\W(.+)?/);

    return {
        from: msg.From,  
        type: parts[0] || "UNKNOWN",
        msg: parts[1] || ""
    }
}






