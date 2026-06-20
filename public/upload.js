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
    
    // ★追加：エラーメッセージを格納する変数
    const errorMessage = ref('');

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
        // ★変更：alertを廃止
        errorMessage.value = '画像ファイルを選択してください。';
        return;
      }
      errorMessage.value = ''; // 正常なファイルならエラーを消す
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
      errorMessage.value = ''; // ★追加：処理開始時にエラー表示をリセット

      const user = firebase.auth().currentUser;
      if (!user) {
        // ★変更：alertを廃止
        errorMessage.value = "セッションが切れました。再度ログインしてください。";
        isLoading.value = false;
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
        
        // ★追加：Cloudinaryが403などで弾いた場合、その詳細な理由を取り出して投げる
        if (!cloudinaryRes.ok) {
          console.error("Cloudinary詳細エラー:", cloudinaryData);
          throw new Error(`Cloudinary通信エラー: ${cloudinaryData.error?.message || '署名が無効です'}`);
        }

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
          cloudinaryPublicId: cloudinaryData.public_id,
          isPinned: false,  
          isHidden: false,  
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // トップへ遷移
        window.location.href = 'index.html';

      } catch (error) {
        console.error("出展エラー:", error);
        // ★変更：alertを廃止し、変数にエラー内容を入れる
        errorMessage.value = error.message; 
      } finally {
        isLoading.value = false;
      }
    };

    onMounted(async () => {
      await initFirebase();
      firebase.auth().onAuthStateChanged((user) => {
        if (!user) window.location.href = 'login.html'; 
      });
    });

    return {
      fileInput, selectedFile, imagePreview, title, description, tagsInput, isLoading, 
      errorMessage, // ★追加：HTML側に変数を渡す
      existingTags, selectedTags, triggerFileInput, handleFileSelect, handleDrop, toggleTag, goBack, submitUpload
    };
  }
}).mount('#app');