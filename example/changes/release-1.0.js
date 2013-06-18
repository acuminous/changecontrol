/*
 * Copyright 2010 Acuminous Ltd
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var ChangeSet = require('../../lib/index').ChangeSet;

exports.init = function(changeLog, redis) {

	var changeSet = ChangeSet.create('release-1.0', changeLog);	  	
  	
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