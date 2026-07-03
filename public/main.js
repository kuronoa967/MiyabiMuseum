// main.js
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

    // -----------------------------
    // Firebase 初期化（/api/config を使わない）
    // ※ index.html に firebaseConfig を埋め込んでおく想定
    // -----------------------------
    const initFirebase = async () => {
      // firebase SDK は index.html で読み込まれている前提
      if (!window.firebase) {
        console.error('Firebase SDK が読み込まれていません。index.html を確認してください。');
        return;
      }
      if (firebase.apps && firebase.apps.length) return;
      try {
        if (typeof firebaseConfig === 'undefined') {
          console.error('firebaseConfig が見つかりません。index.html に設定を埋めてください。');
          return;
        }
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

      // 既存購読があれば解除してから再登録（重複防止）
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

      // 管理者の場合のみ、全ユーザーリストをリアルタイム監視
      // 管理者購読は currentUserRole を監視して動的に登録/解除する
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
        // admin でなければユーザー購読を解除
        if (unsubUsers) { unsubUsers(); unsubUsers = null; }
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
      if (!confirm(`「${photo.title}」を削除しますか？（データベースから完全に削除されます）`)) return;
      try {
        const db = firebase.firestore();
        await db.collection('artworks').doc(photo.id).delete();
        showToast('作品を削除しました。');
        if (selectedPhoto.value?.id === photo.id) closeModal();
      } catch (e) { showToast('削除権限がありません。'); }
    };

    // --- BAN管理アクション（クライアントは Firestore を更新するだけでなく、サーバーに通知） ---
    // 注意: カスタムクレーム（IDトークン）を更新するにはサーバー側で admin SDK を使う必要があるため、
    // ここではサーバーのエンドポイントを呼び出してカスタムクレーム更新を依頼する。
    const openBanConfirm = async (user) => {
      const db = firebase.firestore();
      if (user.status === 'banned') {
        // すでにBAN状態なら即時解除（Firestore の status を更新し、サーバーにも解除を依頼）
        try {
          await db.collection('users').doc(user.uid).update({ status: 'active' });
          // サーバーに解除を依頼（認証トークン付き）
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
          // 1) Firestore の status を更新（運用上の一次ソース）
          await db.collection('users').doc(user.uid).update({ status: 'banned' });
          // 2) サーバーにカスタムクレーム更新を依頼（サーバー側で admin.auth().setCustomUserClaims を実行）
          await callServerBanApi(user.uid, 'ban');
          showToast(`${user.username} を追放しました。`);
        } catch (e) {
          console.error('executeBanUser error', e);
          showToast('追放処理に失敗しました。');
        }
      }
      closeBanConfirm();
    };

    // サーバーに BAN/UNBAN を依頼するユーティリティ
    const callServerBanApi = async (uid, action) => {
      // action: 'ban' or 'unban'
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

    // --- 表示ロジック（多重フィルター） ---
    const filteredPhotos = computed(() => {
      let list = photos.value;
      if (currentUserRole.value !== 'admin') {
        list = list.filter(photo => !photo.isHidden);
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
        // 1) Firestore の購読を解除してからサインアウト
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

    // --- ライフサイクル（認証の監視とデータ購読） ---
    onMounted(async () => {
      await initFirebase();

      firebase.auth().onAuthStateChanged(async (user) => {
        // 購読の重複を避けるため、まず既存購読をクリア
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
                // Firestore の status が banned なら即サインアウト
                await firebase.auth().signOut();
                window.location.href = 'login.html';
                return;
              }
              username.value = userData.username || '名無しの作家';
              currentUserRole.value = userData.role || 'user';
            } else {
              // ユーザードキュメントがない場合はデフォルト role を user にする
              currentUserRole.value = 'user';
            }
          } catch (error) {
            console.error('ユーザーロール取得エラー:', error);
          }

          // ロールが決まったら購読開始
          subscribeData();

        } else {
          isLoggedIn.value = false;
          username.value = 'ゲスト';
          currentUserRole.value = 'guest';
          currentUserId.value = '';

          // ゲストでも作品は見たいので購読開始（ただし usersList は購読しない）
          subscribeData();
        }
      });
    });

    // --- currentUserRole の変化に追従して users 購読を切り替える ---
    watch(currentUserRole, (newRole, oldRole) => {
      // subscribeData 内で admin 判定しているので再実行すれば適切に切り替わる
      subscribeData();
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
