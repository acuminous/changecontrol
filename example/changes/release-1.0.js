exports.changeSet = function(changeControl, redis) {

	var changeSet = changeControl.changeSet('release-1.0');	  	
  	
  changeSet.add('init:foo:bar', function(next) {
		redis.set('foo:bar', 'a', next);
	});

	changeSet.add('init:pirates', function(next) {
		var multi = redis.multi();
		multi.mset(
			'Blackbeard', 'Queen Anne\'s Revenge',					
			'Long John Silver', 'Hispaniola'
		);
		multi.exec(next);
	});

	return changeSet;
};