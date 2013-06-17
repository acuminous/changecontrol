module.exports = (function() {

    function render(changes, next) {
        renderHeader();
        renderBody();
        renderFooter();
        next();
    };

    function renderHeader() {
        console.log('');        
        console.log(['sequence', 'id', 'checksum', 'user', 'timestamp'].join(','))        
    };

    function renderBody() {
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