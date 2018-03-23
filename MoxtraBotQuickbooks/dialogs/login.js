module.exports = function(bot) {
    bot.dialog("login",[
        function (session, args, next) {
            console.log("session.userData.token:"+session.userData.token);
            console.log("session.message.token:"+session.message.token);

            // if(!session.userData.token && !session.message.token){
            if(!session.message.token){
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
        },
        function (session, results, next){
            if(session.message.token){
                //store user information in the User Storage container
                session.userData.userName = session.message.user.name;
                session.userData.userId = session.message.user.id;
                
                //store the token and realmid in the User Storage container
                session.userData.token = session.message.token;
                session.userData.realmId = session.message.realmid;

                //send the messages back to chat
                session.send("@"+session.userData.userName+" you're logged into your Quickbooks account.");
                session.endDialogWithResult({auth: true});
            }else{
                session.send("Sorry, no authorization received from Quickbooks. Please, type 'login' to try again.");
                session.endDialogWithResult({auth: false});
            }
        }
    ])
    .triggerAction({
        matches: 'login',
        confirmPrompt: "This will cancel your login. Are you sure?"
    });
}


