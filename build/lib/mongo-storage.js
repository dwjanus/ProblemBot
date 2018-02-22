'use strict';

var _monk = require('monk');

var _monk2 = _interopRequireDefault(_monk);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

/**
 * custom version of botkit-storage-mongo - MongoDB driver for Botkit
 *
 * @param  {Object} config Must contain a mongoUri property
 * @return {Object} A storage object conforming to the Botkit storage interface
 */
module.exports = function (config) {
  if (!config || !config.mongoUri) {
    throw new Error('Need to provide mongo address.');
  }

  var db = (0, _monk2['default'])(config.mongoUri);
  var storage = {};

  ['teams', 'channels', 'users'].forEach(function (zone) {
    storage[zone] = getStorage(db, zone);
  });

  return storage;
};

/**
 * Creates a storage object for a given "zone", i.e, teams, channels, or users
 *
 * @param {Object} db A reference to the MongoDB instance
 * @param {String} zone The table to query in the database
 * @returns {{get: get, save: save, all: all}}
 */
function getStorage(db, zone) {
  var table = db.get(zone);

  return {
    get: function () {
      function get(id, cb) {
        table.findOne({ id: id }, cb);
      }

      return get;
    }(),
    save: function () {
      function save(data, cb) {
        table.findOneAndUpdate({
          id: data.id
        }, data, {
          upsert: true,
          'new': true
        }, cb);
      }

      return save;
    }(),
    all: function () {
      function all(cb) {
        table.find({}, cb);
      }

      return all;
    }()
  };
}