module.exports = function(bot) {
    bot.dialog("login",[
        function (session, args, next) {
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
            session.send("Ok @"+session.message.user.name+". I got your token:");
            if(session.message.token){
                session.send(session.message.token.access_token);
            }
            session.endDialog("You're logged into your Quickbooks account. Now you can perform any operations.");
        }
    ])
    .triggerAction({
        matches: /^login$/i,
        confirmPrompt: "This will cancel your login. Are you sure?"
    });

    // // token call back
    // bot.dialog("access_token_received",
    //     function(session, args, next){
    //         session.send("Ok @"+session.message.user.name+". I got your token:");
    //         if(session.message.token){
    //             session.send(session.message.token.access_token);
    //         }
    //         session.send("You're logged into your Quickbooks account. Now you can perform any operations.");
    //         next();
    //     },
    //     function(session, results, next){
    //         session.endDialogWithResult(session.message.token);
    //     }
    // )
    // .triggerAction({
    //     matches: /^access_token_received$/i
    // });
}


