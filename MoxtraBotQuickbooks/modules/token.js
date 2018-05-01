const OAuth2 = require('./oauth');


const storeToken = (user_id, token, cb)=>{
    
    if(!user_id || !token){
        console.log('Missing parameters for storeToken.');
        cb('Missing parameters for storeToken.', null);
        return;
    }

    //first store in the DB
    if(database){
        database.updateQBToken(user_id, token, (err, result)=>{
            if(err){
                console.log("Error updating token in DB: "+err);
                cb("Error updating token in DB: "+err, null);
            }else{
                //second keep it in memory to increase performance
                cb(null, storeInMemory(user_id, token));
            }
        });
    }else{
        //second keep it imnmemory to increase performance
        cb(null, storeInMemory(user_id, token));
    }
}

const getToken = (user_id, cb)=>{
        
        if(!user_id){
            console.log('Missing parameters for getToken.');
            cb('Missing parameters for getToken.', null);
            return;
        }
        
        const oauth2 = new OAuth2();
        const tokenObj = readFromMemory(user_id);

        //if token in memory and valid
        if(!tokenObj){
            console.log('\ngetToken: No QUICKBOOKS Token in memory. Going to DB');

            if(database){
                //get token from DB
                database.getQBToken(user_id, (err, result)=>{
                    if(err){
                        cb(err, null);
                    }else{
                        //check if is valid
                        if(!oauth2.isValid(result.token)){

                            console.log('getToken: DB QUICKBOOKS Token not valid');

                            //refresh the token
                            oauth2.refresh(result.token, (err, new_token)=>{
                                if(err){
                                    cb('Error refreshing the token: '+err, null);
                                    return;
                                }
                    
                                //replace actual token by a renewed one
                                result.token = new_token;

                                //store new token 
                                storeToken(user_id, result, (err, result)=>{
                                    console.log('getToken: DB Storing new QUICKBOOKS Token in DB');
                                    cb(err, result);
                                    return;
                                });   
                            });
                        }else{
                            console.log('getToken: DB Storing new QUICKBOOKS Token just in Memory');
                            //store token in memory 
                            storeInMemory(user_id, result);
                            cb(null, result);
                        }
                    }
                });   
            }
        }else{
            console.log('\ngetToken: Using in Memory QUICKBOOKS Token');

            //check if is valid
            if(!oauth2.isValid(tokenObj.token)){

                //refresh the token
                oauth2.refresh(tokenObj.token, (err, new_token)=>{
                    if(err){
                        cb('Error refreshing the QUICKBOOKS token: '+err, null);
                        return;
                    }
        
                    //replace actual token by a renewed one
                    tokenObj.token = new_token;

                    //store new token 
                    storeToken(user_id, tokenObj, (err, result)=>{
                        console.log('getToken: In memory QUICKBOOKS Token not valid. Refreshing DB and Memory');
                        cb(err, result);
                        return;
                    });   
                });
            }else{
                console.log('getToken: In memory QUICKBOOKS Token is valid. No need to call DB.');
                // return the in Memory Token
                cb(null, tokenObj);
            }
        }
    }

const storeInMemory = (user_id, token)=>{
    console.log("\n ---- QUICKBOOKS Token STORED in Memory to the user: "+user_id);
    return _token[user_id] = token;
}

const readFromMemory = (user_id)=>{
    console.log("\n ----- QUICKBOOKS Token READED from Memory to the user: "+user_id);
    return _token[user_id];
}


module.exports = {
    storeToken: storeToken,
    getToken: getToken
}