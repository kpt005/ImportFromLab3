// config/db.js
const mysql = require('mysql2');

// 创建数据库连接池 (pool)，推荐使用池
const pool = mysql.createPool({
  host: '127.0.0.1',
  port: "3306",
  user: 'root',
  password: 'mnpk2802',
  database: 'jerax'
});

module.exports = pool.promise();
