// Module to handler the API resquest to update the DB

module.exports = {

    getAllBots: (req, res, database)=>{
        validateAPItoken(req, res, ()=>{
            database.getAllBotsPublicInfo((err, results)=>{
                presentAPIresult(res, err, results);
            });
        });
    },

    getBot: (req, res, database)=>{
        validateAPItoken(req, res, ()=>{
            database.getBot(req.params['id'], req.params['org'], (err, result)=>{
                result && delete result.token;
                presentAPIresult(res, err, result);
            });
        });
    },

    postBot: (req, res, database)=>{
        validateAPItoken(req, res, ()=>{
            const data = req.body;
            if(!data){
                res.sendStatus(400);
                return;
            } 
            
            database.insertBot(data, (err, result)=>{
                presentAPIresult(res, err, result);
            });
        });
    },

    putBot: (req, res, database)=>{
        validateAPItoken(req, res, ()=>{
            const data = req.body;
            if(!data){
                res.sendStatus(400);
                return;
            } 
            
            database.updateBot(req.params['id'], req.params['org'], data, (err, result)=>{
                presentAPIresult(res, err, result);
            });
        });
    },

    deleteBot: (req, res, database)=>{
        validateAPItoken(req, res, ()=>{
            database.deleteBot(req.params['id'], req.params['org'], (err, result)=>{
                presentAPIresult(res, err, result);
            });
        });
    }
}

function validateAPItoken(req, res, callback){
    const token = req.headers['authorization'];
    if(token){
        if(token != "Bearer "+ process.env.MOXTRA_API_TOKEN){
            res.status(403);
            res.send("Invalid token!");
            return;
        }

        callback();
    }else{
        // bad request
        res.sendStatus(400);
    }
}

function presentAPIresult(res, err, result){
    if(err){ 
        res.status(500);
        res.send(err);
    }else{
        res.status(200);
        res.send(result);
    }
}