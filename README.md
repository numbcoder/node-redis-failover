Node Redis Failover ![NPM version](https://badge.fury.io/js/node-redis-failover.png)
=======
A redis failover solution based on ZooKeeper for Node.js

Architecture chart:

![Architecture](http://ww1.sinaimg.cn/large/60512853gw1e9qzaunhsij20dw0bi752.jpg)

## Features

* Automatic master/slave failover
* Read/Write Splitting
* All components high availability
* Support cluster
* Custom sharding router

## Installation
Install with npm:

```shell
npm install -g node-redis-failover
```

## Usage

### Start redis watcher

```shell
redis-failover -h

  Usage: redis-failover -c config.json

  Options:

    -h, --help           output usage information
    -V, --version        output the version number
    -c, --config [path]  Path to JSON config file
```

start a redis watcher (we recommend the watchers' count should be an odd number, and more than 3):

```shell
redis-failover -c config.json
```

with a config file `config.json` (config json file support comments use [json-comments](https://github.com/numbcoder/json-comments)):

```js
{
  // zookeeper
  "zooKeeper": {
    "servers": "127.0.0.1:2181,127.0.0.1:2182,127.0.0.1:2183",
    "chroot": "/test"
    //"username": "abssd",
    //"password": 'asdfefe'
  },
  // redis cluster nodes
  "nodes": [
    {
      "name": "node_1",
      "servers": "127.0.0.1:6379,127.0.0.1:6479",
      // redis password
      "password": "abc123",
      // redis ping timeout default 6000 ms
      "pingTimeout": 4000,

      // redis ping interval(ms). default 3000 ms
      "pingInterval": 1000,

      // the maxFailures for the redis. default 3
      "maxFailures": 5
    },
    {
      "name": "node_2",
      "servers": "127.0.0.1:7000,127.0.0.1:7001"
    }
  ],

  // log path
  "log": "logs/",

  // pid file
  "pid": "a.pid"
}
```

start a watcher:

```bash
redis-failover -c config.json
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
  // get the master client of 'node_1' (default master)
  redis.getClient('node_1').ping(function(err, info) {
    console.log(info);
  });

  // get the slave clinet of 'node_2'
  redis.getClient('node_1', 'slave').ping(function(err, info) {
    console.log(info);
  });
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

```

## License

(The MIT License)

Copyright (c) 2014 Johnny Wong <wzhao23@gmail.com>


[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/numbcoder/node-redis-failover/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

