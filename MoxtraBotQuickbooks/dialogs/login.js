const Token = require('./../modules/token');



module.exports = function(bot) {

    const options ={
            "See your Accounts Receivable report": {
                dialog: "reportAR"
            },
            "Look at invoices":{
                dialog: "searchInvoice"
            },
            "Pay bills": {
                dialog: "searchBill"
            },
            "Set notification preferences": {
                dialog: "showAlerts"
            }
        };

    bot.dialog("login",[
        function (session, args, next) {

            console.log("\n\n**** Got first waterfall!");
            console.log("session.message:"+JSON.stringify(session.message));

            if(session.message.text != "access_token_received" && session.message.text != "access_token_error"){

                session.send(new builder.Message(session).addAttachment(
                    {
                        contentType: "application/moxtra.button",
                        content: {
                            text: "Please sign in to your Quickbooks account.",
                            buttons: [
                                {
                                    type: 'account_link',
                                    text: 'Sign In'
                                }
                                // {
                                //     type: 'postback',
                                //     text: 'Post back test',
                                //     payload: 'MOXTRABOT_'
                                // }
                            ]
                        }
                    }
                ));
            }else{
                next();
            }
        }
        ,
        function (session, results, next){
            Token.getToken(session.message.user.id, (err, token)=>{
                if(token && session.message.text == "access_token_received"){
                    //store user information in the User Storage container
                    session.userData.userName = session.message.user.name.toLowerCase().replace(/(^| )(\w)/g, s => s.toUpperCase());
                    session.userData.userId = session.message.user.id;

                    console.log("options:"+JSON.stringify(options));

                    builder.Prompts.choice(session, 
                        `[b]@${session.userData.userName} I’ve successfully connected your Quickbooks account.[/b]
                        \nPlease select an option or tell me what you’d like to do. You can also type [i]help[/i] anytime if you need any assistance.`, 
                        options, { listStyle: 2 });

                    //send the messages back to chat
                    // session.send(msg);
                    // session.endDialogWithResult({auth: true});
                }else{
                    session.send("Sorry, no authorization received from Quickbooks. Please, type 'login' to try again.");
                    session.endDialogWithResult({auth: false});
                }
            });
        },
        function (session, results){
            if(results.response){
                console.log("login results:"+JSON.stringify(results));
                session.beginDialog(options[results.response.entity].dialog);
            }
        }
    ]
    )
    .triggerAction({
        matches: 'login'
        // confirmPrompt: "This will cancel your login. Are you sure?"
    });

    /*
    bot.dialog("welcome",[
        function (session, args, next) {

            console.log("\n\n**** Got first waterfall!");
            console.log("session.message:"+JSON.stringify(session.message));

            if(session.message.text != "access_token_received" && session.message.text != "access_token_error"){

                session.send(new builder.Message(session).addAttachment(
                    {
                        contentType: "application/moxtra.button",
                        content: {
                            text: "Welcome!\nPlease, sign in to your Quickbooks account.",
                            buttons: [
                                {
                                    type: 'account_link',
                                    text: 'Sign In'
                                }
                                // {
                                //     type: 'postback',
                                //     text: 'Post back test',
                                //     payload: 'MOXTRABOT_'
                                // }
                            ]
                        }
                    }
                ));
            }else{
                next();
            }
        }
        ,
        function (session, results, next){

            console.log("\n\n**** Got the next waterfall!");

            Token.getToken(session.message.user.id, (err, token)=>{
                if(token && session.message.text == "access_token_received"){
                    //store user information in the User Storage container
                    session.userData.userName = session.message.user.name;
                    session.userData.userId = session.message.user.id;

                    let msg = `@${session.userData.userName} you're logged into your Quickbooks account./n
                    Here are some of the things I can do:/n
                    1.	See your Accounts Receivable report/n
                    2.	Look at invoices/n
                    3.	Pay bills/n
                    4.	Set notification preferences/n/n
                    Please select an option or go ahead!!!/n/n
                    You can also use @help anytime to see what else I can do!`;

                    //send the messages back to chat
                    session.send(msg);
                    session.endDialogWithResult({auth: true});
                }else{
                    session.send("Sorry, no authorization received from Quickbooks. Please, type 'login' to try again.");
                    session.endDialogWithResult({auth: false});
                }
            });
        }
    ]
    )
    .triggerAction({
        matches: 'welcome'
        // confirmPrompt: "This will cancel your login. Are you sure?"
    });
    */
}


