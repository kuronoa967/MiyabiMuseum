const { createApp, ref } = Vue;

createApp({
  setup() {
    const fileInput = ref(null);
    const selectedFile = ref(null);
    const imagePreview = ref('');
    const title = ref('');
    const description = ref('');
    const tagsInput = ref('');
    const isLoading = ref(false);

    // ★追加：既存タグのリストと、選択状態を追跡する配列
    const existingTags = ref(['純喫茶', '光と影', 'ノスタルジー', '風景', '日常', 'モノクロ', 'ポートレート']);
    const selectedTags = ref([]);

    // クリックで隠し input[type="file"] を叩く
    const triggerFileInput = () => {
      fileInput.value.click();
    };

    // ファイルが選択されたときの処理
    const processFile = (file) => {
      if (!file || !file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        return;
      }
      selectedFile.value = file;
      imagePreview.value = URL.createObjectURL(file);
    };

    const handleFileSelect = (event) => {
      const file = event.target.files[0];
      processFile(file);
    };

    const handleDrop = (event) => {
      const file = event.dataTransfer.files[0];
      processFile(file);
    };

    // ★追加：タグの選択・解除を切り替える関数
    const toggleTag = (tag) => {
      const index = selectedTags.value.indexOf(tag);
      if (index > -1) {
        selectedTags.value.splice(index, 1); // 既に選ばれていたら外す
      } else {
        selectedTags.value.push(tag); // 選ばれていなければ追加
      }
    };

    const goBack = () => {
      window.location.href = 'index.html';
    };

    // 展示（アップロード）処理の実行
    const submitUpload = () => {
      if (!selectedFile.value) return;

      isLoading.value = true;

      // 手入力分の文字列を配列に整形
      const manualTags = tagsInput.value
        .split(/[,，\s]+/)
        .filter(tag => tag.trim() !== '');

      // ★変更：クリックで選んだ既存タグ ＋ 手入力タグをガッチャンコして重複を消す
      const processedTags = [...new Set([...selectedTags.value, ...manualTags])];

      setTimeout(() => {
        isLoading.value = false;

        console.log('--- 作品の展示データ ---');
        console.log('ファイル名:', selectedFile.value.name);
        console.log('作品名:', title.value);
        console.log('解説文:', description.value);
        console.log('確定したタグ一覧:', processedTags);

        // Firebase / Cloudinary連携時はここに記述
        
        window.location.href = 'index.html';
      }, 1500);
    };

    return {
      fileInput,
      selectedFile,
      imagePreview,
      title,
      description,
      tagsInput,
      isLoading,
      existingTags,  // ★追加
      selectedTags,  // ★追加
      triggerFileInput,
      handleFileSelect,
      handleDrop,
      toggleTag,     // ★追加
      goBack,
      submitUpload
    };
  }
}).mount('#app');