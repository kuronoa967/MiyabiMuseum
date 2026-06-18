<<<<<<< HEAD
// フロントに安全にFirebase設定を渡すAPI
app.get('/api/config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  });
});

// 追放リストをチェックするAPI (Firestore利用想定)
app.post('/api/login-check', async (req, res) => {
  const { email } = req.body;
  // ここで Firestore の users コレクションを確認し、
  // status が 'banned' なら res.status(403).send() を返す実装をしてください
  res.json({ status: 'ok' });
=======
const express = require('express');
const path = require('path');
const app = express();

// publicフォルダの中身（HTML/CSS/JS）をそのまま配信する設定
app.use(express.static('public'));

// ルートアクセス（/）があったら public/index.html を返す
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ポート設定（Render必須）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`美術館サーバーがポート ${PORT} で開館しました`);
>>>>>>> 5271017f2a137212771b305a0edc7a35d28d91c3
});