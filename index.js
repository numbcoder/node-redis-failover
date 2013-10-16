var Client = require('./lib/client');

exports.createClient = function(opts) {
  return new Client(opts);
};
