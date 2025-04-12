require('dotenv').config();
const express = require('express');
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require('path');
const port = process.env.PORT || 3000;
const app = express();
const { engine } = require('express-handlebars');

const homeRouter = require('./routes/homeRouter');
const userRouter = require('./routes/userRouter');

// В вашем app.js оставляем хелперы как есть, они правильные
const helpers = {
    eq: function(a, b) {
        return a === b;
    },
    capitalize: function(str) {
        if (!str) return '';
        return str[0].toUpperCase() + str.slice(1);
    },
    formatDate: function(dateTime) {
        if (!dateTime) return '';
        const d = new Date(dateTime);
        return d.toLocaleString("ru-RU", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    },
    gt: function(a, b) {
        return a > b;
    },
    not: function(a) {
        return !a;
    },
    and: function(a, b) {
        return a && b;
    },
    neq: function(a, b) {
        return a !== b;
    },
};

helpers.round = function(value) {
    return Math.round(value);
};

helpers.formatDateMin = function() {
    const now = new Date();
    now.setHours(now.getHours() + 1); // Минимум через час от текущего времени
    return now.toISOString().slice(0, 16);
};

app.engine('handlebars', engine({
    extname: 'handlebars',
    partialsDir: 'views/partials/',
    defaultLayout: null,
    helpers: helpers
}));



app.engine('handlebars', engine({
    extname: 'handlebars',
    partialsDir: 'views/partials/',
    defaultLayout: null,
    helpers: helpers
  }));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

const Handlebars = require('handlebars');

Handlebars.registerHelper('truncate', function(str, length) {
    if (!str) return ''; 
    if (str.length > length) {
        return str.substring(0, length) + '...';
    }
    return str;
});

const key = process.env.SECRET_KEY;
app.use(cookieParser(key));
app.use(session({
    secret: key,
    resave: true,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 7 * 60 * 60 * 24,
    }
}));

// Middleware
app.use('/files', express.static(path.join(__dirname, 'files')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Маршруты
app.use("/", homeRouter);
app.use("/", userRouter);

module.exports = app;

// Проверка подключения к БД
async function checkDatabaseConnection() {
    try {
        const pool = require("./dataBase/db");
        const [rows] = await pool.promise().query("SELECT 1+1 AS result");
        console.log('Подключение к БД успешно. Тестовый запрос:', rows[0].result);
    } catch (error) {
        console.error("Ошибка подключения к БД:", error.message);
    }
}

// Запуск сервера
if (require.main === module) {
    app.listen(port, async () => {
        console.log(`Сервер запущен на http://localhost:${port}`);
        await checkDatabaseConnection();
    });
}