const mysql = require('mysql2');
const pool = mysql.createPool({
    connectionLimit: 5,
    host: process.env.DB_HOST,
    //port:process.env.DB_PORT,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD
});
module.exports = pool;