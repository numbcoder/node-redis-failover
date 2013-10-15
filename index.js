var Client = require('./lib/client');
/*
new Manager({
  zkServers: 'localhost:2181',
  redisServers: '127.0.0.1:6379,127.0.0.1:6479,127.0.0.1:6579'
});
*/


exports.createClient = function(opts) {
  return new Client(opts);
};
