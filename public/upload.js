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
      if (!file || !file.type.startsWith('image/')) {
        errorMessage.value = '画像ファイルを選択してください。';
        return;
      }

      // 画像サイズチェック（例：20MB以上は拒否）
      if (file.size > 20 * 1024 * 1024) {
        errorMessage.value = '画像サイズが大きすぎます（20MB以下にしてください）';
        return;
      }

      errorMessage.value = '';
      selectedFile.value = file;
      imagePreview.value = URL.createObjectURL(file);
    };

    const handleFileSelect = (e) => processFile(e.target.files[0]);
    const handleDrop = (e) => processFile(e.dataTransfer.files[0]);

    // -----------------------------
    // タグ処理（computed で簡潔に）
    // -----------------------------
    const processedTags = computed(() => {
      const manual = tagsInput.value.split(/[,，\s]+/).filter(t => t.trim() !== '');
      return [...new Set([...selectedTags.value, ...manual])];
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

      if (!res.ok) throw new Error("アップロード署名の取得に失敗しました。");
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
      if (signData.folder) formData.append('folder', signData.folder);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${signData.cloudname}/image/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`Cloudinaryエラー: ${data.error?.message}`);

      return data;
    };

    // -----------------------------
    // Firestore 保存
    // -----------------------------
    const saveToFirestore = async (user, cloudinaryData) => {
      const db = firebase.firestore();
      return db.collection('artworks').add({
        uploaderId: user.uid,
        uploader: user.displayName || '名無しの出展者',
        title: title.value || '無題',
        description: description.value || '',
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
      if (!selectedFile.value) return;

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
        errorMessage.value = err.message;

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
