'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _utility = require('../lib/utility.js');

var _utility2 = _interopRequireDefault(_utility);

var _jsforce = require('jsforce');

var _jsforce2 = _interopRequireDefault(_jsforce);

var _mongoStorage = require('../lib/mongo-storage.js');

var _mongoStorage2 = _interopRequireDefault(_mongoStorage);

var _config = require('../lib/config.js');

var _config2 = _interopRequireDefault(_config);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var storage = (0, _mongoStorage2['default'])({ mongoUri: (0, _config2['default'])('MONGODB_URI') });

var recordType = {
  Problem: '0120a000000vHVKAA2' // 01239000000EB4OAAW for c0
};

var recordName = {
  '0120a000000vHVKAA2': 'Problem'
};

var record = function record(arg, key) {
  if (!key) return null;
  if (arg === 'id') return recordType[key];
  if (arg === 'name') return recordName[key];
  return null;
};

var oauth2 = new _jsforce2['default'].OAuth2({
  loginUrl: 'https://samanageservicedesk-7030.cloudforce.com',
  clientId: (0, _config2['default'])('SF_ID'),
  clientSecret: (0, _config2['default'])('SF_SECRET'),
  redirectUri: 'https://problem-bot-beta.herokuapp.com/authorize'
});

exports['default'] = function (slackUserId) {
  return new _bluebird2['default'](function (resolve, reject) {
    console.log('[salesforce] ** authenticating user with slackUserId: ' + String(slackUserId) + ' **');
    storage.users.get(slackUserId, function (err, user) {
      if (err) return reject({ text: err });

      if (!user.sf) {
        console.log('[salesforce] ** no connection object found, returning link now **');
        return reject({ text: '\u270B Hold your horses!\nVisit this URL to login to Salesforce: https://problem-bot-beta.herokuapp.com/login/' + String(slackUserId) });
      }

      console.log('[salesforce] ** user found! **');
      var conn = new _jsforce2['default'].Connection({
        oauth2: oauth2,
        instanceUrl: user.sf.tokens.sfInstanceUrl,
        accessToken: user.sf.tokens.sfAccessToken,
        refreshToken: user.sf.tokens.sfRefreshToken
      });

      conn.on('refresh', function (newToken, res) {
        console.log('[salesforce] ** got a refresh event from Salesforce! **\n** new token: ' + String(newToken) + '\nResponse:\n' + String(_util2['default'].inspect(res)) + ' **');
        user.sf.tokens.sfAccessToken = newToken;
        storage.users.save(user);
        return resolve(retrieveSfObj(conn));
      });

      return conn.identity(function (iderr, res) {
        console.log('[salesforce] ** identifying connection **');
        if (iderr || !res || res === 'undefined' || undefined) {
          if (iderr) console.log('[salesforce] ** connection error: ' + String(iderr));else console.log('[salesforce] ** connection undefined **');
          return oauth2.refreshToken(user.sf.tokens.sfRefreshToken).then(function (ret) {
            console.log('[salesforce] ** forcing oauth refresh **\n' + String(_util2['default'].inspect(ret)));
            conn = new _jsforce2['default'].Connection({
              instanceUrl: ret.instance_url,
              accessToken: ret.access_token
            });
            user.sf.tokens.sfAccessToken = ret.access_token;
            user.sf.tokens.sfInstanceUrl = ret.instance_url;
            storage.users.save(user);
            return resolve(retrieveSfObj(conn));
          })['catch'](function (referr) {
            console.log('[salesforce] ** refresh event error! ' + String(referr) + ' **');
            return reject({ text: '\u270B Whoa now! You need to reauthorize first.\nVisit this URL to login to Salesforce: https://problem-bot-beta.herokuapp.com/login/' + String(slackUserId) });
          });
        }
        return resolve(retrieveSfObj(conn));
      });
    });
  });
};

