'use strict';

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _jsforce = require('jsforce');

var _jsforce2 = _interopRequireDefault(_jsforce);

var _config = require('../lib/config.js');

var _config2 = _interopRequireDefault(_config);

var _mongoStorage = require('../lib/mongo-storage.js');

var _mongoStorage2 = _interopRequireDefault(_mongoStorage);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var storage = (0, _mongoStorage2['default'])({ mongoUri: (0, _config2['default'])('MONGODB_URI') });

// ************************************** //
// Establish connection to Salesforce API //
// ************************************** //

var oauth2 = new _jsforce2['default'].OAuth2({
  loginUrl: 'https://samanageservicedesk-7030.cloudforce.com',
  clientId: (0, _config2['default'])('SF_ID'),
  clientSecret: (0, _config2['default'])('SF_SECRET'),
  redirectUri: 'https://problem-bot-beta.herokuapp.com/authorize'
});

exports.login = function (req, res) {
  console.log('[salesforce-auth] ** Starting up salesforce-auth.login now **');
  console.log('[salesforce-auth] ** req params: ' + String(_util2['default'].inspect(req.param)));
  console.log('[salesforce-auth] ** req url: ' + String(_util2['default'].inspect(req.url)));
  var redir = oauth2.getAuthorizationUrl({ scope: 'api id web refresh_token' });
  redir += '&state=' + String(req.params.slackUserId);
  console.log('[salesforce-auth] ** generated our salesforce auth url: ' + String(redir));
  res.redirect(redir);
};

exports.oauthCallback = function (req, res) {
  var sfTokens = void 0;
  var slackUserId = req.query.state;
  var code = req.query.code;
  var conn = new _jsforce2['default'].Connection({ oauth2: oauth2 });
  console.log('Connection\n' + String(_util2['default'].inspect(conn)));

  conn.on('refresh', function (newToken, refres) {
    console.log('[salesforce-auth] ** got a refresh event from Salesforce! **\n** new token: ' + String(newToken) + '\nResponse:\n' + String(_util2['default'].inspect(refres)));
    sfTokens.sfAccessToken = newToken;
    storage.users.get(slackUserId, function (storeErr, user) {
      if (storeErr) console.log('Error obtaining user: \' + slackUserId + \' -- ' + String(storeErr));
      user.sf.tokens = sfTokens;
      storage.users.save(user);
    });
  });

  conn.authorize(code, function (err, userInfo) {
    if (err) res.status(500).send('AUTH ERROR: ' + String(err));
    console.log('User ID: ' + String(userInfo.id));
    console.log('Org ID: ' + String(userInfo.organizationId));
    console.log('Server URL: ' + String(userInfo.url));

    sfTokens = {
      id: userInfo.id,
      org: userInfo.organizationId,
      tokens: {
        sfInstanceUrl: conn.instanceUrl,
        sfAccessToken: conn.accessToken,
        sfRefreshToken: conn.refreshToken
      }
    };
    console.log('[salesforce-auth] ** connected to sf instance: ' + String(conn.instanceUrl) + '\n');
    var html = '\n      <html>\n      <body style="text-align:center;padding-top:100px">\n      <img src="images/linked.png"/>\n      <div style="font-family:\'Helvetica Neue\';font-weight:300;color:#444">\n          <h2 style="font-weight: normal">Authentication Complete!</h2>\n          Your Slack User Id is now linked to your Salesforce User Id.<br/>\n          You can now go back to Slack and execute authenticated commands to your Samanage Enterprise Service Desk.\n      </h2>\n      </body>\n      </html>\n    ';

    storage.users.get(slackUserId, function (error, user) {
      if (err) console.log('Error obtaining user: ' + String(slackUserId) + ' -- ' + String(error));
      console.log('** storing user now **\n' + String(_util2['default'].inspect(user)));
      user.sf = sfTokens;
      console.log('about to save updated user data:\n' + String(_util2['default'].inspect(user)));
      storage.users.save(user);
    });

    res.send(html);
  });
};