const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const mongoose = require('mongoose');
const {SpeechClient} = require('@google-cloud/speech');
const session = require('express-session');

const app = express();

//DB
const db = require('./config/keys').MongoURI;

//connection
mongoose.connect(db)
.then(() => console.log("MongoDb connected"))
.catch(err => console.log(err))
app.use(session({
    secret: 'your-secret-key', // Replace with a secret string
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

//EJS
app.use(expressLayouts);
app.set('view engine','ejs')


app.use('/',require('./routes/index'));



app.listen(3000,console.log("server started "));