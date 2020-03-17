var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var xlsx = require('xlsx');
global.__base = __dirname + '/';
var properties = require(__base + 'AppConfigManager')(
    __base + 'appconfig.properties');
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var request = require('request')


var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
var env = process.env.NODE_ENV || 'AIT';
app.locals.ENV = env;
console.log("Running environment : " + app.locals.ENV);
console.log(properties.get('AIT.NG_URL'))
console.log(properties.get('AIT.NG_CLIENT_SECRET'))

//code for async version
var workbook = xlsx.readFile('sample.csv');
var xlsheet = workbook.SheetNames;
var rowObject = xlsx.utils.sheet_to_json(workbook.Sheets[xlsheet[0]]);
//console.log(rowObject);
//iterateRows(rowObject);
batchingAsynchronous(rowObject);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});



async function batchingAsynchronous(rowObject){
  var arrayOfBatchedUsers = [];
  const maxUserLimit =  20;

   let splitBatches = rowObject.map(async function (value, index, array) {
    var batchStart = index * maxUserLimit;

    if (batchStart < array.length) {
      const batchedUsersLists = (array.slice(batchStart, batchStart + maxUserLimit));
      arrayOfBatchedUsers.push(batchedUsersLists);
    }

  });

   Promise.all(arrayOfBatchedUsers).then(async userBatch => {
     // Run the batch list asynchrnously

     for ( let i =0; i < userBatch.length; i++){
       //send a batch for async deletion and wait for the entire batch to be completed
       var processBatch = await(processBatchAsynchronously(userBatch[i]));
       console.log(`Batch # ${i+1} has completed`)

     }

   })

  async function processBatchAsynchronously(batchUsersList){
     let batchCompletion = [];

    batchUsersList.map((x) => {
      batchCompletion.push(
          initiateDeletion(x.Name, "ibmUniqueID", "AIT", false).then(success => {
            console.log(`Success in deleting the user ${x.Name} `);
            return success;
          })
              .catch(err => {
                console.log(`Error in deleting the user ${x.Name}; Reason: ${err}`)
              })
      )
    })
    const batchCompletionStatus = await Promise.all(batchCompletion);
  }

}

async function synchronousProcess(rowObject){

  var arrayOfArrays = [];

  rowObject.map(x => {
    arrayOfArrays.push(x)
  })

  for ( let i=0; i<arrayOfArrays.length; i++){
    const runSynchronously = await(initiateDeletion(arrayOfArrays[i].Name, 'ibmUniqueID', false).catch(reason => console.log(reason)));
    console.log(i);;

  }

}



async function initiateDeletion(searchText, searchFilter, env, delInstant){
  return new Promise(function(resolve, reject){
    console.log("Initiating deletion request for the user " + searchText)
    var NG_URL = properties.get(env + '.NG_URL');
    var NG_CLIENT_ID = properties.get(env + '.NG_CLIENT_ID');
    var NG_CLIENT_SECRET = properties.get(env + '.NG_CLIENT_SECRET');
    var ngHeaders = {
      'Cache-Control': 'no-cache',
      'isUserAuthenticated': 'true',
      'Content-Type': 'application/json',
      'x-ibm-client-secret': NG_CLIENT_SECRET,
      'x-ibm-client-id': NG_CLIENT_ID,
      'profile-client-id': NG_CLIENT_ID,
      'Accept': 'application/json'
    };
    var filter='';

    if (searchFilter =='username') {
      filter = { username: '' + searchText };
    } else if ( searchFilter =='ibmUniqueID') {
      filter = { ibmUniqueID: '' + searchText };
    } else if ( searchFilter =='id') {
      filter = { id: '' + searchText };
    }

    if (delInstant === 'TRUE') {
      filter.daystodelete = 0
    }

    var options = {
      method: 'DELETE',
      rejectUnauthorized: false,
      url: NG_URL,
      headers: ngHeaders,
      qs: filter
    }

    request(options, function(err, res, body){

      if(err){
        //console.log("Error in sending batch request for deletion > " + err);
        reject(err);
      }else {
        if(res.statusCode == 200){
          resolve(body);
        }else{
          var obj;
          try{
            obj = JSON.parse(body)
          } catch (e){
            obj = JSON.parse(JSON.stringify(body))
          }
          //removing that schema key from the object before returning the error to the callee
          delete obj['schemas']
          reject(JSON.stringify(obj));
        }
      }
    })
  })
}


// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
