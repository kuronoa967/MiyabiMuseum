const express = require('express');
const path = require('path');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(express.json()); // JSONデータの受け取りを許可
app.use(express.static('public')); // publicフォルダを公開

// 1. Firebase Admin SDKの初期化
// ※Renderの環境変数に「GOOGLE_APPLICATION_CREDENTIALS」を設定するか、
// サービスアカウントキーを適切な場所に置いて読み込む必要があります
admin.initializeApp({
  credential: admin.credential.applicationDefault() 
});

// 2. Cloudinaryの設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 3. フロントに安全にFirebase設定を渡すAPI
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

// 4. 追放リストをチェックするAPI
app.post('/api/login-check', async (req, res) => {
  const { email } = req.body;
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(email).get();
    
    // データが存在し、statusが 'banned' なら拒否
    if (userDoc.exists && userDoc.data().status === 'banned') {
      return res.status(403).json({ error: 'あなたは追放されています' });
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Check error:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 5. ルート設定
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ポート設定
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`美術館サーバーがポート ${PORT} で開館しました`);
});