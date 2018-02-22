'use strict';

var _botkit = require('botkit');

var _botkit2 = _interopRequireDefault(_botkit);

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _config = require('./lib/config.js');

var _config2 = _interopRequireDefault(_config);

var _mongoStorage = require('./lib/mongo-storage.js');

var _mongoStorage2 = _interopRequireDefault(_mongoStorage);

var _salesforce = require('./sf/salesforce');

var _salesforce2 = _interopRequireDefault(_salesforce);

var _salesforceAuth = require('./sf/salesforce-auth.js');

var _salesforceAuth2 = _interopRequireDefault(_salesforceAuth);

var _dateformat = require('dateformat');

var _dateformat2 = _interopRequireDefault(_dateformat);

var _utility = require('./lib/utility.js');

var _utility2 = _interopRequireDefault(_utility);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var mongoStorage = (0, _mongoStorage2['default'])({ mongoUri: (0, _config2['default'])('MONGODB_URI') });
var port = process.env.PORT || process.env.port || (0, _config2['default'])('PORT');
if (!port) {
  console.log('Error: Port not specified in environment');
  process.exit(1);
}

if (!(0, _config2['default'])('SLACK_CLIENT_ID') || !(0, _config2['default'])('SLACK_CLIENT_SECRET')) {
  console.log('Error: Specify Slack Client Id and Client Secret in environment');
  process.exit(1);
}

var controller = _botkit2['default'].slackbot({
  token: (0, _config2['default'])('SLACK_BOT_TOKEN'),
  storage: mongoStorage,
  interactive_replies: true,
  rtm_receive_messages: true
}).configureSlackApp({
  clientId: (0, _config2['default'])('SLACK_CLIENT_ID'),
  clientSecret: (0, _config2['default'])('SLACK_CLIENT_SECRET'),
  clientVerificationToken: (0, _config2['default'])('SLACK_VERIFY'),
  redirectUri: 'https://problem-bot-beta.herokuapp.com/oauth',
  scopes: ['bot', 'incoming-webhook', 'channels:history', 'groups:history']
});

controller.setupWebserver(port, function (err, webserver) {
  if (err) console.log(err);
  controller.createHomepageEndpoint(controller.webserver);
  controller.createWebhookEndpoints(controller.webserver);
  controller.createOauthEndpoints(controller.webserver, function (authErr, req, res) {
    if (authErr) res.status(500).send('ERROR: ' + String(authErr));else res.send('Success! Problem Bot (beta) has been added to your team');
  });

  webserver.get('/', function (req, res) {
    res.send('<a href="https://slack.com/oauth/authorize?scope=bot&' + 'client_id=64177576980.310915268453"><img alt="Add to Slack" ' + 'height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" ' + 'srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x,' + 'https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>');
  });

  webserver.get('/login/:slackUserId', _salesforceAuth2['default'].login);
  webserver.get('/authorize', _salesforceAuth2['default'].oauthCallback);
});

var _bots = {};
var _team = [];
function trackBot(bot) {
  _bots[bot.config.token] = bot;
}

// quick greeting/create convo on new bot creation
controller.on('create_bot', function (bot, botConfig) {
  console.log('** bot is being created **');

  if (_bots[bot.config.token]) {
    // do nothing
    console.log('--> bot: ' + String(bot.config.token) + ' already exists');
  } else {
    bot.startRTM(function (err) {
      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({ user: botConfig.createdBy }, function (error, convo) {
        if (error) {
          console.log(error);
        } else {
          convo.say('Howdy! I am the bot that you just added to your team.');
          convo.say('All you gotta do is send me messages now');
        }
      });
    });
  }
});

controller.startTicking();

controller.on('rtm_close', function (bot) {
  console.log('** The RTM api just closed');
  // may want to attempt to re-open
});

// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
  console.log('** The RTM api just connected!');
  // getUserEmailArray(bot)
});

controller.hears(['hello'], 'direct_message,direct_mention', function (bot, message) {
  bot.reply(message, 'what it do fam');
});

controller.hears(['(.*)'], 'direct_mention', function (bot, message) {
  var subject = message.text;
  console.log('Text: ' + String(subject));

  controller.storage.users.get(message.user, function (error, user) {
    if (error) console.log(error);

    console.log('user to pass to sf: ' + String(_util2['default'].inspect(user)));

    bot.reply(message, {
      attachments: [{
        title: 'Create new problem with subject: "' + String(subject) + '"?',
        callback_id: String(user.sf.id) + ':' + String(subject),
        attachment_type: 'default',
        actions: [{
          name: 'create',
          text: 'Create',
          value: 'create',
          type: 'button'
        }, {
          name: 'cancel',
          text: 'Cancel',
          value: 'cancel',
          type: 'button'
        }]
      }]
    });
  });
});

