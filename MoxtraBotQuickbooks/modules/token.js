const OAuth2 = require('./oauth');

const storeToken = (tokenObj, cb)=>{
    
    if(!tokenObj){
        console.log('Missing parameters for storeToken.');
        cb('Missing parameters for storeToken.', null);
        return;
    }
    
    console.log(`Storing Token in DB! org:${tokenObj.bot.org_id} client:${tokenObj.bot.client_id}`);

    //first time getting token
    if(!tokenObj.company.name){        
        //get Company's name
        const qb = require('./qbapi');
        qb.getCompanyInfo(tokenObj, (err, data)=>{
            if(err || !data){
                console.log('\storeToken: Error getting Company Info:'+err);
            }else{
                tokenObj.company.name = data.Company[0].CompanyName;

                //refreshing token
                database.updateQBToken(tokenObj, (err, result)=>{
                    if(err){
                        console.log("Error updating token in DB: "+err);
                        cb("Error updating token in DB: "+err, null);
                    }else{
                        console.log(`Storing Token in Memory! org:${tokenObj.bot.org_id} client:${tokenObj.bot.client_id}`);
                        
                        //second keep it in memory to increase performance
                        cb(null, storeInMemory(tokenObj));
                    }
                });
            }
        }); 
    }else{
        //refreshing token
        database.updateQBToken(tokenObj, (err, result)=>{
            if(err){
                console.log("Error updating token in DB: "+err);
                cb("Error updating token in DB: "+err, null);
            }else{
                console.log(`Storing Token in Memory! org:${tokenObj.bot.org_id} client:${tokenObj.bot.client_id}`);
                
                //second keep it in memory to increase performance
                cb(null, storeInMemory(tokenObj));
            }
        });
    }
}

const getToken = (org_id, client_id, cb)=>{
    console.log(`\n\nGetting Quickbooks TOKEN. org:${org_id} client:${client_id}`);

    if(!org_id || !client_id){
        console.log('Missing parameters for getToken.');
        cb('Missing parameters for getToken.', null);
        return;
    }
    
    const oauth2 = new OAuth2();
    const tokenObj = readFromMemory(org_id, client_id);

    //if token in memory and valid
    if(!tokenObj){
        console.log('No Token in memory. Feaching DB...');
        //get token from DB
        database.getQBToken(org_id, client_id, (err, result)=>{
            if(err){
                cb(err, null);
            }else{
                //check if is valid
                if(!oauth2.isValid(result.token)){
                    console.log('DB Token NOT VALID!');

                    //refresh the token
                    oauth2.refresh(result.token, (err, new_token)=>{
                        if(err){
                            cb('Error refreshing the token: '+err, null);
                            return;
                        }
            
                        //replace actual token by a renewed one
                        result.token = new_token;
                        console.log("Token Renewed!");

                        //store new token 
                        storeToken(result, (err, result)=>{
                            cb(err, result);
                            return;
                        });   
                    });
                }else{
                    console.log('DB Token IS VALID :D\nStoring IN MEMORY!!!!');
                    //store token in memory 
                    storeInMemory(result);
                    cb(null, result);
                }
            }
        });   

    }else{
        console.log('There is a Token in Memory');
        //check if is valid
        if(!oauth2.isValid(tokenObj.token)){
            console.log('Memory Token NOT VALID!');

            //get token from DB
            database.getQBToken(org_id, client_id, (err, result)=>{
                if(err){
                    cb(err, null);
                }else{
                    //check if is valid
                    if(!oauth2.isValid(result.token)){
                        console.log('DB Token NOT VALID!');

                        //refresh the token
                        oauth2.refresh(result.token, (err, new_token)=>{
                            if(err){
                                cb('Error refreshing the token: '+err, null);
                                return;
                            }
                
                            //replace actual token by a renewed one
                            result.token = new_token;
                            console.log("Token Renewed!");

                            //store new token 
                            storeToken(result, (err, result)=>{
                                cb(err, result);
                                return;
                            });   
                        });
                    }else{
                        console.log('DB Token IS VALID :D\nStoring IN MEMORY!!!!');
                        //store token in memory 
                        storeInMemory(result);
                        cb(null, result);
                    }
                }
            });
            
            /* 
                //refresh the token
                // oauth2.refresh(tokenObj.token, (err, new_token)=>{
                //     if(err){
                //         cb('Error refreshing the QUICKBOOKS token: '+err, null);
                //         return;
                //     }
        
                //     //replace actual token by a renewed one
                //     tokenObj.token = new_token;

                //     //store new token 
                //     storeToken(tokenObj, (err, result)=>{
                //         console.log('getToken: In memory QUICKBOOKS Token not valid. Refreshing DB and Memory');
                //         cb(err, result);
                //         return;
                //     });   
                // });
            */
        }else{
            console.log('Using Token From Memory!! :D');
            // return the in Memory Token
            cb(null, tokenObj);
        }
    }
}

const storeInMemory = (tokenObj)=>{
    // tokenObj.token.expires_at = new Date("2018-06-01T21:42:31.903Z");
    return _token[tokenObj.bot.org_id+tokenObj.bot.client_id] = tokenObj;
}

const readFromMemory = (org_id, client_id)=>{
    return _token[org_id+client_id];
}

const cleanInMemoryToken = (org_id, client_id)=>{
    console.error(`Warning -> Memory QB Token cleanned for org: ${org_id} and client: ${client_id}`);
    return _token[org_id+client_id] = {};
}


module.exports = {
    storeToken: storeToken,
    getToken: getToken,
    cleanInMemoryToken: cleanInMemoryToken
}