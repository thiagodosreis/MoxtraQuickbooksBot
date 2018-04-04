const Token = require('./../modules/token');

module.exports = function(bot) {
    bot.dialog("login",[
        function (session, args, next) {

            console.log("\n\n**** Got first waterfall!");
            console.log("session.message:"+JSON.stringify(session.message));

            if(session.message.text != "access_token_received"){

                session.send(new builder.Message(session).addAttachment(
                    {
                        contentType: "application/moxtra.button",
                        content: {
                            text: "Please, Sign in to your Quickbooks Account.",
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

            if(session.message.text == "access_token_received" && Token.getToken(session.message.user.id)){
                
                //store user information in the User Storage container
                session.userData.userName = session.message.user.name;
                session.userData.userId = session.message.user.id;

                //send the messages back to chat
                session.send("@"+session.userData.userName+" you're logged into your Quickbooks account.");
                session.endDialogWithResult({auth: true});

            }else{
                session.send("Sorry, no authorization received from Quickbooks. Please, type 'login' to try again.");
                session.endDialogWithResult({auth: false});
            }
        }
    ]
    )
    .triggerAction({
        matches: 'login'
        // confirmPrompt: "This will cancel your login. Are you sure?"
    });
}


