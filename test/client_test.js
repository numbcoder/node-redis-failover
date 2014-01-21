var redisFailover = require('../index');


var redis = redisFailover.createClient({servers:'localhost:2181', chroot: '/test'});
redis.on('ready', function() {
  console.log('redis state', redis.redisState);
  //console.log('redis clients:', redis.clientPool);
  redis.getClient('node_1').ping(function(err, info) {
    console.log(info);
  });

  redis.getClient('node_1', 'slave').ping(function(err, info) {
    console.log(info);
  });

  

  redis.on('change', function(name, state) {
    console.log('redis %s state changed, %j', name, state);
  });

  redis.on('masterChange', function(name, state) {
    console.log('%s master changed, %s', name, state);
  });

  redis.on('error', function(err) {
    console.log('err,', err);
  });
  
  setInterval(function() {
    var client1 = redis.getClient('node_1');
    var client2 = redis.getClient('node_2');
    console.log('client1 master: %s', client1.name);
    console.log('client2 master: %s', client2.name);

    var slave1 = redis.getClient('node_1', 'slave');
    console.log('slave1 %s', slave1.name);

    var slave2 = redis.getClient('node_2', 'slave');
    console.log('slave2 %s', slave2.name);
    
    console.log('\n~~~~~~~~~~~~~~~~~~~~~~~~');
  }, 10000);
});
