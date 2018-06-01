'use strict'

var simpleOauthModule = require('simple-oauth2');
var querystring = require('querystring');
require('dotenv').load();

function OAuth2() {

  const client_id = process.env.OAUTH2_CLIENT_ID;
  const client_secret = process.env.OAUTH2_CLIENT_SECRET;
  const oauth2_auth_host = process.env.OAUTH2_AUTH_HOST;
  const oauth2_auth_path = process.env.OAUTH2_AUTH_PATH;
  const oauth2_token_host = process.env.OAUTH2_TOKEN_HOST;
  const oauth2_token_path = process.env.OAUTH2_TOKEN_PATH;
  const oauth2_redirect_uri = process.env.OAUTH2_REDIRECT_URI;
  const oauth2_scope = 'com.intuit.quickbooks.accounting';
  const oauth2_state = 'JShs&ˆ($42';
  
  if (!client_id && !client_secret && !oauth2_token_host && !oauth2_auth_host && !oauth2_auth_path && !oauth2_token_path
     && !oauth2_redirect_uri) {
    throw new Error('Require a complete configuration for OAuth2. Please check the file .env at the root of the app.');
  }  
  
  // key track of redirect_uri
  this.oauth2_redirect_uri = oauth2_redirect_uri;
  this.oauth2_state = oauth2_state;
  
  this.oauth2 = simpleOauthModule.create({
	  client: {
	    id: client_id,
	    secret: client_secret
	  },
	  auth: {
      authorizeHost: oauth2_auth_host,
	    tokenHost: oauth2_token_host,
	    tokenPath: oauth2_token_path,
	    authorizePath: oauth2_auth_path
	  },
    options: {
      useBasicAuthorizationHeader: true,
      useBodyAuth: false
    }
  });
		
	// Authorization uri definition
	this.authorizationUri = this.oauth2.authorizationCode.authorizeURL({
	  redirect_uri: oauth2_redirect_uri,
	  scope: oauth2_scope,
		state: oauth2_state,
	});	
}	

// get /oauth
OAuth2.prototype.auth = function(req, res, next) {
  res.redirect(this.authorizationUri, next);
};

// get /callback
OAuth2.prototype.callback = function(req, res, data, callback) {
  var state = req.query.state;

  if(state != this.oauth2_state){
    console.error("The state received in the callback doesn't match the one sent.");
    res.send('<html><head></head><body onload="javascript:window.close();"></body></html>');
    return;
  }
  
  const code = req.query.code;
  const options = {
    code: code,
    redirect_uri: this.oauth2_redirect_uri
  };

  this.oauth2.authorizationCode.getToken(options, (error, result) => {  
    if (error) {
      res.status(403);  
      res.end('<html><head></head><body onload="javascript:window.close();"></body></html>');
      callback('Access Token Error: '+error.message, null);
    }

    let token = this.oauth2.accessToken.create(result);    
    token.realmId = req.query.realmId;

    res.status(200);
    res.end('<html><head></head><body onload="javascript:window.close();"></body></html>');
    
    // console.log("\n\nGOT TOKEN:"+JSON.stringify(token));
    callback(null, token);
  });

};

OAuth2.prototype.isValid = (tokenObject)=>{
  // Provide a window of time before the actual expiration to refresh the token
  const EXPIRATION_WINDOW_IN_SECONDS = 300;

  const expirationTimeInSeconds = tokenObject.expires_at.getTime() / 1000;
  const expirationWindowStart = expirationTimeInSeconds - EXPIRATION_WINDOW_IN_SECONDS;

  // If the start of the window has passed, refresh the token
  const nowInSeconds = (new Date()).getTime() / 1000;
  const result = expirationWindowStart > nowInSeconds;

  // console.log("\n\nToken is valid? "+result)
  return result;
}

OAuth2.prototype.refresh = (tokenObject, cb)=>{
  
  //Check if the token has expired
  console.log("\n\nRefreshing QB Access Token!");

  // Callbacks
  const _url = process.env.OAUTH2_TOKEN_HOST + process.env.OAUTH2_TOKEN_PATH;
  const basic = Buffer.from(process.env.OAUTH2_CLIENT_ID + ":" + process.env.OAUTH2_CLIENT_SECRET).toString('base64');

  const json = {
    "grant_type": "refresh_token",
    "refresh_token": tokenObject.refresh_token
  }

  request({
          method: 'post',
          url: _url,
          headers: {'Authorization': 'Basic ' + basic,
                      'Content-Type': 'application/x-www-form-urlencoded'},
          body: querystring.stringify(json)
      }, function (err, response, body){
          if (err) {
              console.error('queryQuickbooks: API call failed:'+err);
              cb(err, null);
          }else{
            const result = JSON.parse(response.body);
            result.expires_at = new Date(Date.now() + (result.expires_in * 1000));

            cb(null, result);
          }
        });
};

module.exports = OAuth2;
