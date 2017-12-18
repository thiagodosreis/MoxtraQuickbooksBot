'use strict'

var simpleOauthModule = require('simple-oauth2');
require('dotenv').load();

function OAuth2(bot) {

  this.bot = bot;

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
OAuth2.prototype.auth = function(req, res) {
  res.redirect(this.authorizationUri);
};

// get /callback
OAuth2.prototype.callback = function(req, res, moxtraobj) {
  var state = req.query.state;
  if(state != this.oauth2_state){
    this.bot.emit("access_token", {}, null, moxtraobj, req);
    console.error("The state received in the callback doesn't match the one sent.");
    res.send('<html><head></head><body onload="javascript:window.close();"></body></html>');
    return;
  }

  //company ID
  var realmID = req.query.realmId;
  
  console.log("State:"+state+" - RealmID:"+realmID);
  const code = req.query.code;
  const options = {
    code: code,
    redirect_uri: this.oauth2_redirect_uri
  };

  this.oauth2.authorizationCode.getToken(options, (error, result) => {
    if (error) {
      console.error('Access Token Error', error.message);
      this.bot.emit("access_token", {}, null, moxtraobj, req);
      res.send('<html><head></head><body onload="javascript:window.close();"></body></html>');
      return res.json('Authentication failed');
    }

    const token = this.oauth2.accessToken.create(result);    
    // console.log('The resulting token: ', result);

    res.send('<html><head></head><body onload="javascript:window.close();"></body></html>');
    res.status(200);

    console.log("/n/n####07: Emit access_token");
    this.bot.emit("access_token", token, realmID, moxtraobj, req);
  });

};

module.exports = OAuth2;
