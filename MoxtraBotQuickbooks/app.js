// This loads the environment variables from the .env file
require('dotenv-extended').load();


global.builder = require('botbuilder');
global.request = require('request');
var restify = require('restify');

global.baseurl = "https://sandbox-quickbooks.api.intuit.com";
// global.baseurl = "https://quickbooks.api.intuit.com";

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 8080, function () {
    console.log('Server %s is listening to %s', server.name, server.url);
});

// Create connector and listen for messages
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
server.post('/api/messages', connector.listen());

server.get('/api/test', (req, res) => {
    console.log("Ok I got one http GET request for: /api/test");
    res.end("Welcome to Moxtra Bot Server for Microsoft Bot Framework.");
});



var inMemoryStorage = new builder.MemoryBotStorage();

var bot = new builder.UniversalBot(connector, [
    function(session){
        session.send("Welcome to Moxtra Quickbooks Bot!");
    }
]).set('storage', inMemoryStorage); // Register in-memory storage 


// Including LUIS
var recognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
bot.recognizer(recognizer);


//load the dialogs
require('./dialogs/invoice.js')(bot);
require('./dialogs/salesreceipt.js')(bot);
require('./dialogs/estimates.js')(bot);
require('./dialogs/customer.js')(bot);
require('./dialogs/login.js')(bot);