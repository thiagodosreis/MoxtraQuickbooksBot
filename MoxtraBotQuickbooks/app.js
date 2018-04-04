// This loads the environment variables from the .env file
require('dotenv-extended').load();
var restify = require('restify');
var CookieParser = require('restify-cookies');
const OAuth2 = require('./modules/oauth');
var oauth2 = new OAuth2();
const jwt = require('jsonwebtoken');
const Token = require('./modules/token');
var qb = require('./modules/qbapi');

global.builder = require('botbuilder');
global.request = require('request');
global.baseurl = process.env.QUICKBOOKS_BASEURL;

global._address = {};
global._token = {};



// Setup Restify Server
var server = restify.createServer();
server.use(CookieParser.parse);
server.use(restify.queryParser());
server.use(restify.bodyParser());

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

server.get('/oauth2',(req, res, next)=>{
    console.log("req:"+JSON.stringify(req.headers));
    console.log("\n\n####04: account_link event capturated! Send data to Browser Cookies");
    console.log("jwt:"+req.query['token']);
    console.log("conversationId:"+req.query['conversationid']);
    if(req.query['token']){
        try {
            const data = jwt.decode(req.query['token']);
            console.log("------ jwt decoded: "+JSON.stringify(data));

            // save the user id and binder_id 
            res.setCookie('user_id', data.user_id);
            res.setCookie('binder_id', data.binder_id);
            res.setCookie('org_id', data.org_id);
            res.setCookie('user_name', data.username);
            res.setCookie('conversationId',req.query['conversationid']);

            oauth2.auth(req, res, next);

        } catch (err) {
            // const error = 'Unable to decode jwt!';
            console.error(err);
            res.status(403);
            res.send(err);
            return;
        }
    }else{
        // / const error = 'Unable to decode jwt!';
        console.error(err);
        res.status(403);
        res.send(err);
        return;
    }
});


server.get("/oauth2/callback", function (req, res) {
    const cookies = req.cookies;

    if (!cookies.user_id || !cookies.binder_id || !cookies.org_id) {
        res.status(400);
        console.error("Unable to get user_id, binder_id and org_id from Cookies!");
    } else {
        oauth2.callback(req, res, cookies, (err, token)=>{
            if(!err){
                const stored_address = _address[cookies.user_id];
                const user_id = cookies.user_id;
                
                //store the token to the user
                Token.storeToken(user_id, token);

                console.log('\n\nConversationId from cookies:'+cookies.conversationId);

                //Post a message to the DL pretending to be the Channel
                qb.postMessageDL('access_token_received',user_id, cookies.user_name, cookies.conversationId, (err, result)=>{
                    console.log('\n\nErr:'+err);
                    console.log('\n\nresult:'+JSON.stringify(result));
                });
                
            }else{
                console.log('\n\nerr:'+err);
            }
        });
    }
});


function postMessageDL(msg){

}

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
require('./dialogs/updateInvoice.js')(bot);
require('./dialogs/invoice.js')(bot);
require('./dialogs/salesreceipt.js')(bot);
require('./dialogs/estimates.js')(bot);
require('./dialogs/customer.js')(bot);
require('./dialogs/login.js')(bot);
require('./dialogs/reports.js')(bot);


//********* Helper method ***************//
var Intl = require('intl');
// Create our number formatter.
global.formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
});