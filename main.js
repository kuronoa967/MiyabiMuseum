// computed（自動計算関数）を Vue から一緒に取り出す
const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    const username = ref('ゲスト');
    const photos = ref([]);
    const selectedPhoto = ref(null);
    
    // ページネーション用の状態管理
    const currentPage = ref(1);
    const itemsPerPage = 24; // 1ページあたりの最大表示枚数

    // 総ページ数の計算（例：30枚あれば、30 / 24 = 1.25 -> 切り上げて 2 ページ）
    const totalPages = computed(() => {
      return Math.ceil(photos.value.length / itemsPerPage);
    });

    // 現在のページに表示すべき24枚だけを切り出す計算
    const displayedPhotos = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      return photos.value.slice(start, end);
    });

    // ページを切り替える関数
    const changePage = (page) => {
      if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
        // ページ移動時に、美術館の壁面トップへ滑らかにスクロールさせる
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    // ダミーデータの読み込み（テスト用に30枚に増殖させています）
    const loadDummyData = () => {
      const basePhotos = [
        { id: '1', cloudinaryUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1000&q=80', title: '深い森の呼吸', description: '朝霧が立ち込める静かな森の一角。', uploader: '佐藤 太郎', createdAt: { seconds: 1770000000 } },
        { id: '2', cloudinaryUrl: 'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=800&q=80', title: '色彩の溶融', description: '水面に映る街の灯りが混ざり合っています。', uploader: '鈴木 花子', createdAt: { seconds: 1770100000 } },
        { id: '3', cloudinaryUrl: 'https://images.unsplash.com/photo-1579783922669-a951f044c32a?w=800&q=80', title: '琥珀色の午後', description: '古い喫茶店の窓辺。時間を忘れる空間。', uploader: '田中 一郎', createdAt: { seconds: 1770200000 } },
        { id: '4', cloudinaryUrl: 'https://images.unsplash.com/photo-1578320339911-65cc7a884803?w=800&q=80', title: '時の彫刻', description: '静寂の中に佇む石像。歴史の重み。', uploader: '佐藤 太郎', createdAt: { seconds: 1770300000 } },
        { id: '5', cloudinaryUrl: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=1000&q=80', title: '直線と陰影', description: '近代建築の美しいラインとコントラスト。', uploader: '鈴木 花子', createdAt: { seconds: 1770400000 } }
      ];

      // テスト用に5枚のデータをループで30枚（1ページ24枚を超える分）に複製
      const mockList = [];
      for (let i = 0; i < 30; i++) {
        const base = basePhotos[i % basePhotos.length];
        mockList.push({
          ...base,
          id: `${i + 1}`,
          title: `${base.title} #${i + 1}` // 番号を振って分かりやすく
        });
      }
      photos.value = mockList;
    };

    onMounted(() => { 
      loadDummyData(); 
    });

    const formatDate = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp.seconds * 1000);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${date.getFullYear()}.${month}.${day}`;
    };

    const openModal = (photo) => { selectedPhoto.value = photo; };
    const closeModal = () => { selectedPhoto.value = null; };
    const handleLogout = () => { alert('ログアウト処理（今後実装）'); };
    const goToUpload = () => { alert('アップロードパネルを開く（今後実装）'); };

    return {
      username,
      photos,
      displayedPhotos,
      selectedPhoto,
      currentPage,
      totalPages,
      formatDate,
      openModal,
      closeModal,
      handleLogout,
      goToUpload,
      changePage
    };
  }
}).mount('#app');