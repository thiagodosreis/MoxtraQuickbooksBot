const OAuth2 = require('./oauth');

const storeToken = (tokenObj, cb)=>{
    
    if(!tokenObj){
        console.log('Missing parameters for storeToken.');
        cb('Missing parameters for storeToken.', null);
        return;
    }


    //user loggin in
    if(!tokenObj.company.name){        
        //get Company's name
        const qb = require('./qbapi');
        qb.getCompanyInfo(tokenObj, (err, data)=>{
            if(err || !data){
                console.log('\storeToken: Error getting Company Info:'+err);
            }else{
                tokenObj.company.name = data.Company[0].CompanyName;

                console.log(`Storing Token in DB! org:${tokenObj.bot.org_id} client:${tokenObj.bot.client_id}`);

                //refreshing token
                database.updateQBToken(tokenObj, (err, result)=>{
                    if(err){
                        console.log("Error updating token in DB: "+err);
                        cb("Error updating token in DB: "+err, null);
                    }
                    
                    if(result){
                        console.log(`Storing Token in Memory! org:${tokenObj.bot.org_id} client:${tokenObj.bot.client_id}`);

                        //second keep it in memory to increase performance
                        cb(null, storeInMemory(tokenObj));
                    }else{
                        console.error(`Error storing Token in Memory! org:${tokenObj.bot.org_id} client:${tokenObj.bot.client_id}`);
                        cb(null, null);
                    }
                });
            }
        }); 
    }
    else{
        console.log(`Storing Token in DB! org:${tokenObj.bot.org_id} client:${tokenObj.bot.client_id}`);

        //app automatically refreshing the token
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
    console.log(`\nGetting Quickbooks TOKEN. org:${org_id} client:${client_id}`);

    if(!org_id || !client_id){
        console.log('Missing parameters for getToken.');
        cb('Missing parameters for getToken.', null);
        return;
    }
    
    const oauth2 = new OAuth2();
    const tokenObj = readFromMemory(org_id, client_id);
    
    //No Token in memory
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
                        console.log("Token Renewed 1!");

                        //store new token 
                        storeToken(result, (err, res)=>{
                            cb(err, res);
                            return;
                        });   
                    });
                }else{
                    console.log('DB Token IS VALID, Storing IN MEMORY!!!!');
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
                            storeToken(result, (err, res)=>{
                                cb(err, res);
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
            console.log('Using Token From Memory!! :D');
            // return the in Memory Token
            cb(null, tokenObj);
        }
    }
}

const storeInMemory = (aa)=>{
    // console.log("Stored inMemoryToken:"+JSON.stringify(aa));
    return _token[aa.bot.org_id+aa.bot.client_id] = aa;
}

const readFromMemory = (org_id, client_id)=>{
    // console.log("Readed from inMemoryToken:"+JSON.stringify(_token[org_id+client_id]));
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