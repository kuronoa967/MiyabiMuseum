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
});