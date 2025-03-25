// app.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');

const db = require('./config/db'); // 引入数据库连接(使用 mysql2 Pool)

const app = express();
const PORT = 3000;

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // 图片保存到 public/uploads 目录
    cb(null, path.join(__dirname, 'public/uploads'));
  },
  filename: function(req, file, cb) {
    // 使用时间戳+原始扩展名作为文件名，保证唯一性
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// 设置 EJS 作为模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 解析表单数据
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 使用 session
app.use(session({
  secret: 'your-secret-key', // 请使用更安全的随机字符串
  resave: false,
  saveUninitialized: false
}));

// 提供静态文件访问 (CSS, JS, images 等)
app.use(express.static(path.join(__dirname, 'public')));

// 中间件：检查是否已登录
function checkAuth(req, res, next) {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/login');
  }
  next();
}

// =============== 路由 =============== //

// 访问根路径时跳转到登录
app.get('/', (req, res) => {
  res.redirect('/login');
});

// ---------- 登录与登出 ---------- //

// 显示登录页 (login.ejs)
app.get('/login', (req, res) => {
  res.render('login'); 
});

// 处理登录逻辑
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await db.query(
      'SELECT * FROM admin_users WHERE username = ?',
      [username]
    );
    if (rows.length > 0) {
      const admin = rows[0];
      // 此处仅演示明文比对，实际项目应使用 bcrypt 等哈希验证
      if (admin.password === password) {
        // 登录成功，写入 session
        req.session.adminLoggedIn = true;
        req.session.adminId = admin.admin_id;
        req.session.adminName = admin.username;
        return res.redirect('/dashboard');
      }
    }
    // 登录失败
    res.send('<script>alert("Wrong username or password"); window.location="/login";</script>');
  } catch (err) {
    console.error(err);
    res.send('Database error');
  }
});

// 退出登录
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ---------- Dashboard ---------- //
app.get('/dashboard', checkAuth, async (req, res) => {
  try {
    // 查询总订单数
    const [orderRows] = await db.query('SELECT COUNT(*) AS count FROM orders');
    const totalOrders = orderRows[0].count;

    // 查询总销售额（假设 orders 表中有 total_amount 字段）
    const [salesRows] = await db.query('SELECT SUM(total_amount) AS totalSales FROM orders');
    const totalSales = salesRows[0].totalSales || 0;

    // 查询总顾客数，基于 customer_id 去重
    const [custRows] = await db.query('SELECT COUNT(DISTINCT customer_id) AS custCount FROM orders');
    const totalCustomers = custRows[0].custCount || 0;

    // 查询最近订单，关联 customers 表获取用户名
    const [recent] = await db.query(`
      SELECT o.order_id, c.username AS customer_name, o.total_amount, o.status 
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      ORDER BY o.order_date DESC 
      LIMIT 5
    `);

    res.render('dashboard', {
      adminName: req.session.adminName,
      totalSales,
      totalOrders,
      totalCustomers,
      recentOrders: recent
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading dashboard data');
  }
});

// ---------- Orders ---------- //
app.get('/orders', checkAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT order_id, customer_id, order_date, status FROM orders');
    res.render('orders', { orders: rows });
  } catch (err) {
    console.error(err);
    res.send('Error loading orders');
  }
});

// ---------- 分类管理：增删改查 ---------- //
app.get('/categories', checkAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories ORDER BY category_name ASC');
    res.render('categories', { categories: rows });
  } catch (err) {
    console.error(err);
    res.send('Error loading categories');
  }
});
app.post('/categories/add', checkAuth, async (req, res) => {
  const { category_name } = req.body;
  try {
    await db.query('INSERT INTO categories (category_name) VALUES (?)', [category_name]);
    res.redirect('/categories');
  } catch (err) {
    console.error(err);
    res.send('Error adding category');
  }
});
app.post('/categories/edit', checkAuth, async (req, res) => {
  const { category_id, category_name } = req.body;
  try {
    await db.query('UPDATE categories SET category_name=? WHERE category_id=?', [category_name, category_id]);
    res.redirect('/categories');
  } catch (err) {
    console.error(err);
    res.send('Error editing category');
  }
});
app.get('/categories/delete/:id', checkAuth, async (req, res) => {
  const categoryId = req.params.id;
  try {
    await db.query('DELETE FROM categories WHERE category_id=?', [categoryId]);
    res.redirect('/categories');
  } catch (err) {
    console.error(err);
    res.send('Error deleting category');
  }
});

