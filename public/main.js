const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    // --- 認証・権限状態 ---
    const isLoggedIn = ref(false);
    const username = ref('ゲスト');
    const currentUserRole = ref('guest'); // guest, user, admin
    const currentUserId = ref('');

    // --- データベース連動状態 ---
    const photos = ref([]);
    const usersList = ref([]); // Firestoreからリアルタイム取得
    const selectedPhoto = ref(null);
    const showAdminPanel = ref(false);
    const currentPage = ref(1);
    const itemsPerPage = 24;

    // --- 画像読み込みエラー（リンク切れ）状態 ---
    const brokenPhotoIds = ref([]); // 読み込み失敗した画像IDを保持

    // --- 絞り込み用の状態 ---
    const filterPinnedOnly = ref(false);
    const selectedUploader = ref('');
    const selectedTag = ref('');

    // --- BAN確認モーダルの状態 ---
    const banConfirmModal = ref({ show: false, user: null });
    const toast = ref({ show: false, message: '' });

    const showToast = (msg) => {
      toast.value.message = msg;
      toast.value.show = true;
      setTimeout(() => { toast.value.show = false; }, 3500);
    };

    // --- 画像読み込みエラー時のハンドラー ---
    const handleImageError = (photoId) => {
      if (!brokenPhotoIds.value.includes(photoId)) {
        brokenPhotoIds.value.push(photoId);
      }
    };

    // -----------------------------
    // Firebase 初期化（/api/config から取得）
    // -----------------------------
    const initFirebase = async () => {
      if (!window.firebase) {
        console.error('Firebase SDK が読み込まれていません。index.html を確認してください。');
        return;
      }
      if (firebase.apps && firebase.apps.length) return;

      try {
        const res = await fetch('/api/config');
        if (!res.ok) {
          throw new Error('サーバーからFirebase設定を取得できませんでした。');
        }
        const firebaseConfig = await res.json();
        firebase.initializeApp(firebaseConfig);
      } catch (error) {
        console.error('Firebase初期化失敗:', error);
      }
    };

    // --- 自動抽出フィルター ---
    const uniqueUploaders = computed(() => {
      const uploaders = photos.value.map(p => p.uploader).filter(Boolean);
      return [...new Set(uploaders)];
    });

    const uniqueTags = computed(() => {
      const tags = photos.value.flatMap(p => p.tags || []).filter(Boolean);
      return [...new Set(tags)];
    });

    // -----------------------------
    // Firestore の購読解除ハンドラを保持
    // -----------------------------
    let unsubArtworks = null;
    let unsubUsers = null;

    const cleanupSubscriptions = () => {
      if (unsubArtworks) {
        try { unsubArtworks(); } catch (e) { /* ignore */ }
        unsubArtworks = null;
      }
      if (unsubUsers) {
        try { unsubUsers(); } catch (e) { /* ignore */ }
        unsubUsers = null;
      }
    };

    // --- リアルタイムデータの購読 (Firestore) ---
    const subscribeData = () => {
      const db = firebase.firestore();

      if (unsubArtworks) { unsubArtworks(); unsubArtworks = null; }
      unsubArtworks = db.collection('artworks').orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
          const loadedPhotos = [];
          snapshot.forEach((doc) => {
            loadedPhotos.push({ id: doc.id, ...doc.data() });
          });
          photos.value = loadedPhotos;
        }, (error) => {
          console.error('作品データの同期エラー:', error);
        });

      if (currentUserRole.value === 'admin') {
        if (unsubUsers) { unsubUsers(); unsubUsers = null; }
        unsubUsers = db.collection('users').orderBy('createdAt', 'desc')
          .onSnapshot((snapshot) => {
            const loadedUsers = [];
            snapshot.forEach((doc) => {
              loadedUsers.push(doc.data());
            });
            usersList.value = loadedUsers;
          }, (error) => {
            console.error('ユーザーデータの同期エラー:', error);
          });
      } else {
        if (unsubUsers) { unsubUsers(); unsubUsers = null; }
      }
    };

    // --- データベース書き込みアクション ---
    const togglePin = async (photo) => {
      try {
        const db = firebase.firestore();
        await db.collection('artworks').doc(photo.id).update({ isPinned: !photo.isPinned });
        showToast(!photo.isPinned ? `「${photo.title}」を特別展示に指定しました。` : '特別展示を解除しました。');
      } catch (e) { showToast('権限または通信エラーが発生しました。'); }
    };

    const toggleHide = async (photo) => {
      try {
        const db = firebase.firestore();
        await db.collection('artworks').doc(photo.id).update({ isHidden: !photo.isHidden });
        showToast(!photo.isHidden ? '作品をバックヤードに保管しました。' : '作品を常設展示に戻しました。');
      } catch (e) { showToast('操作に失敗しました。'); }
    };

    const deletePhoto = async (photo) => {
      if (!confirm(`「${photo.title}」を削除しますか？（データベースから完全に削除されます）`)) return;
      try {
        const db = firebase.firestore();
        await db.collection('artworks').doc(photo.id).delete();
        showToast('作品を削除しました。');
        if (selectedPhoto.value?.id === photo.id) closeModal();
      } catch (e) { showToast('削除権限がありません。'); }
    };

    // --- BAN管理アクション ---
    const openBanConfirm = async (user) => {
      const db = firebase.firestore();
      if (user.status === 'banned') {
        try {
          await db.collection('users').doc(user.uid).update({ status: 'active' });
          await callServerBanApi(user.uid, 'unban');
          showToast(`${user.username} の追放を解除しました。`);
        } catch (e) {
          showToast('解除処理に失敗しました。');
        }
        return;
      }
      banConfirmModal.value = { show: true, user: user };
    };

    const executeBanUser = async () => {
      const user = banConfirmModal.value.user;
      if (user) {
        try {
          const db = firebase.firestore();
          await db.collection('users').doc(user.uid).update({ status: 'banned' });
          await callServerBanApi(user.uid, 'ban');
          showToast(`${user.username} を追放しました。`);
        } catch (e) {
          console.error('executeBanUser error', e);
          showToast('追放処理に失敗しました。');
        }
      }
      closeBanConfirm();
    };

    const callServerBanApi = async (uid, action) => {
      try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error('認証が必要です');
        const token = await user.getIdToken();
        const res = await fetch('/api/ban-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ uid, action })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`server error: ${res.status} ${text}`);
        }
        return await res.json();
      } catch (e) {
        console.error('callServerBanApi error', e);
        throw e;
      }
    };

    // --- 表示ロジック（画像エラーのフィルターを追加） ---
    const filteredPhotos = computed(() => {
      let list = photos.value;
      
      if (currentUserRole.value !== 'admin') {
        // 一般ユーザーには バックヤード保管中 OR 画像リンク切れ の作品を非表示
        list = list.filter(photo => !photo.isHidden && !brokenPhotoIds.value.includes(photo.id));
      }
      
      if (filterPinnedOnly.value) list = list.filter(photo => photo.isPinned);
      if (selectedUploader.value) list = list.filter(photo => photo.uploader === selectedUploader.value);
      if (selectedTag.value) list = list.filter(photo => photo.tags && photo.tags.includes(selectedTag.value));
      return list;
    });

    const totalPages = computed(() => Math.ceil(filteredPhotos.value.length / itemsPerPage) || 1);
    const displayedPhotos = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage;
      return filteredPhotos.value.slice(start, start + itemsPerPage);
    });

    const changePage = (page) => {
      if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    const openAdminPanel = () => { showAdminPanel.value = true; document.body.style.overflow = 'hidden'; };
    const closeAdminPanel = () => { showAdminPanel.value = false; if (!selectedPhoto.value) document.body.style.overflow = ''; };
    const closeBanConfirm = () => { banConfirmModal.value = { show: false, user: null }; };
    const goToLogin = () => { window.location.href = 'login.html'; };
    const goToUpload = () => { window.location.href = 'upload.html'; };
    const resetPage = () => { currentPage.value = 1; };
    const openModal = (photo) => { if (!photo.isHidden || currentUserRole.value === 'admin') { selectedPhoto.value = photo; document.body.style.overflow = 'hidden'; } };
    const closeModal = () => { selectedPhoto.value = null; if (!showAdminPanel.value) document.body.style.overflow = ''; };

    const handleLogout = async () => {
      try {
        cleanupSubscriptions();
        await firebase.auth().signOut();
        showToast('ログアウトしました。');
      } catch (e) {
        console.error('logout error', e);
        showToast('ログアウトに失敗しました。');
      }
    };

    const formatDate = (timestamp) => {
      if (!timestamp) return '読込中...';
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    // --- ライフサイクル ---
    onMounted(async () => {
      await initFirebase();

      firebase.auth().onAuthStateChanged(async (user) => {
        cleanupSubscriptions();

        if (user) {
          currentUserId.value = user.uid;
          isLoggedIn.value = true;

          try {
            const db = firebase.firestore();
            const userDoc = await db.collection('users').doc(user.uid).get();

            if (userDoc.exists) {
              const userData = userDoc.data();
              if (userData.status === 'banned') {
                await firebase.auth().signOut();
                window.location.href = 'login.html';
                return;
              }
              username.value = userData.username || '名無しの作家';
              currentUserRole.value = userData.role || 'user';
            } else {
              currentUserRole.value = 'user';
            }
          } catch (error) {
            console.error('ユーザーロール取得エラー:', error);
          }

          subscribeData();

        } else {
          isLoggedIn.value = false;
          username.value = 'ゲスト';
          currentUserRole.value = 'guest';
          currentUserId.value = '';

          subscribeData();
        }
      });
    });

    watch(currentUserRole, () => {
      subscribeData();
    });

    return {
      isLoggedIn, username, currentUserRole, currentUserId, photos, displayedPhotos, selectedPhoto,
      showAdminPanel, banConfirmModal, currentPage, totalPages, toast, usersList, filterPinnedOnly,
      selectedUploader, selectedTag, uniqueUploaders, uniqueTags, resetPage, formatDate, openModal,
      closeModal, goToUpload, changePage, goToLogin, handleLogout, togglePin, toggleHide, deletePhoto,
      openAdminPanel, closeAdminPanel, openBanConfirm, closeBanConfirm, executeBanUser,
      brokenPhotoIds, handleImageError
    };
  }
}).mount('#app');