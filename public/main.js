const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // --- 認証・権限状態 ---
    const isLoggedIn = ref(false);             
    const username = ref('ゲスト');            
    const currentUserRole = ref('guest');     // guest, user, admin
    const currentUserId = ref(''); 

    // --- データベース連動状態 ---
    const photos = ref([]);
    const usersList = ref([]); // Firestoreからリアルタイム取得
    const selectedPhoto = ref(null);
    const showAdminPanel = ref(false);        
    const currentPage = ref(1);
    const itemsPerPage = 24;

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

    const initFirebase = async () => {
      if (firebase.apps.length) return;
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        firebase.initializeApp(config);
      } catch (error) {
        console.error("Firebase初期化失敗:", error);
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

    // --- リアルタイムデータの購読 (Firestore) ---
    const subscribeData = () => {
      const db = firebase.firestore();

      // 1. 作品コレクションのリアルタイム監視（時系列降順）
      db.collection('artworks').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        const loadedPhotos = [];
        snapshot.forEach((doc) => {
          loadedPhotos.push({ id: doc.id, ...doc.data() });
        });
        photos.value = loadedPhotos;
      }, (error) => {
        console.error("作品データの同期エラー:", error);
      });

      // 2. 管理者の場合のみ、全ユーザーリストをリアルタイム監視
      if (currentUserRole.value === 'admin') {
        db.collection('users').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
          const loadedUsers = [];
          snapshot.forEach((doc) => {
            loadedUsers.push(doc.data());
          });
          usersList.value = loadedUsers;
        });
      }
    };

    // --- データベース書き込みアクション（Admin / User） ---
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
      if (confirm(`「${photo.title}」を削除しますか？（データベースから完全に削除されます）`)) {
        try {
          const db = firebase.firestore();
          await db.collection('artworks').doc(photo.id).delete();
          showToast('作品を削除しました。');
          if (selectedPhoto.value?.id === photo.id) closeModal();
        } catch (e) { showToast('削除権限がありません。'); }
      }
    };

    // --- BAN管理アクション ---
    const openBanConfirm = async (user) => {
      const db = firebase.firestore();
      if (user.status === 'banned') {
        // すでにBAN状態なら即時解除
        await db.collection('users').doc(user.uid).update({ status: 'active' });
        showToast(`${user.username} の追放を解除しました。`);
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
          showToast(`${user.username} を追放しました。`);
        } catch (e) { showToast('追放処理に失敗しました。'); }
      }
      closeBanConfirm();
    };

    // --- 表示ロジック（多重フィルター） ---
    const filteredPhotos = computed(() => {
      let list = photos.value;
      if (currentUserRole.value !== 'admin') {
        list = list.filter(photo => !photo.isHidden); // 一般・ゲストには非表示（バックヤード）を隠蔽
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
    const openModal = (photo) => { if(!photo.isHidden || currentUserRole.value === 'admin') { selectedPhoto.value = photo; document.body.style.overflow = 'hidden'; } };
    const closeModal = () => { selectedPhoto.value = null; if (!showAdminPanel.value) document.body.style.overflow = ''; };

    const handleLogout = async () => {
      try {
        await firebase.auth().signOut();
        showToast('ログアウトしました。');
      } catch (e) { showToast('ログアウトに失敗しました。'); }
    };

    const formatDate = (timestamp) => {
      if (!timestamp) return '読込中...';
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    // --- ライフサイクル（認証の監視とデータ購読） ---
    onMounted(async () => {
      await initFirebase();
      
      firebase.auth().onAuthStateChanged(async (user) => {
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
            }
          } catch (error) {
            console.error("ユーザーロール取得エラー:", error);
          }

          // 【修正】ログインユーザー（一般・管理者）のロール取得が完了してから同期スタート
          subscribeData();

        } else {
          isLoggedIn.value = false;
          username.value = 'ゲスト';
          currentUserRole.value = 'guest';
          currentUserId.value = '';

          // 【修正】ゲストの場合もここで安全に同期スタート
          subscribeData();
        }
      });
    });

    return {
      isLoggedIn, username, currentUserRole, currentUserId, photos, displayedPhotos, selectedPhoto,
      showAdminPanel, banConfirmModal, currentPage, totalPages, toast, usersList, filterPinnedOnly,
      selectedUploader, selectedTag, uniqueUploaders, uniqueTags, resetPage, formatDate, openModal,
      closeModal, goToUpload, changePage, goToLogin, handleLogout, togglePin, toggleHide, deletePhoto,
      openAdminPanel, closeAdminPanel, openBanConfirm, closeBanConfirm, executeBanUser
    };
  }
}).mount('#app');