// ---------- 产品管理：增删改查 ---------- //

// 显示产品 (保留按分类筛选的功能，如果传入 cat_id 则筛选，否则显示全部)
app.get('/productmanagement', checkAuth, async (req, res) => {
  const catId = req.query.cat_id;
  try {
    // 获取所有分类(供下拉菜单选择)
    const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name ASC');

    let products = [];
    if (catId) {
      // 查询指定分类下的产品
      const [rows] = await db.query(`
        SELECT p.*, c.category_name
        FROM products p
        JOIN categories c ON p.category_id = c.category_id
        WHERE p.category_id = ?
        ORDER BY p.product_name DESC
      `, [catId]);
      products = rows;
    } else {
      // 未选择分类，查询全部产品
      const [rows] = await db.query(`
        SELECT p.*, c.category_name
        FROM products p
        JOIN categories c ON p.category_id = c.category_id
        ORDER BY p.product_name DESC
      `);
      products = rows;
    }

    res.render('productmanagement', {
      categories,
      products,
      currentCatId: catId || ''
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading products');
  }
});

// 添加产品 – 使用 multer 处理图片上传，并处理空字符串的促销价格
app.post('/productmanagement/add', checkAuth, upload.single('product_images'), async (req, res) => {
  const {
    cat_id,
    product_name,
    product_description,
    product_normal_price,
    product_price_promotion
  } = req.body;
  // multer 将上传文件信息存放在 req.file 中
  const product_images = req.file ? req.file.filename : null;
  // 如果促销价格为空字符串，则转换为 0
  const promotionPrice = product_price_promotion && product_price_promotion.trim() !== '' 
                           ? product_price_promotion 
                           : 0;
  try {
    await db.query(`
      INSERT INTO products
      (category_id, product_name, product_description, product_images, product_normal_price, product_price_promotion)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      cat_id,
      product_name,
      product_description,
      product_images,
      product_normal_price,
      promotionPrice
    ]);
    // 更新后直接显示全部产品
    res.redirect('/productmanagement');
  } catch (err) {
    console.error(err);
    res.send('Error adding product');
  }
});

// 更新产品 – 更新后显示全部产品（不带 cat_id 参数）；同时处理促销价格为空的情况
app.post('/productmanagement/edit', checkAuth, async (req, res) => {
  const {
    product_id,
    cat_id,
    product_name,
    product_description,
    product_images,
    product_normal_price,
    product_price_promotion
  } = req.body;
  const promotionPrice = product_price_promotion && product_price_promotion.trim() !== '' 
                           ? product_price_promotion 
                           : 0;
  try {
    await db.query(`
      UPDATE products
      SET category_id=?,
          product_name=?,
          product_description=?,
          product_images=?,
          product_normal_price=?,
          product_price_promotion=?
      WHERE product_id=?
    `, [
      cat_id,
      product_name,
      product_description,
      product_images,
      product_normal_price,
      promotionPrice,
      product_id
    ]);
    res.redirect('/productmanagement');
  } catch (err) {
    console.error(err);
    res.send('Error editing product');
  }
});

// 删除产品 – 更新后显示全部产品
app.get('/productmanagement/delete/:id', checkAuth, async (req, res) => {
  const productId = req.params.id;
  try {
    await db.query('DELETE FROM products WHERE product_id=?', [productId]);
    res.redirect('/productmanagement');
  } catch (err) {
    console.error(err);
    res.send('Error deleting product');
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
