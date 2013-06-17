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

module.exports = (function() {

    function render(changes, next) {
        renderHeader();
        renderBody(changes);
        renderFooter();
        next && next();
    };

    function renderHeader() {
        console.log('');        
        console.log(['sequence', 'id', 'checksum', 'user', 'timestamp'].join(','))        
    };

    function renderBody(changes) {
        _.each(changes, function(change) {
            console.log([change.sequence, change.id, change.checksum, change.user, change.timestamp].join(','));
        });      
    };

    function renderFooter() {
        console.log('');                
    };

    return {
        render: render
    };
})();