/**
 * Module dependencies.
 */
var express = require('express');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var nodemailer = require('nodemailer');
var app = express();

// Import the data layer
var mongoose = require('mongoose');
var config = {
    mail: require('./config/mail')
};

// Import the models
var models = {
    Account: require('./models/Account')(config, mongoose, nodemailer)
};

// all environments
app.set('port', process.env.PORT || 3001);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({secret: '1234567890QWERTY'}));
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
mongoose.connect('mongodb://localhost/nodebackbone');// development only
if ('development' === app.get('env')) {
    app.use(express.errorHandler());
}

app.get('/', function (req, res) {
    res.render("index.jade", {layout:false});
});
app.post('/login', function(req, res) {
    console.log('login request');
    var email = req.param('email', null);
    var password = req.param('password', null);

    if ( null === email || email.length < 1 || null === password ||
    password.length < 1 ) {
        res.send(400);
        return;
    }

    models.Account.login(email, password, function(account) {
        if ( !account ) {
            res.send(401);
            return;
        }
        console.log('login was successful');
        req.session.loggedIn = true;
        req.session.accountId = account._id;
        res.send(200);
    });
});

app.post('/register', function(req, res) {
    var firstName = req.param('firstName', null);
    var lastName = req.param('lastName', null);
    var email = req.param('email', null);
    var password = req.param('password', null);

    if ( null === email || email.length < 1 ||
    null === password || password.length < 1 ) {
        res.send(400);
        return;
    }

    models.Account.register(email, password, firstName, lastName);
    res.send(200);
});

app.get('/account/authenticated', function(req, res) {
    if ( req.session.loggedIn ) {
        res.send(200);
    } else {
        res.send(401);
    }
});

app.get('/accounts/:id/activity', function(req, res) {
    var accountId = req.params.id === 'me' ?
            req.session.accountId : req.params.id;
    console.log('Finding '  + accountId);
    models.Account.findById(accountId, function(account) {
        if(account) {
            res.send(account.activity);
        } else {
            console.log('account is null');
        }
    });
});

app.get('/accounts/:id/status', function(req, res) {
    var accountId = req.params.id === 'me' ?
        req.session.accountId : req.params.id;
    models.Account.findById(accountId, function(account) {
        if(account) {
            res.send(account.status);
        } else {
            console.log('`account` is null');
        }
    });
});

app.post('/accounts/:id/status', function(req, res) {
    var accountId = req.params.id === 'me' ?
            req.session.accountId : req.params.id;
    models.Account.findById(accountId, function(account) {
        var status = {
            name: account.name,
            status: req.param('status', '')
        };
        account.status.push(status);

        // Push the status to all friends
        account.activity.push(status);
        account.save(function (err) {
            if (err) {
                console.log('Error saving account: ' + err);
            }
        });
    });
    res.send(200);
});

app.get('/accounts/:id', function(req, res) {
    var accountId = req.params.id === 'me' ?
            req.session.accountId : req.params.id;
    models.Account.findById(accountId, function(account) {
        if ( accountId === 'me' ||
             models.Account.hasContact(account, req.session.accountId) ) {
            account.isFriend = true;
        }
        res.send(account);
    });
});

app.post('/forgotpassword', function(req, res) {
    var hostname = req.headers.host;
    var resetPasswordUrl = 'http://' + hostname + '/resetPassword';
    var email = req.param('email', null);
    if ( null === email || email.length < 1 ) {
        res.send(400);
        return;
    }

    models.Account.forgotPassword(email, resetPasswordUrl, function(success){
        if (success) {
            res.send(200);
        } else {
            // Username or password not found
            res.send(404);
        }
    });
});

app.get('/resetPassword', function(req, res) {
    var accountId = req.param('account', null);
    res.render('resetPassword.jade', {locals:{accountId:accountId}});
});

app.post('/resetPassword', function(req, res) {
    var accountId = req.param('accountId', null);
    var password = req.param('password', null);
    if ( null !== accountId && null !== password ) {
        models.Account.changePassword(accountId, password);
    }
    res.render('resetPasswordSuccess.jade');
});

app.get('/accounts/:id/contacts', function(req, res) {
    var accountId = req.params.id === 'me' ?
            req.session.accountId : req.params.id;
    models.Account.findById(accountId, function(account) {
        if (account) {
            res.send(account.contacts);
        } else {
            console.log('findById: No account found');
            res.send(500);
        }
    });
});

app.post('/accounts/:id/contacts', function(req, res) {
    var accountId = req.params.id === 'me' ?
            req.session.accountId : req.params.id;

    var contactId = req.param('contactId', null);
    // Missing contactId, don't bother going any further
    if ( null === contactId ) {
     //   res.send(400);
        return;
    }
    models.Account.findById(accountId, function(account) {
        if(account){
            models.Account.findById(contactId, function(contact) {
                models.Account.addContact(account, contact);
                // Make the reverse link
                models.Account.addContact(contact, account);
                account.save();
            });
        }
    });
    res.send(200);
});

app.get('/contacts/find', function(req, res) {
    var searchStr = req.param('searchStr', null);
    if ( null === searchStr ) {
        res.send(400);
        return;
    }

    models.Account.findByString(searchStr, function onSearchDone(err,accounts) {
        if (err || accounts.length === 0) {
            res.send(404);
        } else {
            res.send(accounts);
        }
    });
});

app.delete('/accounts/:id/contacts', function(req,res) {
    var accountId = req.params.id === 'me' ?
            req.session.accountId : req.params.id;

    var contactId = req.param('contactId', null);
    console.log('delete param: ' + contactId);
    // Missing contactId, don't bother going any further
    if ( null === contactId ) {
        res.send(400);
        return;
    }
    models.Account.findById(accountId, function(account) {
        if ( !account ) {
            return;
        }
        console.log('Finding contactId: ' + contactId);
        models.Account.findById(contactId, function(contact,err) {
            if ( !contact ) {
                console.log('Returning: No contact by id ' + contactId);
                return;
            }
            models.Account.removeContact(account, contactId);
            // Kill the reverse link
            models.Account.removeContact(contact, accountId);
        });
    });
    // Note: Not in callback - this endpoint returns immediately and
    // processes in the background
    res.send(200);
});

app.post('/logout', user.logout);

http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
});
