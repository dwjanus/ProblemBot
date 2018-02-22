'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _dotenv = require('dotenv');

var _dotenv2 = _interopRequireDefault(_dotenv);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var ENV = process.env.NODE_ENV || 'development';

if (ENV === 'development') _dotenv2['default'].load();

var config = {
  ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  PROXY_URI: process.env.PROXY_URI,
  ICON_EMOJI: ':mcfly:',
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
  SLACK_VERIFY: process.env.SLACK_VERIFY,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SF_ID: process.env.SF_ID,
  SF_SECRET: process.env.SF_SECRET,
  MONGODB_URI: process.env.MONGODB_URI
};

exports['default'] = function (key) {
  if (!key) return config;
  return config[key];
};