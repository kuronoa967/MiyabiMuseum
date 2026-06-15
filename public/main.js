const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // --- 認証・権限状態 ---
    const isLoggedIn = ref(true);             // 動作確認のため初期値をtrueにしています
    const username = ref('ミヤビ');            // ログイン中の名前
    const currentUserRole = ref('admin');     // 館長（支配人）で固定
    const currentUserId = ref('user_miyabi'); // ログイン中のユーザー固有ID

    // --- 各種状態管理 ---
    const photos = ref([]);
    const selectedPhoto = ref(null);
    const showAdminPanel = ref(false);        // 管理パネルの開閉状態
    const currentPage = ref(1);
    const itemsPerPage = 24;

    // --- 新設：絞り込み用の状態 ---
    const filterPinnedOnly = ref(false);       // 特別展示（ピン留め）のみ
    const selectedUploader = ref('');          // 選択された作家
    const selectedTag = ref('');               // 選択されたタグ

    // --- カスタムBAN確認モーダルの状態管理 ---
    const banConfirmModal = ref({
      show: false,
      user: null
    });

    // トースト通知
    const toast = ref({ show: false, message: '' });
    const showToast = (msg) => {
      toast.value.message = msg;
      toast.value.show = true;
      setTimeout(() => { toast.value.show = false; }, 3500);
    };

    // --- 管理パネル用：出展者リストの模擬データ（館長自身は除外） ---
    const usersList = ref([
      { uid: 'user_01', username: '鈴木 花子', email: 'hanako@example.com', role: 'user', status: 'active' },
      { uid: 'user_02', username: '田中 一郎', email: 'ichiro@example.com', role: 'user', status: 'active' },
      { uid: 'user_03', username: '不適切アート狂', email: 'troll@example.com', role: 'user', status: 'banned' }
    ]);

    // --- 新設：存在する「作家」と「タグ」を自動でリスト化する（重複排除） ---
    const uniqueUploaders = computed(() => {
      const uploaders = photos.value.map(p => p.uploader).filter(Boolean);
      return [...new Set(uploaders)];
    });

    const uniqueTags = computed(() => {
      const tags = photos.value.flatMap(p => p.tags || []).filter(Boolean);
      return [...new Set(tags)];
    });

    // --- 写真データのアクション（特権・一般の制御） ---
    const togglePin = (photo) => {
      photo.isPinned = !photo.isPinned;
      showToast(photo.isPinned ? `「${photo.title}」を特別展示に指定しました。` : '特別展示を解除しました。');
    };

    const toggleHide = (photo) => {
      photo.isHidden = !photo.isHidden;
      showToast(photo.isHidden ? '作品をバックヤード（非表示）に保管しました。' : '作品を常設展示に戻しました。');
    };

    const editPhoto = (photo) => {
      showToast(`「${photo.title}」の編集の型を開きます。`);
    };

    const deletePhoto = (photo) => {
      if (confirm(`「${photo.title}」の展示を取り下げますか？`)) {
        photos.value = photos.value.filter(p => p.id !== photo.id);
        showToast('展示を取り下げました。');
      }
    };

    // --- 管理パネル内の基本アクション ---
    const openAdminPanel = () => { 
      showAdminPanel.value = true; 
      document.body.style.overflow = 'hidden'; // 背景スクロールをロック
    };
    
    const closeAdminPanel = () => { 
      showAdminPanel.value = false; 
      if (!selectedPhoto.value) {
        document.body.style.overflow = '';      // 背景スクロールを解除
      }
    };

    // --- カスタムBAN確認モーダルの制御ロジック ---
    const openBanConfirm = (user) => {
      if (user.status === 'banned') {
        user.status = 'active';
        showToast(`${user.username} 様の館内追放を解除しました。`);
        return;
      }
      banConfirmModal.value = {
        show: true,
        user: user
      };
    };

    const closeBanConfirm = () => {
      banConfirmModal.value = {
        show: false,
        user: null
      };
    };

    const executeBanUser = () => {
      const user = banConfirmModal.value.user;
      if (user) {
        user.status = 'banned';
        showToast(`${user.username} 様を追放しました。展示の秩序が保たれました。`);
      }
      closeBanConfirm();
    };

    // --- 【大幅アップデート】多重絞り込み＆権限チェックロジック ---
    const filteredPhotos = computed(() => {
      let list = photos.value;

      // 1. 権限フィルター（一般・ゲストユーザーはisHidden（バックヤード）を完全隠蔽）
      if (currentUserRole.value !== 'admin') {
        list = list.filter(photo => !photo.isHidden);
      }

      // 2. 特別展示（ピン留め）での絞り込み
      if (filterPinnedOnly.value) {
        list = list.filter(photo => photo.isPinned);
      }

      // 3. 作家（投稿者）での絞り込み
      if (selectedUploader.value) {
        list = list.filter(photo => photo.uploader === selectedUploader.value);
      }

      // 4. タグでの絞り込み
      if (selectedTag.value) {
        list = list.filter(photo => photo.tags && photo.tags.includes(selectedTag.value));
      }

      return list;
    });

    // --- 新設：絞り込み変更時に白紙ページ化するのを防ぐリセット処理 ---
    const resetPage = () => {
      currentPage.value = 1;
    };

    // 2. 総ページ数の計算も、絞り込まれた写真の数をベースにする
    const totalPages = computed(() => Math.ceil(filteredPhotos.value.length / itemsPerPage) || 1);

    // 3. 画面に表示する写真も、絞り込まれた写真からページ分を切り出す
    const displayedPhotos = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      return filteredPhotos.value.slice(start, end);
    });

    const changePage = (page) => {
      if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    const goToLogin = () => { window.location.href = 'login.html'; };
    const goToUpload = () => { window.location.href = 'upload.html'; };
    const handleLogout = () => { showToast('ログアウトしました。'); isLoggedIn.value = false; };
    
    const openModal = (photo) => { 
      if(!photo.isHidden || currentUserRole.value === 'admin') {
        selectedPhoto.value = photo; 
        document.body.style.overflow = 'hidden'; // 背景スクロールをロック
      }
    };
    
    const closeModal = () => { 
      selectedPhoto.value = null; 
      if (!showAdminPanel.value) {
        document.body.style.overflow = '';      // 背景スクロールを解除
      }
    };

    const formatDate = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp.seconds * 1000);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    // 模擬データの読み込み（役割判定用にuploaderId、さらにtagsとdescriptionを追加）
    const loadDummyData = () => {
      const basePhotos = [
        { 
          id: '1', 
          uploaderId: 'user_miyabi', 
          cloudinaryUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1000&q=80', 
          title: '深い森の呼吸', 
          uploader: 'ミヤビ', 
          createdAt: { seconds: 1770000000 }, 
          isPinned: true, 
          isHidden: false,
          tags: ['静寂', '新緑', '朝靄'],
          description: '朝の淡い光が木々をすり抜け、湿った苔の香りが立ち上る瞬間の記憶。深呼吸するたびに、雑音に満ちた心がゆっくりと澄んでいくのを感じる。'
        },
        { 
          id: '2', 
          uploaderId: 'user_01', 
          cloudinaryUrl: 'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=800&q=80', 
          title: '色彩の溶融', 
          uploader: '鈴木 花子', 
          createdAt: { seconds: 1770100000 }, 
          isPinned: false, 
          isHidden: false,
          tags: ['抽象', '夕暮れ', '情熱'],
          description: '空と街の境界線が溶け合うマジックアワー。一日の終わりに訪れる切なさと、内なる情熱の起伏をパレットナイフにのせて重ね合わせたような景色。'
        },
        { 
          id: '3', 
          uploaderId: 'user_02', 
          cloudinaryUrl: 'https://images.unsplash.com/photo-1579783922669-a951f044c32a?w=800&q=80', 
          title: '琥珀色の午後', 
          uploader: '田中 一郎', 
          createdAt: { seconds: 1770200000 }, 
          isPinned: false, 
          isHidden: true,
          tags: ['純喫茶', '光と影', 'ノスタルジー'],
          description: '古い名曲がレコードから流れる純喫茶の片隅。窓から差し込む深い西日によって、琥珀色の珈琲がまるで宝石のようにきらめいていた。'
        }
      ];

      const mockList = [];
      for (let i = 0; i < 30; i++) {
        const base = basePhotos[i % basePhotos.length];
        mockList.push({ ...base, id: `${i + 1}`, title: i === 2 ? base.title : `${base.title} #${i + 1}` });
      }
      photos.value = mockList;
    };

    onMounted(() => { loadDummyData(); });

    // HTML（Vueテンプレート）側へ公開する変数・メソッド群
    return {
      isLoggedIn,
      username,
      currentUserRole,
      currentUserId,
      photos,
      displayedPhotos,
      selectedPhoto,
      showAdminPanel,
      banConfirmModal,
      currentPage,
      totalPages,
      toast,
      usersList,
      filterPinnedOnly, // 追加
      selectedUploader, // 追加
      selectedTag,      // 追加
      uniqueUploaders,  // 追加
      uniqueTags,       // 追加
      resetPage,        // 追加
      formatDate,
      openModal,
      closeModal,
      goToUpload,
      changePage,
      goToLogin,
      handleLogout,
      togglePin,
      toggleHide,
      editPhoto,
      deletePhoto,
      openAdminPanel,
      closeAdminPanel,
      openBanConfirm,
      closeBanConfirm,
      executeBanUser
    };
  }
}).mount('#app');