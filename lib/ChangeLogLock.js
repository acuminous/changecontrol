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

var _ = require('underscore');
var async = require('async');
var os = require('os');
var colors = require('colors');

module.exports.create = function(options) {

    var prefix = options.prefix;
    var redis = options.redis;    
    var logger = options.logger;

    var clientId = os.hostname() + ':' + process.pid;       
    var lockKey = [prefix, 'changelog', 'lock'].join(':');

    var lock = function(lockedCode, next) {
        logger.info("Locking changelog");
        async.series([obtain, lockedCode], function(err) {
            release(err, next)
        });
    };

    var obtain = function(next) {
        async.waterfall([
            function(callback) {
                redis.watch(lockKey, callback);
            },
            function(ignore, callback) {
                redis.hgetall(lockKey, callback);
            },
            function(lockedBy, callback) {
                if (lockedBy && lockedBy.client !== clientId) return callback(
                    new Error('Changelog was locked by ' + lockedBy.client.cyan + ' on ' + lockedBy.timestamp)
                );      
                var multi = redis.multi();          
                multi.hmset(lockKey, 'client', clientId, 'timestamp', new Date());
                multi.exec(callback);
            }
        ], function(err) {
            redis.unwatch(function(unwatchErr) {
                if (err && unwatchErr) logger.error(unwatchErr.message);
                next(err ? err : unwatchErr);                                   
            });
        });
    };

    var release = function(err, next) { 
        unlock(false, function(unlockErr) {
            if (err && unlockErr) logger.error(unlockErr.message);
            next(err)
        });
    };

    var unlock = function(force, next) {
        logger.info("Unlocking changelog");
        async.waterfall([
            function(callback) {
                redis.hgetall(lockKey, callback);
            },
            function(lockedBy, callback) {              
                if ((lockedBy && lockedBy.client == clientId) || force) return callback();
                next();
            },
            function(callback) {    
                redis.del(lockKey, callback);
            }           
        ], next);
    };

    return {
        lock: lock,
        unlock: unlock
    };      
};