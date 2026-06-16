const { createApp, ref } = Vue;

createApp({
  setup() {
    const email = ref('');
    const password = ref('');
    const errorMessage = ref('');
    const isLoading = ref(false);
    
    // ★追加：追放ダイアログの表示状態を管理
    const showBanModal = ref(false);
    
    const goBack = () => {
      window.location.href = 'index.html';
    };

    const submitLogin = () => {
      errorMessage.value = '';
      isLoading.value = true;

      setTimeout(() => {
        isLoading.value = false;
        
        // ★テスト用の追放（BAN）チェックシミュレーション
        // 動作確認用：識別名に「banned@email.com」と入力した場合は追放ダイアログを出します
        // （Firebase導入後は、取得したユーザーデータの status === 'banned' を判定してここに繋ぎます）
        if (email.value === 'banned@email.com') {
          showBanModal.value = true;
          return; // 処理をここで中断してログインさせない
        }

        // テスト用の合言葉チェック（Firebase導入後はここを書き換えます）
        if (password.value === 'password123') {
          // ログイン成功の記憶をブラウザに刻む
          localStorage.setItem('museum_logged_in', 'true');
          // 展示室（index.html）へ戻る
          window.location.href = 'index.html';
        } else {
          errorMessage.value = 'メールアドレス、またはパスワードが正しくありません。';
        }
      }, 1000);
    };

    return {
      email,
      password,
      errorMessage,
      isLoading,
      showBanModal,
      goBack,
      submitLogin
    };
  }
}).mount('#app');