Node Redis Failover ![NPM version](https://badge.fury.io/js/node-redis-failover.png)
=======
A redis failover solution based on ZooKeeper for Node.js

## Installation
Install with npm:

```shell
npm install -g node-redis-failover
```

## Usage

### Start redis watcher

```shell
redis-failover -h

  Usage: redis-failover -n 127.0.0.1:6379,127.0.0.1:6479 -z 172.17.5.72:2381,172.17.5.73:2381,172.17.5.74:2381

  Options:

    -h, --help                  output usage information
    -V, --version               output the version number
    -n, --nodes <nodes>         Comma-separated redis host:port pairs
    -z, --zk-servers <servers>  Comma-separated ZooKeeper host:port pairs
    -p, --password [password]   Redis password
    -c, --config [path]         Path to JSON config file
    -l, --log [path]            The log file path
    --zk-chroot [rootpath]      Path to ZooKeepers chroot
    --zk-username [username]    ZooKeepers username
    --zk-password [password]    ZooKeepers password
```

start a redis watcher (we recommend the wathers' count should be an odd number, and more than 3):

```shell
redis-failover -n 127.0.0.1:6379,127.0.0.1:6479 -z 172.17.5.72:2381,172.17.5.73:2381,172.17.5.74:2381
```

start with `forever`
```shell
forever start -m 10 redis-failover -c config.json
```


### Use redis in your application

install:
```shell
npm install node-redis-failover --save
```

example code:
```javascript
var redisFailover = require('node-redis-failover');

var zookeeper = {
  servers: '192.168.1.1:2181,192.168.1.2:2181,192.168.1.3:2181',
  chroot: '/appName'
};

var redis = redisFailover.createClient(zookeeper);

redis.on('ready', function() {
  // master client
  redis.masterClient.ping(function(err, res){
    console.log('ping master', res);
  });

  // slave client
  redis.getClient('slave').ping(function(err, res) {
    console.log('ping slave', res);
  });
}); 

redis.on('change', function() {
    console.log('redis state changed, %j', redis.redisState);
});

redis.on('masterChange', function() {
  console.log('master changed, %s', redis.masterClient);
});

```

## License

(The MIT License)

Copyright (c) 2013 Johnny Wong <wzhao23@gmail.com>
