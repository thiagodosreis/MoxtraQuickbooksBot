module.exports = {

    storeToken: (user_id, token)=>{
        console.log('Storing token to the user');
        if(_token && user_id && token){

            _token[user_id] = token;
            console.log("Token stored to the user");
        }
        else{
            console.log('Missing parameters.');
        }
    },

    getToken: (user_id)=>{
        return _token[user_id];
    },

}