function retrieveSfObj(conn) {
  return {

    // this will become generic Problem creation handler
    newProblem: function () {
      function newProblem(user, subject, platform, priority, origin, description) {
        var _this = this;

        console.log('[salesforce] ** about to create new Problem for ' + String(user));
        var request = void 0;

        return new _bluebird2['default'](function (resolve, reject) {
          return _this.retrieveRecordTypeId('Problem', 'Case').then(function (recordtypeid) {
            return conn.sobject('Case').create({
              SamanageESD__RequesterUser__c: user,
              Subject: String(subject) + ' -- ' + String(platform), // for now we append to subject since i dont have that custom field in tso
              // Platform__c: platform,
              Priority: priority,
              Origin: origin,
              Description: description,
              // OwnerId = 00539000005ozwGAAQ
              RecordTypeId: recordtypeid
            }, function (error, ret) {
              if (error || !ret.success) return reject(error || 'error');
              console.log('>>> New Problem Created - Record id: ' + String(_util2['default'].inspect(ret)));
              return ret;
            });
          }).then(function (ret) {
            console.log('>> getting link and casenumber now');
            request = ret;
            request.link = String(conn.instanceUrl) + '/' + String(ret.id);
            return conn.sobject('Case').retrieve(ret.id, function (err, res) {
              if (err) return reject(err);
              request.CaseNumber = res.CaseNumber;
              return resolve(request);
            });
          })['catch'](function (err) {
            console.log(err);
            return reject('Oops! Something messed up with the Salesforce API');
          });
        });
      }

      return newProblem;
    }(),


    // NOTE: these are the fields we want from this function
    // Name: 'Devin Janus
    // SmallPhotoUrl: 'https://c.cs60.content.force.com/profilephoto/7293C000000CavH/T'
    // MediumPhotoUrl: 'https://c.cs60.content.force.com/profilephoto/7293C000000CavH/M'
    // FullPhotoUrl: 'https://c.cs60.content.force.com/profilephoto/7293C000000CavH/F
    // --> the only difference between photourls is the T/M/F at the end
    getUser: function () {
      function getUser(id) {
        return new _bluebird2['default'](function (resolve, reject) {
          var token = conn.accessToken;
          conn.sobject('User').find({ Id: id }).execute(function (err, records) {
            if (err || !records) reject(err || 'no records found');
            var user = {
              Name: records[0].Name,
              Photo: String(records[0].FullPhotoUrl) + '?oauth_token=' + String(token)
            };
            return resolve(user);
          });
        });
      }

      return getUser;
    }(),
    getUserNameFromId: function () {
      function getUserNameFromId(id, callback) {
        console.log('** [salesforce] looking for user name associated with SF Id: ' + String(id) + ' **');
        conn.query('SELECT SamanageESD__FullName__c FROM User WHERE Id = \'' + String(id) + '\'', function (err, result) {
          if (err) callback(err, null);else {
            callback(null, result.records[0].SamanageESD__FullName__c);
          }
        });
      }

      return getUserNameFromId;
    }(),


    // should store these in mongo so we dont have to query unnessarily
    getUserIdFromName: function () {
      function getUserIdFromName(name, callback) {
        console.log('** [salesforce] looking for SF Id associated with name: ' + String(name) + ' **');
        conn.query('SELECT Id FROM User WHERE SamanageESD__FullName__c = \'' + String(name) + '\'', function (err, result) {
          if (err) callback(err, null);else {
            callback(null, result.records[0].Id);
          }
        });
      }

      return getUserIdFromName;
    }(),
    retrieveRecordTypeId: function () {
      function retrieveRecordTypeId(name, objectType) {
        console.log('** [salesforce] **\n>> grabbing record type id');

        return new _bluebird2['default'](function (resolve, reject) {
          conn.query('SELECT Id, Name FROM RecordType WHERE Name = \'' + String(name) + '\' and sObjectType = \'' + String(objectType) + '\'', function (err, result) {
            if (err) return reject(err);
            console.log('>> result:\n' + String(_util2['default'].inspect(result.records)));
            return resolve(result.records[0].Id);
          });
        });
      }

      return retrieveRecordTypeId;
    }(),
    apiUsage: function () {
      function apiUsage(callback) {
        conn.identity(function (err, res) {
          if (err) callback({ text: err });
          var limit = conn.limitInfo.apiUsage.limit;
          var usage = conn.limitInfo.apiUsage.used;
          console.log(String(res.display_name) + ' - ' + String(res.username) + ' - ' + String(res.user_id) + '\n' + String(res.organization_id));
          console.log(String(usage) + ' / ' + String(limit));
          callback({ text: 'You have used ' + String(usage) + '/' + String(limit) + ' of your API calls from Salesforce' });
        });
      }

      return apiUsage;
    }()
  };
}