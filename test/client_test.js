var redisFailover = require('../index');


var redis = redisFailover.createClient({servers:'localhost:2181'});
redis.on('ready', function() {
  redis.getClient().ping(function(err, info) {
    console.log(info);
  });

  redis.getClient('slave').ping(function(err, info) {
    console.log(info);
  });

  

  redis.on('change', function() {
    console.log('redis state changed, %j', redis.redisState);
  });

  redis.on('masterChange', function() {
    console.log('master changed, %s', redis.masterClient);
  });
  
  setInterval(function() {
    var master = redis.getClient();
    console.log('master %s', master.name);

    var slave1 = redis.getClient('slave');
    console.log('slave1 %s', slave1.name);

    var slave2 = redis.getClient('slave');
    console.log('slave2 %s', slave2.name);
    redis.masterClient.ping(function(err, info){
      console.log('master %s ping', redis.masterClient.name, info);
    });
    console.log('\n~~~~~~~~~~~~~~~~~~~~~~~~');
  }, 5000);
});
