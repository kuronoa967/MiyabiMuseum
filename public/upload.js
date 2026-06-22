const { createApp, ref, onMounted, computed } = Vue;

createApp({
  setup() {
    const fileInput = ref(null);
    const selectedFile = ref(null);
    const imagePreview = ref('');
    const title = ref('');
    const description = ref('');
    const tagsInput = ref('');
    const isLoading = ref(false);
    const errorMessage = ref('');

    const existingTags = ref(['日常', 'コスプレ', 'パロディ', 'ミヤビ展１', 'ミヤビ展２']);
    const selectedTags = ref([]);

    // -----------------------------
    // 共通ユーティリティ
    // -----------------------------
    const sanitize = (str) => {
      if (!str) return '';
      // script タグをざっくり除去（本格的にはサーバー側でもやる）
      return str.replace(/<script.*?>.*?<\/script>/gi, '');
    };

    const allowedExt = ['jpg', 'jpeg', 'png', 'webp'];

    // -----------------------------
    // Firebase 初期化
    // -----------------------------
    const initFirebase = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (!firebase.apps.length) firebase.initializeApp(config);
      } catch (e) {
        console.error("Firebase初期化失敗:", e);
      }
    };

    // -----------------------------
    // ファイル選択
    // -----------------------------
    const triggerFileInput = () => fileInput.value.click();

    const processFile = (file) => {
      if (!file) {
        errorMessage.value = '画像ファイルを選択してください。';
        return;
      }

      // MIME タイプチェック
      if (!file.type.startsWith('image/')) {
        errorMessage.value = '画像ファイルを選択してください。';
        return;
      }

      // 拡張子チェック（簡易偽装対策）
      const ext = file.name.split('.').pop().toLowerCase();
      if (!allowedExt.includes(ext)) {
        errorMessage.value = '対応していない画像形式です。（jpg / jpeg / png / webp）';
        return;
      }

      // 画像サイズチェック（例：20MB以上は拒否）
      if (file.size > 20 * 1024 * 1024) {
        errorMessage.value = '画像サイズが大きすぎます（20MB以下にしてください）';
        return;
      }

      errorMessage.value = '';

      // 既存のプレビューURLがあれば解放
      if (imagePreview.value) {
        URL.revokeObjectURL(imagePreview.value);
      }

      selectedFile.value = file;
      imagePreview.value = URL.createObjectURL(file);
    };

    const handleFileSelect = (e) => processFile(e.target.files[0]);
    const handleDrop = (e) => processFile(e.dataTransfer.files[0]);

    // -----------------------------
    // タグ処理（computed で簡潔に）
    // -----------------------------
    const processedTags = computed(() => {
      const manual = tagsInput.value
        .split(/[,，\s]+/)
        .map(t => t.trim())
        .filter(t => t !== '');

      const merged = [...new Set([...selectedTags.value, ...manual])];

      // タグ数制限（例：10個まで）
      if (merged.length > 10) {
        errorMessage.value = 'タグは10個までです。';
        return merged.slice(0, 10);
      }

      return merged;
    });

    const toggleTag = (tag) => {
      const i = selectedTags.value.indexOf(tag);
      i > -1 ? selectedTags.value.splice(i, 1) : selectedTags.value.push(tag);
    };

    // -----------------------------
    // 画像を WebP に圧縮
    // -----------------------------
    const compressToWebP = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;

          img.onload = () => {
            const canvas = document.createElement('canvas');

            // 長辺2000pxにリサイズ（最適化）
            const maxSize = 2000;
            let { width, height } = img;

            if (width > height && width > maxSize) {
              height = (maxSize / width) * height;
              width = maxSize;
            } else if (height > maxSize) {
              width = (maxSize / height) * width;
              height = maxSize;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (blob) => {
                if (!blob) return reject(new Error("画像の圧縮に失敗しました。"));

                resolve(
                  new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                    type: "image/webp"
                  })
                );
              },
              'image/webp',
              0.85
            );
          };

          img.onerror = reject;
        };

        reader.onerror = reject;
      });
    };

    // -----------------------------
    // Cloudinary 署名取得
    // -----------------------------
    const fetchSignature = async (user) => {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/get-signature', {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("署名APIエラー詳細:", text);
        throw new Error("アップロード署名の取得に失敗しました。");
      }

      return res.json();
    };

    // -----------------------------
    // Cloudinary アップロード
    // -----------------------------
    const uploadToCloudinary = async (file, signData) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signData.apikey);
      formData.append('timestamp', signData.timestamp);
      formData.append('signature', signData.signature);
      // folder はサーバー側で preset に紐づけて固定する想定なので、ここでは渡さない

      const res = await fetch(`https://api.cloudinary.com/v1_1/${signData.cloudname}/image/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Cloudinaryエラー詳細:", data);
        throw new Error(`Cloudinaryエラー: ${data.error?.message || '不明なエラー'}`);
      }

      if (!data.secure_url || !data.public_id) {
        throw new Error("Cloudinaryレスポンスが不正です。");
      }

      return data;
    };

    // -----------------------------
    // Firestore 保存
    // -----------------------------
    const saveToFirestore = async (user, cloudinaryData) => {
      const db = firebase.firestore();

      const safeTitle = sanitize(title.value);
      const safeDescription = sanitize(description.value);

      // 文字数制限
      if (safeTitle.length > 100) {
        throw new Error('タイトルが長すぎます（100文字以内）');
      }
      if (safeDescription.length > 500) {
        throw new Error('説明文が長すぎます（500文字以内）');
      }
      if (processedTags.value.some(t => t.length > 20)) {
        throw new Error('タグは1つ20文字以内にしてください。');
      }

      return db.collection('artworks').add({
        uploaderId: user.uid,
        uploader: user.displayName || '名無しの出展者',
        title: safeTitle || '無題',
        description: safeDescription || '',
        tags: processedTags.value,
        cloudinaryUrl: cloudinaryData.secure_url,
        cloudinaryPublicId: cloudinaryData.public_id,
        isPinned: false,
        isHidden: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    };

    // -----------------------------
    // 投稿処理
    // -----------------------------
    const submitUpload = async () => {
      if (isLoading.value) return; // 連打防止
      if (!selectedFile.value) {
        errorMessage.value = '画像ファイルを選択してください。';
        return;
      }

      isLoading.value = true;
      errorMessage.value = '';

      const user = firebase.auth().currentUser;
      if (!user) {
        errorMessage.value = "セッションが切れました。再度ログインしてください。";
        isLoading.value = false;
        return;
      }

      try {
        errorMessage.value = '画像を最適化中...';
        const webpFile = await compressToWebP(selectedFile.value);

        const signData = await fetchSignature(user);
        const cloudinaryData = await uploadToCloudinary(webpFile, signData);

        await saveToFirestore(user, cloudinaryData);

        window.location.href = 'index.html';

      } catch (err) {
        console.error("出展エラー:", err);
        errorMessage.value = err.message || '予期せぬエラーが発生しました。';
        // 失敗時は選択状態をクリアしておく
        selectedFile.value = null;
        if (imagePreview.value) {
          URL.revokeObjectURL(imagePreview.value);
          imagePreview.value = '';
        }
      } finally {
        isLoading.value = false;
      }
    };

    const goBack = () => {
      window.location.href = 'index.html';
    };

    // -----------------------------
    // 初期化
    // -----------------------------
    onMounted(async () => {
      await initFirebase();
      firebase.auth().onAuthStateChanged((user) => {
        if (!user) window.location.href = 'login.html';
      });
    });

    return {
      fileInput, selectedFile, imagePreview, title, description, tagsInput,
      isLoading, errorMessage, existingTags, selectedTags,
      triggerFileInput, handleFileSelect, handleDrop, toggleTag,
      processedTags, submitUpload, goBack
    };
  }
}).mount('#app');
