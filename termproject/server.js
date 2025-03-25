// server.js
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3001;

// 创建 MySQL 连接池，请根据实际配置修改 host、user、password、database
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'zgc123456',  // 修改为你的 MySQL 密码
  database: 'jerax',      // 修改为你的数据库名称
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 中间件设置：解析 JSON、URL-encoded 数据及设置 session
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key',  // 建议使用复杂的随机字符串
  resave: false,
  saveUninitialized: true
}));

// 保护 index.html 页面：只有已登录用户可以访问，否则重定向到 login.html
app.get(['/','/index.html'], (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  next();
});

// 提供静态资源（前端页面放在 public 目录下）
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 注册接口
 * 接收字段：username, email, password
 * 从数据库中检查邮箱是否存在，然后对密码进行哈希加密后存入数据库
 */
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  try {
    // 检查邮箱是否已存在于数据库中
    pool.query('SELECT * FROM customers WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('查询数据库出错：', err);
        return res.status(500).json({ error: '数据库错误' });
      }
      if (results.length > 0) {
        return res.status(400).json({ error: '该邮箱已注册' });
      }
      // 对密码进行哈希加密
      const hashedPassword = await bcrypt.hash(password, 10);
      // 插入新用户数据到 customers 表
      pool.query(
        'INSERT INTO customers (username, email, password) VALUES (?, ?, ?)',
        [username, email, hashedPassword],
        (err, results) => {
          if (err) {
            console.error('插入数据库出错：', err);
            return res.status(500).json({ error: '注册失败' });
          }
          res.status(201).json({ message: '注册成功' });
        }
      );
    });
  } catch (error) {
    console.error('服务器错误：', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * 登录接口
 * 接收字段：email, password
 * 从数据库中查找用户并使用 bcrypt 验证密码
 */
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  // 从数据库中根据邮箱查找用户
  pool.query('SELECT * FROM customers WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('查询数据库出错：', err);
      return res.status(500).json({ error: '数据库错误' });
    }
    if (results.length === 0) {
      return res.status(400).json({ error: '邮箱或密码错误' });
    }
    const user = results[0];
    // 使用 bcrypt 对比用户输入的密码和数据库中的哈希密码
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      // 密码正确，将用户信息保存到 session 中
      req.session.user = { id: user.customer_id, username: user.username, email: user.email };
      res.status(200).json({ message: '登录成功' });
    } else {
      res.status(400).json({ error: '邮箱或密码错误' });
    }
  });
});

/**
 * 获取当前登录用户信息接口
 * 如果用户已登录，则返回用户数据；否则返回未登录状态
 */
app.get('/user', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: '未登录' });
  }
});

/**
 * 登出接口
 */
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: '已退出登录' });
});

/**
 * 获取产品数据接口
 * 从数据库中读取 products 表中的所有产品，并返回给前端
 */
app.get('/api/products', (req, res) => {
  pool.query('SELECT * FROM products', (err, results) => {
    if (err) {
      console.error('查询产品数据失败：', err);
      return res.status(500).json({ error: '数据库错误' });
    }
    res.json({ products: results });
  });
});
/**
 * 获取所有分类数据接口
 * 从数据库中读取 categories 表中的所有分类数据，并返回给前端
 */
app.get('/api/categories', (req, res) => {
  pool.query('SELECT * FROM categories', (err, results) => {
    if (err) {
      console.error('查询分类数据失败：', err);
      return res.status(500).json({ error: '数据库错误' });
    }
    res.json({ categories: results });
  });
});

/**
 * 获取产品数据接口（按分类过滤）
 * 当传入 category_id 参数时，只返回该分类下的产品，否则返回所有产品
 */
app.get('/api/products', (req, res) => {
  const { category_id } = req.query;
  let sql = 'SELECT * FROM products';
  let params = [];
  if (category_id) {
    sql += ' WHERE category_id = ?';
    params.push(category_id);
  }
  pool.query(sql, params, (err, results) => {
    if (err) {
      console.error('查询产品数据失败：', err);
      return res.status(500).json({ error: '数据库错误' });
    }
    res.json({ products: results });
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
