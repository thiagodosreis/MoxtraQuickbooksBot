module.exports = {

    storeToken: (user_id, token, cb)=>{
        console.log('\n\nStoring token to the user: '+user_id);
        
        if(database && user_id && token){
            database.updateQBToken(user_id, token, (err, result)=>{
                if(err){
                    console.log("Error updating token in DB: "+err);
                    cb("Error updating token in DB: "+err, null);
                }else{
                    console.log("Token stored sucessfully!");
                    cb(null, true);
                }
            });
        }else if(user_id && token){
            _token[user_id] = token;
            console.log("Token stored to the user");
            cb(null, true);
        }
        else{
            console.log('Missing parameters for storeToken.');
            cb('Missing parameters for storeToken.', null);
        }
    },

    getToken: (user_id, cb)=>{
        console.log('\n\nGetting token to the user: '+user_id);
        
        if(database && user_id){
            database.getQBToken(user_id, (err, result)=>{
                if(err){
                    console.log(err);
                    cb(err, null);
                }else{
                    console.log("Got token:"+JSON.stringify(result));
                    cb(null, result);
                }
            });
        }else if(_token && user_id){
            return _token[user_id];
            cb(null, _token[user_id]);
        }else{
            console.log('Missing parameters for getToken.');
            cb('Missing parameters for getToken.', null);
        }
    }
}