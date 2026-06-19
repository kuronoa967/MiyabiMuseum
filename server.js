const express = require('express');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth'); // ★認証検証のために追加
const cloudinary = require('cloudinary').v2;

const app = express();

app.use(express.json());
app.use(express.static('public')); // publicフォルダ内の静的ファイルを配信

// ==========================================================================
// 1. 各種初期化設定
// ==========================================================================

// Firebaseの初期化
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();
const auth = getAuth(); // ★Firebase Admin Authのインスタンス化

// Cloudinaryの設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ==========================================================================
// 2. 共通ミドルウェア（IDトークンの検証ガード）
// ==========================================================================
// 不正なアクセスや未ログインのアクセスをシャットアウトし、安全に uid を取得します。
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <TOKEN>" からトークンのみ抽出

  if (!token) {
    return res.status(401).json({ error: '認証トークンがありません。ログインしてください。' });
  }

  try {
    // Firebase Admin SDK でトークンの正当性を検証
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken; // 後続の処理で req.user.uid や req.user.email が使えるようになります
    next();
  } catch (error) {
    console.error('トークン検証エラー:', error);
    return res.status(401).json({ error: '無効な認証トークンです。' });
  }
};

// ==========================================================================
// 3. APIエンドポイント（フロントエンドとの連動ロジック）
// ==========================================================================

// 【既存】フロントに安全にFirebase設定を渡すAPI（変更なし）
app.get('/api/config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_APIKEY,
    authDomain: process.env.FIREBASE_AUTHDOMAIN,
    projectId: process.env.FIREBASE_PROJECTID,
    storageBucket: process.env.FIREBASE_STORAGEBUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGINGSENDERID,
    appId: process.env.FIREBASE_APPID
  });
});

// 【修正・セキュア化】追放リスト（BAN状態）をIDトークン基準でチェックするAPI
// ボディではなく、ヘッダーに載せた認証トークンを使って厳格にチェックします。
app.post('/api/login-check', authenticateToken, async (req, res) => {
  const uid = req.user.uid; // ミドルウェアで解析された安全なUID

  try {
    // Firestore の users コレクションから、ドキュメント名が UID になっているものを取得
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (userDoc.exists && userDoc.data().status === 'banned') {
      return res.status(403).json({ error: '当美術館の規律に基づき、あなたのアカウントは追放されています。' });
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('ログインチェックエラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 【新設】Cloudinaryへのダイレクトアップロード用「署名」を発行するAPI
// 悪意ある第三者が勝手に画像を送りつけるのを防ぐため、ログイン済みのユーザーにのみ署名を発行します。
app.get('/api/get-signature', authenticateToken, (req, res) => {
  try {
    const timestamp = Math.round((new Date()).getTime() / 1000);
    
    // CloudinaryのAPIシークレット（秘密鍵）を使って時間制限付きの署名を生成
    const params = {
      timestamp: timestamp
      // もし特定のフォルダに保存したい場合は、以下のように指定できます
      // folder: 'miyabi_museum' 
    };

    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
    
    // フロントエンド（upload.js）が必要とするキー情報をすべて返却
    res.json({
      signature: signature,
      timestamp: timestamp,
      apikey: process.env.CLOUDINARY_API_KEY,
      cloudname: process.env.CLOUDINARY_CLOUD_NAME
      // folder: 'miyabi_museum' // フォルダ指定した場合はここにも追加
    });
  } catch (error) {
    console.error('署名生成エラー:', error);
    res.status(500).json({ error: 'アップロード署名の生成に失敗しました' });
  }
});

// ==========================================================================
// 4. ルート設定・サーバー起動
// ==========================================================================

// ルート設定（インデックス画面の返却）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// その他のHTMLファイルに直接アクセスされた場合のルーティング補助（任意）
app.get('/:page.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', `${req.params.page}.html`));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ミヤビ美術館の本番バックエンドサーバーがポート ${PORT} で開館しました`);
});