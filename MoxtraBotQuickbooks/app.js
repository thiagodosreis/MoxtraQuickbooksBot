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





// Main menu
var menuItems = { 
    "Order dinner": {
        item: "orderDinner"
    },
    "Dinner reservation": {
        item: "dinnerReservation"
    },
    "Schedule shuttle": {
        item: "scheduleShuttle"
    },
    "Request wake-up call": {
        item: "wakeupCall"
    },
    "Connect my account": {
        item: "/invoice"
    }
}

var inMemoryStorage = new builder.MemoryBotStorage();

// This is a reservation bot that has a menu of offerings.
var bot = new builder.UniversalBot(connector, [
    function(session){
        session.send("Welcome to Moxtra Hotel!");
        session.beginDialog("mainMenu");
    }
]).set('storage', inMemoryStorage); // Register in-memory storage 

//load the dialogs
require('./dialogs/invoice.js')(bot);
require('./dialogs/customer.js')(bot);
require('./dialogs/login.js')(bot);

bot.dialog("scheduleShuttle", function(session){
    session.endConversation("Schedule shuttle function not implemented yet!");
    // session.replaceDialog('mainMenu');
})
.triggerAction({
    // The user can request this at any time.
    // Once triggered, it clears the stack and prompts the main menu again.
    matches: /^schedule shuttle$/i,
    confirmPrompt: "This will cancel your request. Are you sure?"
});

bot.dialog("wakeupCall", function(session){
    session.send("Request wake-up call function not implemented yet!");
    session.replaceDialog('mainMenu');
})
.triggerAction({
    // The user can request this at any time.
    // Once triggered, it clears the stack and prompts the main menu again.
    matches: /^request wake-up call$/i,
    confirmPrompt: "This will cancel your request. Are you sure?"
});

// Display the main menu and start a new request depending on user input.
bot.dialog("mainMenu", [
    function(session){
        builder.Prompts.choice(session, "Main Menu:", menuItems);
    },
    function(session, results){
        if(results.response){
            session.beginDialog(menuItems[results.response.entity].item);
        }
    }
])
.triggerAction({
    // The user can request this at any time.
    // Once triggered, it clears the stack and prompts the main menu again.
    matches: /^main menu$/i,
    confirmPrompt: "This will cancel your request. Are you sure?"
});

// *********** Dinner Reservation
// This dialog helps the user make a dinner reservation.
bot.dialog('dinnerReservation', [
    function (session) {
        session.send("Welcome to the dinner reservation.");
        session.beginDialog('askForDateTime');
    },
    function (session, results) {
        session.dialogData.reservationDate = builder.EntityRecognizer.resolveTime([results.response]);
        session.beginDialog('askForPartySize');
    },
    function (session, results) {
        session.dialogData.partySize = results.response;
        session.beginDialog('askForReserverName');
    },
    function (session, results) {
        session.dialogData.reservationName = results.response;

        // Process request and display reservation details
        session.send(`Reservation confirmed. Reservation details: <br/>Date/Time: ${session.dialogData.reservationDate} <br/>Party size: ${session.dialogData.partySize} <br/>Reservation name: ${session.dialogData.reservationName}`);
        session.endDialog();
    }
])
.triggerAction({
    matches: /^dinner reservation$/i,
    confirmPrompt: "This will cancel your current request. Are you sure?"
})
.cancelAction(
    "cancelDinner", "Type 'Main Menu' to continue.", 
    {
        matches: /^cancel$/i,
        confirmPrompt: "This will cancel your reservation. Are you sure?"
    }
);

// Dialog to ask for a date and time
bot.dialog('askForDateTime', [
    function (session) {
        builder.Prompts.time(session, "Please provide a reservation date and time (e.g.: June 6th at 5pm)");
    },
    function (session, results) {
        session.endDialogWithResult(results);
    }
]);

// Dialog to ask for number of people in the party
bot.dialog('askForPartySize', [
    function (session) {
        builder.Prompts.text(session, "How many people are in your party?");
    },
    function (session, results) {
       session.endDialogWithResult(results);
    }
])
.beginDialogAction('partySizeHelpAction', 'partySizeHelp', { matches: /^help$/i });

// Context Help dialog for party size
bot.dialog('partySizeHelp', function(session, args, next) {
    var msg = "Party size help: Our restaurant can support party sizes up to 20 members.";
    session.endDialog(msg);
})

// Dialog to ask for the reservation name.
bot.dialog('askForReserverName', [
    function (session) {
        builder.Prompts.text(session, "Who's name will this reservation be under?");
    },
    function (session, results) {
        session.endDialogWithResult(results);
    }
]);


