var redis = require('redis');
var client = redis.createClient('6679','0.0.0.0', {retry_max_delay: 5000, max_attempts: 4});

client.on('error', function(err) {
  console.error('client err %s, ', err.message, client.ready);
});


client.on('end', function() {
  //client.end();
  console.error('client end');
});

client.on('ready', function() {
  console.error('client ready', client.ready);
  

  client.info(function(err) {
    console.log('get info err: %j', err);
  })

  client.ping(function(err, d) {
    console.log('err: %j', err);
    console.log('data: %j', d);
  });
  setTimeout(function() {
    client.lpush('abc', '1');
    console.log('wake');
  }, 3000)
  /*
  setTimeout(function() {
    console.error('end1');
    client.end();
  }, 2000)
  setTimeout(function() {
    console.error('end2');
    client.get('a', function(e) {
      console.error('e1 %j', e);
    })
    client.end();
    console.error('end3');
  }, 3000)
  */
  /*
  client.get('aaaaa1111', function (err, r) {
    console.log('err, %j', err);
    console.log('result, %j', r);
  })
  */
});

setTimeout(function() {
  //client.end();
}, 12000);
return;
client.on('ready', function() {
  console.log('ready');
  client.blpop('ass', 10, function(err, r) {
      console.log('blop', err);
      console.log(r);
  });
  client.info(function(err, info){
    var obj = {};
    var lines = info.toString().split("\r\n");

        lines.forEach(function (line) {
            var parts = line.split(':');
            if (parts[1]) {
                obj[parts[0]] = parts[1];
            }
        });


        console.log(obj);
    // console.log(g('used_cpu_sys', info.toString()));
    //console.log(client.server_info);
  });
});

var g = function(s, text) {
  var reg = new RegExp('^' + s + '.*?\\r\\n');
  console.log(text);
  console.log(reg);
  //var str = reg.exec(text);
  var r = text.match(reg);
  console.log(r);
}
