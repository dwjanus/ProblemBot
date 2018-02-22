'use strict';

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var formatCaseNumber = function formatCaseNumber(number) {
  var s = '0000000' + String(number);
  return s.substr(s.length - 8);
};

var parseMessages = function parseMessages() {
  console.log('[utility] ** parsing channel messages **');
};

module.exports = {
  parseMessages: parseMessages,
  formatCaseNumber: formatCaseNumber
};