// *********** Order Dinner
// This dialog help the user order dinner to be delivered to their hotel room.
var dinnerMenu = {
    "Potato Salad - $5.50": {
        Description: "Potato Salad",
        Price: 5.50
    },
    "Tuna Sandwich - $6.80": {
        Description: "Tuna Sandwich",
        Price: 6.80
    },
    "Clam Chowder - $4.50":{
        Description: "Clam Chowder",
        Price: 4.50
    },
    "Ceasar Salad - $3.90":{
        Description: "Ceasar Salad",
        Price: 3.90
    },
    "Check out": {
        Description: "Check out",
        Price: 0 // Order total. Updated as items are added to order.
    },
    "Cancel order": { // Cancel the order and back to Main Menu
        Description: "Cancel order",
        Price: 0
    }
};

bot.dialog('orderDinner', [
    function(session){
        session.send("Lets order some dinner!");
        session.beginDialog("addDinnerItem");
    },
    function (session, results) {
        if (results.response) {
            var orders_msg = "You ordered: \n";
            for(var i = 1; i < session.conversationData.orders.length; i++){
                orders_msg += ` - ${session.conversationData.orders[i].Description}: $${session.conversationData.orders[i].Price}\n`;
            }
            orders_msg += `[b]Total: $${session.conversationData.orders[0].Price}[/b]`;
            session.send(orders_msg);

            // Continue with the check out process.
            builder.Prompts.text(session, "What is your room number?");
        } 
    },
    function(session, results){
        if(results.response){
            session.dialogData.room = results.response;
            var msg = `Thank you. Your order will be delivered to room #${results.response}`;
            // session.send(msg);
            // session.replaceDialog("mainMenu");
            session.endConversation(msg);
        }
    }
])
.triggerAction({
    matches: /^order dinner$/i,
    confirmPrompt: "This will cancel your order. Are you sure?"
})
.reloadAction(
    "restartOrderDinner", "Ok. Let's start over.",
    {
        matches: /^start over$/i,
        confirmPrompt: "This wil cancel your order. Are you sure?"
    }
)
.cancelAction(
    "cancelOrder", "Type 'Main Menu' to continue.", 
    {
        matches: /^never mind$|^cancel$|^cancel.*order/i,
        confirmPrompt: "Are you sure you want to cancel your order?"
    }
)
.endConversationAction(
    "endOrderDinner", "Ok. Goodbye.",
    {
        matches: /^goodbye$/i,
        confirmPrompt: "This will cancel your order. Are you sure?"
    }
);


// Add dinner items to the list by repeating this dialog until the user says `check out`. 
bot.dialog("addDinnerItem", [
    function(session, args){
        if(args && args.reprompt){
            session.send("What else would you like to have for dinner tonight?");
        }
        else{
            // New order
            // Using the conversationData to store the orders
            session.conversationData.orders = new Array();
            session.conversationData.orders.push({ 
                Description: "Check out",
                Price: 0
            })
        }
        builder.Prompts.choice(session, "Dinner menu:", dinnerMenu);
    },
    function(session, results){
        if(results.response){
            if(results.response.entity.match(/^check out$/i)){
                session.endDialog("Checking out...");
            }
            else if(results.response.entity.match(/^cancel/i)){
                // Cancel the order and start "mainMenu" dialog.
                session.cancelDialog(0, "mainMenu");
            }
            else {
                var order = dinnerMenu[results.response.entity];
                session.conversationData.orders[0].Price += order.Price; // Add to total.
                var msg = `Ok. ${order.Description} $${order.Price} was added to your cart!`;
                session.send(msg);
                session.conversationData.orders.push(order);
                session.replaceDialog("addDinnerItem", { reprompt: true }); // Repeat dinner menu
            }
        }
    }
])
.reloadAction(
    "restartOrderDinner", "Ok. Let's start over.",
    {
        matches: /^start over$/i,
        confirmPrompt: "This will cancel your actual order. Are you sure?"
    }
);

//********* Global Help
bot.dialog('global_help', function (session, args, next) {
    session.endDialog("This is a bot that can help you make a dinner reservation. <br/>Please say 'next' to continue");
})
.triggerAction({
    matches: /^help$/i,
    onSelectAction: (session, args, next) => {
        // Add the help dialog to the dialog stack 
        // (override the default behavior of replacing the stack)
        session.beginDialog(args.action, args);
    }
});




    
