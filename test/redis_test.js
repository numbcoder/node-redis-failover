var RedisNode = require('../lib/redis_node')

var pool = {};

/*
var d = require('domain').create();

d.on('error', function(er) {
  console.log('error, but oh well', er.message);
});

d.run(function() {
  pool['a'] = new RedisNode({host: '127.0.0.1', port: 6479});
});
*/
pool['a'] = new RedisNode({host: '127.0.0.1', port: 6479});

setTimeout(function() {
  console.log('~~~~~~~ delete ~~~~~~~~');
  
  var node = pool['a'];

  //node.clientEnd();
  //node.client.quit();
  node.close();
  //node = null;
  //delete pool['a'];

  console.log('pool, %j', pool);

  //pool['b'] = new RedisNode({host: '127.0.0.1', port: 6479});
}, 5000);

setTimeout(function() {}, 3000000);