controller.on('interactive_message_callback', function (bot, trigger) {
  console.log('>> interactive_callback heard by controller');

  if (trigger.actions[0].name.match(/create/)) {
    var callbackids = _lodash2['default'].split(trigger.callback_id, ':');
    var usersf = callbackids[0];
    var subject = callbackids[1];
    var dialog_id = String(usersf) + ':' + String(subject);

    if (callbackids.length > 2) {
      var from = _lodash2['default'].split(trigger.callback_id, ':')[2];
      var to = _lodash2['default'].split(trigger.callback_id, ':')[3];
      console.log('\n>> capture: ' + String(from) + ' - ' + String(to));
      dialog_id += ':' + String(from) + ':' + String(to);
    }

    console.log('>> ' + String(usersf) + '\n>> new problem: ' + String(subject));

    var elements = [{
      label: 'Subject',
      name: 'subject',
      type: 'text',
      value: '' + String(subject)
    }, {
      label: 'Platform',
      name: 'platform',
      type: 'select',
      value: null,
      options: [{ label: 'SSP', value: 'SSP' }, { label: 'SSF', value: 'SSF' }, { label: 'ISD', value: 'ISD' }, { label: 'Other', value: 'other' }]
    }, {
      label: 'Priority',
      name: 'priority',
      type: 'select',
      value: 'Medium',
      options: [{ label: 'Low', value: 'Low' }, { label: 'Medium', value: 'Medium' }, { label: 'High', value: 'High' }]
    }, {
      label: 'Origin',
      name: 'origin',
      type: 'text',
      optional: true
    }, {
      label: 'Description',
      name: 'description',
      type: 'textarea',
      optional: true
    }];

    var dialog = bot.createDialog('New Problem', '' + dialog_id, 'Submit', elements);

    bot.replyWithDialog(trigger, dialog.asObject(), function (err, res) {
      if (err) {
        console.log('\nerror: ' + String(_util2['default'].inspect(err)) + '\nresponse:\n' + String(_util2['default'].inspect(res)) + '\n');
        console.log('\ndialog:\n' + String(_util2['default'].inspect(dialog)));
      } else console.log('dialog successfully delivered!');
    });
  }
});

// handle a dialog submission
// the values from the form are in event.submission    
controller.on('dialog_submission', function (bot, message) {
  var submission = message.submission;

  var id_params = _lodash2['default'].split(message.callback_id, ':');
  var usersf = id_params[0];
  var subject = id_params[1];

  if (id_params.length > 2) {
    var from = _lodash2['default'].split(message.callback_id, ':')[1] + '.000000';
    var to = _lodash2['default'].split(message.callback_id, ':')[2] + '.000000';
    var history = getConvo(from, to, message.channel, bot);
  }

  console.log('Message:\n' + String(_util2['default'].inspect(message)) + '\n\n');
  console.log('Submission:\n' + String(_util2['default'].inspect(submission)));

  (0, _salesforce2['default'])(message.user).then(function (samanage) {
    samanage.newProblem(usersf, submission.subject, submission.platform, submission.origin, submission.description).then(function (problem) {
      console.log('new problem returned: ' + String(_util2['default'].inspect(problem)));
      var text = {
        channel: message.channel,
        text: 'New problem #' + String(_utility2['default'].formatCaseNumber(problem.CaseNumber)) + ' has been submitted!',
        attachments: [{
          fallback: '' + String(problem.link),
          actions: [{
            type: 'button',
            text: 'View',
            url: problem.link
          }]
        }]
      };
      return text;
    }).then(function (text) {
      bot.reply(message, text);
    });
  })['catch'](function (err) {
    console.log('oops! ' + String(err));
    bot.reply(message, err);
  });

  bot.dialogOk();
});

controller.storage.teams.all(function (err, teams) {
  console.log('** connecting teams **\n');
  if (err) throw new Error(err);

  var _loop = function _loop(t) {
    if (teams[t].bot) {
      var bot = controller.spawn(teams[t]).startRTM(function (error) {
        if (error) console.log('Error: ' + String(error) + ' while connecting bot ' + String(teams[t].bot) + ' to Slack for team: ' + String(teams[t].id));else {
          getUserEmailArray(bot);
          trackBot(bot);
        }
      });
    }
  };

  for (var t in teams) {
    _loop(t);
  }
});

