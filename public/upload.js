const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const fileInput = ref(null);
    const selectedFile = ref(null);
    const imagePreview = ref('');
    const title = ref('');
    const description = ref('');
    const tagsInput = ref('');
    const isLoading = ref(false);

    // 既存タグ候補の動的管理
    const existingTags = ref(['純喫茶', '光と影', 'ノスタルジー', '風景', '日常', '和モダン', 'パロディ']);
    const selectedTags = ref([]);

    const initFirebase = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (!firebase.apps.length) firebase.initializeApp(config);
      } catch (e) { console.error("Firebase初期化失敗:", e); }
    };

    const triggerFileInput = () => { fileInput.value.click(); };

    const processFile = (file) => {
      if (!file || !file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        return;
      }
      selectedFile.value = file;
      imagePreview.value = URL.createObjectURL(file);
    };

    const handleFileSelect = (e) => { processFile(e.target.files[0]); };
    const handleDrop = (e) => { processFile(e.dataTransfer.files[0]); };

    const toggleTag = (tag) => {
      const index = selectedTags.value.indexOf(tag);
      if (index > -1) selectedTags.value.splice(index, 1);
      else selectedTags.value.push(tag);
    };

    const goBack = () => { window.location.href = 'index.html'; };

    // --- 本番：Cloudinaryへの署名付きアップロード ＆ Firestore保存 ---
    const submitUpload = async () => {
      if (!selectedFile.value) return;

      isLoading.value = true;
      const user = firebase.auth().currentUser;
      if (!user) {
        alert("セッションが切れました。再度ログインしてください。");
        window.location.href = 'login.html';
        return;
      }

      // タグのパース処理
      const manualTags = tagsInput.value.split(/[,，\s]+/).filter(tag => tag.trim() !== '');
      const processedTags = [...new Set([...selectedTags.value, ...manualTags])];

      try {
        // 1. RenderサーバーからセキュアにCloudinaryアップロード用署名(Signature)を取得
        const idToken = await user.getIdToken();
        const signResponse = await fetch('/api/get-signature', {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        
        if (!signResponse.ok) throw new Error("アップロード署名の取得に失敗しました。");
        const signData = await signResponse.json();

        // 2. CloudinaryへFormDataを用いてダイレクトに署名付き送信
        const formData = new FormData();
        formData.append('file', selectedFile.value);
        formData.append('api_key', signData.apikey);
        formData.append('timestamp', signData.timestamp);
        formData.append('signature', signData.signature);
        if(signData.folder) formData.append('folder', signData.folder);

        const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${signData.cloudname}/image/upload`, {
          method: 'POST',
          body: formData
        });
        const cloudinaryData = await cloudinaryRes.json();
        if (!cloudinaryData.secure_url) throw new Error("画像の保存に失敗しました。");

        // 3. 成功したURLとパブリックIDをメタデータとしてFirestoreへ保存
        const db = firebase.firestore();
        await db.collection('artworks').add({
          uploaderId: user.uid,
          uploader: user.displayName || '名無しの出展者',
          title: title.value || '無題',
          description: description.value || '',
          tags: processedTags,
          cloudinaryUrl: cloudinaryData.secure_url,
          cloudinaryPublicId: cloudinaryData.public_id, // 削除・検閲時にバックエンドから消すため保持
          isPinned: false,  // 初期値は通常展示
          isHidden: false,  // 初期値は公開表示
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // トップへ遷移
        window.location.href = 'index.html';

      } catch (error) {
        console.error("出展エラー:", error);
        alert("展示の準備中にエラーが発生しました。");
      } finally {
        isLoading.value = false;
      }
    };

    onMounted(async () => {
      await initFirebase();
      // これまでの全作品からタグ候補を動的に拡張収集するロジック（任意）
      firebase.auth().onAuthStateChanged((user) => {
        if (!user) window.location.href = 'login.html'; // ガード
      });
    });

    return {
      fileInput, selectedFile, imagePreview, title, description, tagsInput, isLoading,
      existingTags, selectedTags, triggerFileInput, handleFileSelect, handleDrop, toggleTag, goBack, submitUpload
    };
  }
}).mount('#app');