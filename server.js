const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const cloudinary = require('cloudinary').v2;

const app = express();

// -----------------------------
// 基本ミドルウェア
// -----------------------------
app.disable('x-powered-by'); // 情報漏洩を減らす
app.use(express.json({ limit: '100kb' })); // 大きすぎるリクエストを拒否
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Helmet: セキュリティヘッダーを強化
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'res.cloudinary.com'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false // 必要に応じて調整
  })
);

// CORS: フロントが別ドメインの場合に備え、環境変数で制御
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0) {
  app.use(
    cors({
      origin: function (origin, callback) {
        // ブラウザ以外（curl等）は origin が undefined になることがあるので許可するか制限するかは運用で決める
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        } else {
          return callback(new Error('CORSポリシーによりブロックされました'));
        }
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 600
    })
  );
}

// -----------------------------
// Firebase / Cloudinary 初期化
// -----------------------------
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('FIREBASE_SERVICE_ACCOUNT が設定されていません。');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error('FIREBASE_SERVICE_ACCOUNT の JSON パースに失敗しました。');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

if (!process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_CLOUD_NAME) {
  console.error('Cloudinary 環境変数が不足しています。');
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// -----------------------------
// ユーティリティ関数
// -----------------------------
const hashShort = (input) => {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 12);
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// -----------------------------
// レートリミット設定（エンドポイント別）
// -----------------------------
const generalApiLimiter = rateLimit({
  windowMs: 10 * 1000, // 10秒
  max: 10, // 10秒で10回
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'アクセスが多すぎます。しばらく待ってください。' }
});
app.use('/api/', generalApiLimiter);

// 署名専用はより厳しく
const signatureLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分
  max: 6, // 1分で6回まで
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '署名リクエストが多すぎます。しばらく待ってください。' }
});

// -----------------------------
// 認証ミドルウェア（Firebase ID トークン検証）
// -----------------------------
const authenticateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '認証トークンがありません。ログインしてください。' });
  }

  try {
    // 1. トークンの正当性を検証
    const decodedToken = await auth.verifyIdToken(token);

    if (decodedToken.banned === true) {
      const shortUid = hashShort(decodedToken.uid);
      console.warn(`BANユーザーアクセスを拒否: uid_hash=${shortUid}, ip=${req.ip}`);
      return res.status(403).json({ error: 'あなたのアカウントは追放されています。' });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.warn(`不正トークンアクセス: ip=${req.ip}`);
    return res.status(401).json({ error: '無効な認証トークンです。' });
  }
});

// -----------------------------
// API エンドポイント
// -----------------------------

// ログインチェック（BAN 判定）
app.post(
  '/api/login-check',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ status: 'ok' });
  })
);

// Cloudinary 署名生成（folder は固定、署名以外のパラメータは受け付けない）
app.get(
  '/api/get-signature',
  authenticateToken,
  signatureLimiter,
  asyncHandler(async (req, res) => {
    // 追加の安全チェック: クエリやボディに余計な値がないか
    if (Object.keys(req.query).length > 0) {
      // クエリを受け付けない設計にする場合は 400 を返す
      return res.status(400).json({ error: '不正なリクエストです。' });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = {
      timestamp,
      folder: 'MiyabiMuseum'
    };

    // Cloudinary 署名生成（秘密鍵はサーバー側のみ）
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      signature,
      timestamp,
      apikey: process.env.CLOUDINARY_API_KEY,
      cloudname: process.env.CLOUDINARY_CLOUD_NAME,
      folder: 'MiyabiMuseum'   // ← 202行目の後にこの1行を追加
    });
  })
);

// -----------------------------
// HTML ルーティング（明示的 & 安全）
// -----------------------------
const sendSafeHtml = (res, filename) => {
  const safePath = path.join(__dirname, 'public', filename);
  res.sendFile(safePath, (err) => {
    if (err) {
      console.error('HTML 送信エラー:', err);
      res.status(500).send('サーバーエラー');
    }
  });
};

app.get('/', (req, res) => sendSafeHtml(res, 'index.html'));
app.get('/index', (req, res) => sendSafeHtml(res, 'index.html'));
app.get('/upload', (req, res) => sendSafeHtml(res, 'upload.html'));
app.get('/login', (req, res) => sendSafeHtml(res, 'login.html'));
app.get('/gallery', (req, res) => sendSafeHtml(res, 'gallery.html'));

// 既存の :page.html ルートを残すがホワイトリストで制限
const allowedPages = new Set(['index', 'upload', 'login', 'gallery']);
app.get('/:page.html', (req, res) => {
  const page = req.params.page;
  if (!allowedPages.has(page)) {
    return res.status(404).send('Not Found');
  }
  sendSafeHtml(res, `${page}.html`);
});

// -----------------------------
// 404 / エラーハンドリング
// -----------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'ページが見つかりません。' });
});

// 中央集権的なエラーハンドラ（スタックトレースは本番では出さない）
app.use((err, req, res, next) => {
  console.error('サーバーエラー:', {
    message: err.message,
    // 重要: ユーザー識別子などの機密情報はここで出力しない
    path: req.path,
    ip: req.ip
  });
  res.status(500).json({ error: 'サーバーエラーが発生しました' });
});

// -----------------------------
// サーバー起動
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ミヤビ美術館サーバー起動: ポート ${PORT}`);
});