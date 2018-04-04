'use strict';

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
require('dotenv').load();

const dburl = process.env.DATABASE;
let db;

module.exports = {

    connect: (callback) => {
        MongoClient.connect(dburl, (err, database) => {
            assert.equal(null, err);
            
            console.log("Successfully connected to MongoDB.");
    
            db = database.db();
            callback();
        });
    },

    getAllBots: (callback) => {
        const collec = db.collection('bots');
    
        collec.find({}).toArray((err, docs)=>{
            assert.equal(null, err);
            callback(null, docs);  
        });
    },

    getAllBotsPublicInfo: (callback) => {
        const collec = db.collection('bots');
    
        collec.find({}).toArray((err, docs)=>{
            assert.equal(null, err);

            let publicObj = [];
            docs.forEach((e)=>{
                delete e.token;
                publicObj.push(e);
            });

            callback(null, publicObj);  
        });
    },

    getBot: (id, org, callback) => {
        const collec = db.collection('bots');
        const query = {_id: id, org_id: org};
    
        collec.findOne(query, (err, doc)=>{
            assert.equal(null, err);
    
            if(!doc){
                callback("Error: No bot app with the client_id: "+id+" and org_id: "+org+" found in the DB.", null);
            }else{
                callback(null, doc);
            }
        });
    },

    insertBot: (data, callback) => {
        const collec = db.collection('bots');
    
        if(data._id && data.secret && data.org_id && data.env && data.name && data.endpoint){
            const query = {_id: data._id, secret: data.secret, org_id: data.org_id, env: data.env, name: data.name, endpoint: data.endpoint};
            collec.insertOne(query, (err, r)=>{
                if(err){
                    callback(err.message, null);
                }else{
                    callback(null, "Successfully inserted "+r.insertedCount+" document.");
                }
            });
        }else{
            callback("Missign data",null);
        }  
    },

    updateBot: (id, org, data, callback) => {
        const collec = db.collection('bots');
    
        if(id && org){
            delete data._id;
            delete data.org_id;
            collec.updateOne({_id: id, org_id: org}, {$set: data }, (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.modifiedCount == 1){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                }
            });
        }else{
            callback("Missign key data: client_id and org_id.",null);
        }  
    },

    updateBotToken: (id, org, token, callback) => {
        const collec = db.collection('bots');
    
        collec.updateOne({_id: id, org_id: org}, {$set: { token: token } }, (err, r)=>{
            assert.equal(null, err);
    
            if(r.modifiedCount == 1){
                callback(true);
            }else{
                callback(false);
            }
            
        });
    },

    deleteBot: (id, org, callback) => {
        const collec = db.collection('bots');
    
        if(id && org){
            collec.deleteOne({_id: id, org_id: org}, 1, (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.deletedCount == 1){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                }
            });
        }else{
            callback("Missign key data: client_id and org_id.",null);
        }  
    },

    getQBToken: (user_id, callback) => {
        const collec = db.collection('tokens');
        const query = {_id: user_id};
    
        collec.findOne(query, (err, doc)=>{
            assert.equal(null, err);
    
            if(!doc){
                callback("Error: No token with the user_id: "+user_id+" found in the DB.", null);
            }else{
                callback(null, doc);
            }
        });
    },

    updateQBToken: (user_id, token, callback) => {
        const collec = db.collection('tokens');
    
        if(user_id && token){
            collec.updateOne({_id: user_id}, {$set: token }, {upsert: true} , (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.modifiedCount == 1 || r.upsertedId){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                }
            });
        }else{
            callback("Missign key data: user_id and token.",null);
        }  
    },

    getConversation: (binder_id, user_id, callback) => {
        const collec = db.collection('conversations');
        const query = {binder_id, user_id};
    
        collec.findOne(query, (err, doc)=>{
            if(err){
                callback(err, null);
                return;
            }
    
            callback(null, doc);    
        });
    },

    updateConversation: (binder_id, user_id, conversation, callback) => {
        const collec = db.collection('conversations');
    
        if(binder_id && user_id && data){
            collec.updateOne({binder_id, user_id}, {$set: {conversation} }, {upsert: true} , (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.modifiedCount == 1 || r.upsertedId){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                    
                }
            });
        }else{
            callback("Missign key values binder_id, user_id, data.",null);
        }  
    },

    updateOnlyConversation: (binder_id, user_id, conversation, callback) => {
        const collec = db.collection('conversations');
    
        if(binder_id && user_id && data){
            collec.updateOne({binder_id, user_id}, {$set: {conversation} }, {upsert: false} , (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.modifiedCount == 1){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                    
                }
            });
        }else{
            callback("Missign key values binder_id, user_id, data.",null);
        }  
    },

    deleteConversation: (binder_id, user_id, callback) => {
        const collec = db.collection('conversations');
    
        if(binder_id && user_id){
            collec.deleteOne({binder_id, user_id}, 1, (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.deletedCount == 1){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                }
            });
        }else{
            callback("Missign key data: binder_id, user_id.",null);
        }  
    }

}