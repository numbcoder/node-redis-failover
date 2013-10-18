var zk = require('node-zookeeper-client');
var CreateMode = zk.CreateMode;

//var client = zk.createClient('0.0.0.0:2181');
var client = zk.createClient('172.17.5.72:2381,172.17.5.73:2381,172.17.5.74:2381/pomelo');
client.once('connected', function(e) {
  if (e) {return console.error(e);}
  console.log('connect');
  auth();
   //init();
  //getChildren('/redis_failover/nodes');
  mkdirp('/push-server-drill');
  mkdirp('/push-server-prduction-test');
  //getChildren('/redis_failover/node_watchers');
});
client.connect();

function auth() {
  var username = 'pomelo';
  var password = "=I'@gvTI";
  var authentication = username + ':' + password;
  client.addAuthInfo('digest', new Buffer(authentication));
}

function init() {
  client.create('/test', function(err, path) {
    if (err) {return console.error(err);}
    console.log(typeof path);
    console.log(path);
    createChild(path);
  });
}

function getChildren (path) {
  client.getChildren(path, function (err, children, stats) {
    if (err) { return console.error(err); }
    console.log(children);
    console.log(stats);
  });
}

function createChild (path) {
  client.create(path + '/', CreateMode.EPHEMERAL_SEQUENTIAL, function(err, path) {
    if (err) {return console.error(err);}
    console.log(path);
    getChildren('/test');
  });
}

function mkdirp(path) {
  client.mkdirp(path, function(err, path) {
    console.log(err, path);
  })

}
