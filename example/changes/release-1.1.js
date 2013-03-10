exports.changeSet = function(changeControl, redis) {

  var changeSet = changeControl.changeSet('release-1.1');     
    
  changeSet.add('init:pirates', function(next) {
    var multi = redis.multi();
    multi.mset(
      'Captain Jack Sparrow', 'The Black Pearl'
    );
    multi.exec(next);
  });

  return changeSet;
};