var getUserEmailArray = function getUserEmailArray(bot) {
  console.log('>> getting user email array');
  bot.api.users.list({}, function (err, response) {
    if (err) console.log(err);
    if (response.hasOwnProperty('members') && response.ok) {
      var total = response.members.length;

      var _loop2 = function _loop2(i) {
        var member = response.members[i];
        var newMember = { id: member.id, team_id: member.team_id, name: member.name, fullName: member.real_name, email: member.profile.email };
        _team.push(newMember);
        controller.storage.users.get(member.id, function (error, user) {
          if (err) console.log(error);
          if (!user || !user.sf) controller.storage.users.save(newMember); // adds new team member who do not have sf auth yet
        });
      };

      for (var i = 0; i < total; i++) {
        _loop2(i);
      }
    }
  });
};

var parseTimestamps = function parseTimestamps(message) {
  // e.g. --> "new problem: _______ // 10:29am - 12:01pm"

  var tsplit = _lodash2['default'].split(message.text, ' // ');
  var capture = _lodash2['default'].split(tsplit[1], '-');

  var subject = _lodash2['default'].split(tsplit[0], 'problem:')[1];
  var from = _lodash2['default'].trim(capture[0]);
  var to = _lodash2['default'].trim(capture[1]);

  console.log('\ntsplit: ' + String(tsplit) + '\nsubject: ' + String(subject) + '\nfrom: ' + String(from) + '  to: ' + String(to) + '\n');

  // convert time range to datetime
  var now = new Date();
  now = (0, _dateformat2['default'])(now);
  console.log('now: ' + String(now));

  // maybe replace with --> const from_s = from.match(/[a-zA-z]+/g) ?
  var from_n = _lodash2['default'].split(from, /[a-zA-z]+/g)[0];
  var to_n = _lodash2['default'].split(to, /[a-zA-z]+/g)[0];
  var from_s = _lodash2['default'].split(from, /\d+[:]\d+/)[1];
  var to_s = _lodash2['default'].split(to, /\d+[:]\d+/)[1];

  from = String(from_n) + ' ' + String(from_s);
  to = String(to_n) + ' ' + String(to_s);

  var date_from = _lodash2['default'].replace(now, /\d\d[:]\d\d[:]\d\d/, from);
  var date_to = _lodash2['default'].replace(now, /\d\d[:]\d\d[:]\d\d/, to);
  console.log('date --> from: ' + String(date_from) + '  to: ' + String(date_to) + '\n');

  var unix_from = Date.parse(date_from);
  var unix_to = Date.parse(date_to);
  console.log('UNIX timestamps --> from: ' + String(unix_from) + '  to: ' + String(unix_to));
  unix_from = _lodash2['default'].toString(unix_from).substring(0, 10);
  unix_to = _lodash2['default'].toString(unix_to).substring(0, 10);
  console.log('UNIX timestamps after string manip --> from: ' + String(unix_from) + '  to: ' + String(unix_to) + '\n');

  return { from: unix_from, to: unix_to };
};

var getConvo = function getConvo(from, to, channel, bot) {
  var type = 'channels';

  if (_lodash2['default'].startsWith(channel, 'G')) type = 'groups';

  var options = {
    token: bot.config.bot.app_token,
    channel: channel,
    latest: to,
    oldest: from
  };

  console.log('options:\n' + String(_util2['default'].inspect(options)));

  bot.api[type].history(options, function (err, res) {
    if (err) console.log(_util2['default'].inspect(err));else console.log('\n' + type + ' History:\n' + String(_util2['default'].inspect(res)));
  });
};

var buildDescription = function buildDescription(messages) {
  var description = '';
  var getuser = _bluebird2['default'].promisify(controller.storage.users.get);

  _lodash2['default'].forEach(messages, function (message) {
    if (message.type === 'message') {
      // find user
      return getuser(message.user).then(function (user) {
        var text = String(user.fullName) + ': ' + String(message.text) + '\n';

        // LATER - convert ts to regular time and add to text variable
        description += text;
      })['catch'](function (err) {
        console.log('Error building description: ' + String(err));
      });
    }
  });
};

setInterval(function () {
  _http2['default'].get('http://problem-bot-beta.herokuapp.com');
}, 300000);