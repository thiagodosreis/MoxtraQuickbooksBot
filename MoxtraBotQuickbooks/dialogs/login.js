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

            // console.log("\n\n**** Got first waterfall!");

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
                                /* {
                                     type: 'postback',
                                     text: 'Post back test',
                                     payload: 'MOXTRABOT_'
                                   }*/
                                
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
            Token.getToken(session.message.org_id, session.message.client_id, (err, token)=>{

                if(token && session.message.text == "access_token_received"){
                    //store user information in the User Storage container
                    const user_name = session.message.user.name.toLowerCase().replace(/(^| )(\w)/g, s => s.toUpperCase());

                    builder.Prompts.choice(session, 
                        `[b]@${user_name} I’ve successfully connected to your Quickbooks account.[/b]
                        \nPlease select an option or tell me what you’d like to do. You can also type [i]help[/i] anytime if you need any assistance.`, 
                        options, { listStyle: 2 });

                    // send the messages back to chat
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
}


