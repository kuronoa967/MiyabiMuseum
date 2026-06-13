const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const username = ref('ゲスト');
    const photos = ref([]);
    const selectedPhoto = ref(null);

    // ダミーデータの読み込み
    const loadDummyData = () => {
      // photos.value = [
      //   {
      //     id: '1',
      //     cloudinaryUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1000&q=80',
      //     title: '深い森の呼吸',
      //     description: '朝霧が立ち込める静かな森の一角。光が差し込む瞬間を切り取りました。',
      //     uploader: '佐藤 太郎',
      //     createdAt: { seconds: 1770000000 }
      //   },
      //   {
      //     id: '2',
      //     cloudinaryUrl: 'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=800&q=80',
      //     title: '色彩の溶融',
      //     description: '水面に映る街の灯りが、まるで抽象画のように美しく混ざり合っています。',
      //     uploader: '鈴木 花子',
      //     createdAt: { seconds: 1770100000 }
      //   },
      //   {
      //     id: '3',
      //     cloudinaryUrl: 'https://images.unsplash.com/photo-1579783922669-a951f044c32a?w=800&q=80',
      //     title: '琥珀色の午後',
      //     description: '古い喫茶店の窓辺。時間を忘れてしまうような穏やかな空間。',
      //     uploader: '田中 一郎',
      //     createdAt: { seconds: 1770200000 }
      //   },
      //   {
      //     id: '4',
      //     cloudinaryUrl: 'https://images.unsplash.com/photo-1578320339911-65cc7a884803?w=800&q=80',
      //     title: '時の彫刻',
      //     description: '静寂の中に佇む石像。長い歴史の重みを感じさせます。',
      //     uploader: '佐藤 太郎',
      //     createdAt: { seconds: 1770300000 }
      //   },
      //   {
      //     id: '5',
      //     cloudinaryUrl: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=1000&q=80',
      //     title: '直線と陰影',
      //     description: '近代建築の美しいラインと、そこに生まれるコントラスト。',
      //     uploader: '鈴木 花子',
      //     createdAt: { seconds: 1770400000 }
      //   }
      // ];
    };

    onMounted(() => { 
      loadDummyData(); 
    });

    // 日付フォーマット
    const formatDate = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp.seconds * 1000);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${date.getFullYear()}.${month}.${day}`;
    };

    // モーダル制御
    const openModal = (photo) => { selectedPhoto.value = photo; };
    const closeModal = () => { selectedPhoto.value = null; };
    
    // アクション（今後実装）
    const handleLogout = () => { alert('ログアウト処理（今後実装）'); };
    const goToUpload = () => { alert('アップロードパネルを開く（今後実装）'); };

    return {
      username,
      photos,
      selectedPhoto,
      formatDate,
      openModal,
      closeModal,
      handleLogout,
      goToUpload
    };
  }
}).mount('#app');