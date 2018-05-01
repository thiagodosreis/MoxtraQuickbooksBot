// This loads the environment variables from the .env file
require('dotenv-extended').load();
const restify = require('restify');
const CookieParser = require('restify-cookies');
const OAuth2 = require('./modules/oauth');
const jwt = require('jsonwebtoken');
const Token = require('./modules/token');
const qb = require('./modules/qbapi');


global.database = require('./modules/database');
global.builder = require('botbuilder');
global.request = require('request');
global.baseurl = process.env.QUICKBOOKS_BASEURL;

global._address = {};
global._token = {}; //in memory token

// Setup Restify Server
var server = restify.createServer();
server.use(CookieParser.parse);
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.listen(process.env.port || process.env.PORT || 8080, function () {
    console.log('Server %s is listening to %s', server.name, server.url);
});

//connect to the database
database.connect(()=>{ });

// Create connector and listen for messages
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});


server.post('/api/messages', connector.listen());

const qbalerts = require('./modules/qbwebhooks');
server.post('/api/alerts', (req, res)=>{
    console.log("Data received:"+JSON.stringify(req.body));
    console.log("Called the function");
    qbalerts.getQBwebhooks(req, res, database);
    console.log("Sending 200 status");
    res.status(200);
    res.send();
});

server.get('/api/test', (req, res) => {
    console.log("Ok I got a http GET request for: /api/test");
    res.end("Welcome to Moxtra Bot Server for Microsoft Bot Framework.");
});

const oauth2 = new OAuth2();
server.get('/oauth2',(req, res, next)=>{
    const sentdata = req.query['token'];
    if(sentdata){
        try {
            const data = jwt.decode(sentdata);

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
                Token.storeToken(user_id, token, (err, result)=>{
                    let msg;
                    if(err){
                        console.log("\nError storing token in DB.");
                        msg = 'access_token_error';
                    }else{
                        msg = 'access_token_received';
                    }

                    console.log("\nTOKEN:"+JSON.stringify(token));
                    console.log('ConversationId from cookies:'+cookies.conversationId);

                    //Post a message to the DL pretending to be the Channel
                    qb.postMessageDL(msg, user_id, cookies.user_name, cookies.conversationId, (err, result)=>{});
                });                
            }else{
                console.log('\nerr:'+err);

                //Post a message to the DL pretending to be the Channel
                qb.postMessageDL('access_token_error', user_id, cookies.user_name, cookies.conversationId, (err, result)=>{});
            }
        });
    }
});

var inMemoryStorage = new builder.MemoryBotStorage();
var bot = new builder.UniversalBot(connector, [
    function(session){
        // session.send("Welcome to Moxtra Quickbooks Bot!");

        // const msg= "Please select on option:[table]"+
        //             "[tr][td][/td][td][mxButton=bot_postback payload=\"opt1\" client_id=\""+session.message.client_id+"\"]Invoice #1010[/mxButton][/td][/tr]"+
        //             "[tr][td][/td][td][mxButton=bot_postback payload=\"opt2\" client_id=\""+session.message.client_id+"\"]Invoice #1012[/mxButton][/td][/tr]"+
        //             "[tr][td][/td][td][mxButton=bot_postback payload=\"opt3\" client_id=\""+session.message.client_id+"\"]Invoice #1015[/mxButton][/td][/tr]"+
        //             "[tr][td][/td][td][mxButton=bot_postback payload=\"opt4\" client_id=\""+session.message.client_id+"\"]Invoice #1014[/mxButton][/td][/tr]"+    
        // "[/table]";

        
        const msg = "Sorry, I didn't understand that. You can try things like:\n"+
        "- Get me estimates.\n"+
        "- Show me overdue invoices.\n"+
        "- List me sales receipt for customer John.\n"+
        "- Bring me Customer Balance Report.";

        session.send(msg);
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
require('./dialogs/alerts')(bot);
require('./dialogs/reports/customer_balance')(bot);
require('./dialogs/reports/receivable')(bot);
require('./dialogs/reports/payable')(bot);
require('./dialogs/vendor')(bot);
require('./dialogs/bill')(bot);

//Start Scheduled Alerts
require('./modules/job');


//********* Helper method ***************//
var Intl = require('intl');
// Create our number formatter.
global.formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
});