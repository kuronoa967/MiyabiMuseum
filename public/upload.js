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
    const errorMessage = ref('');

    // 既存タグ候補の動的管理
    const existingTags = ref(['日常', 'コスプレ', 'パロディ', 'ミヤビ展１', 'ミヤビ展２']);
    const selectedTags = ref([]);

    const initFirebase = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (!firebase.apps.length) firebase.initializeApp(config);
      } catch (e) { console.error("Firebase初期化失敗:", e); }
    };

    const triggerFileInput = () => { fileInput.value.click(); };

    // --- ★【フロントエンド圧縮】画像をWebPに変換する関数 ---
    const compressToWebP = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // 画質0.85（85%）のWebPに変換。見た目を損なわずに容量を大幅カット
            canvas.toBlob((blob) => {
              if (blob) {
                // Cloudinaryが認識できるようにFileオブジェクトの形に再変換
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                  type: "image/webp"
                });
                resolve(compressedFile);
              } else {
                reject(new Error("画像の圧縮に失敗しました。"));
              }
            }, 'image/webp', 0.85);
          };
          img.onerror = (e) => reject(e);
        };
        reader.onerror = (e) => reject(e);
      });
    };

    const processFile = (file) => {
      if (!file || !file.type.startsWith('image/')) {
        errorMessage.value = '画像ファイルを選択してください。';
        return;
      }
      errorMessage.value = '';
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

    // --- 署名付きアップロード ＆ Firestore保存 ---
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

      // タグのパース処理
      const manualTags = tagsInput.value.split(/[,，\s]+/).filter(tag => tag.trim() !== '');
      const processedTags = [...new Set([...selectedTags.value, ...manualTags])];

      try {
        // ★【修正】：送信直前にフロント側でWebPに超圧縮をかける
        errorMessage.value = '画像を最適化中...';
        const webpFile = await compressToWebP(selectedFile.value);
        errorMessage.value = ''; // リセット

        // 1. RenderサーバーからCloudinaryアップロード用署名(Signature)を取得
        const idToken = await user.getIdToken();
        const signResponse = await fetch('/api/get-signature', {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        
        if (!signResponse.ok) throw new Error("アップロード署名の取得に失敗しました。");
        const signData = await signResponse.json();

        // 2. CloudinaryへFormDataを用いてダイレクトに送信
        const formData = new FormData();
        formData.append('file', webpFile); // ★【修正】：圧縮済みのWebPファイルをセット
        formData.append('api_key', signData.apikey);
        formData.append('timestamp', signData.timestamp);
        formData.append('signature', signData.signature);
        if (signData.folder) formData.append('folder', signData.folder);

        const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${signData.cloudname}/image/upload`, {
          method: 'POST',
          body: formData
        });
        
        const cloudinaryData = await cloudinaryRes.json();
        
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

        window.location.href = 'index.html';

      } catch (error) {
        console.error("出展エラー:", error);
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
      errorMessage, existingTags, selectedTags, triggerFileInput, handleFileSelect, handleDrop, toggleTag, goBack, submitUpload
    };
  }
}).mount('#app');