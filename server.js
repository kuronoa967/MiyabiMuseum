const express = require('express');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const cloudinary = require('cloudinary').v2;

const app = express();

// ★追加：JSONデータの受け取り設定と静的ファイル設定
app.use(express.json());
app.use(express.static('public')); 

// Firebaseの初期化
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

// Cloudinaryの設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// フロントに安全にFirebase設定を渡すAPI
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

// 追放リストをチェックするAPI
app.post('/api/login-check', async (req, res) => {
  const { email } = req.body;
  try {
    // ★修正：admin.firestore() ではなく、初期化した db を使用
    const userDoc = await db.collection('users').doc(email).get();
    
    if (userDoc.exists && userDoc.data().status === 'banned') {
      return res.status(403).json({ error: 'あなたは追放されています' });
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Check error:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ルート設定
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`美術館サーバーがポート ${PORT} で開館しました`);
});