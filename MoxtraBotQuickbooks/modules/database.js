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

    getQBToken: (org_id, client_id, callback) => {
        const collec = db.collection('tokens');
        const query = {"bot.org_id": org_id, "bot.client_id": client_id};
    
        collec.findOne(query, (err, doc)=>{
            assert.equal(null, err);
    
            if(!doc){
                callback(`Error: No token with the Org_id: ${org_id} and Client_id: ${client_id} found in the DB.`, null);
            }else{
                callback(null, doc);
            }
        });
    },

    queryQBToken: (query, callback) => {
        const collec = db.collection('tokens');
    
        collec.findOne(query, (err, doc)=>{
            assert.equal(null, err);
    
            if(!doc){
                callback(`Error: No token for query: ${JSON.stringify(query)} found in the DB.`, null);
            }else{
                callback(null, doc);
            }
        });
    },

    updateQBToken: (tokenObj, callback) => {
        const collec = db.collection('tokens');
    
        if(tokenObj){        
            collec.updateOne({"bot.org_id": tokenObj.bot.org_id, "bot.client_id": tokenObj.bot.client_id}, {$set: tokenObj }, {upsert: true} , (err, r)=>{
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

    getAlerts: (query, projection, callback)=>{
        const collec = db.collection('alerts');

        //cursor to the query db (pointer only)
        const cursor = collec.find(query);
        cursor.project(projection);
        cursor.sort({"binder.org_id": 1, "binder.client_id": 1});

        cursor.toArray((err, docs)=>{
            assert.equal(null, err);
            
            callback(null, docs);  
        });
    },

    updateAlerts: (query, update, upsert, callback)=>{
        const collec = db.collection('alerts');
    
        console.log("query:"+JSON.stringify(query));
        console.log("update:"+JSON.stringify(update));
        console.log("upsert:"+JSON.stringify(upsert));

        if(query && update){
            collec.updateMany(query, update, {upsert: upsert} , (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.modifiedCount >= 1 || r.upsertedId){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                }
            });
        }else{
            callback("Missign data to updateAlerts.",null);
        }  
    }

}