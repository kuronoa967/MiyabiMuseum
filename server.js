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
});