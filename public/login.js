const { createApp, ref } = Vue;

createApp({
  setup() {
    const email = ref('');
    const password = ref('');
    const errorMessage = ref('');
    const isLoading = ref(false);
<<<<<<< HEAD
    const showBanModal = ref(false);

    // 1. Renderサーバー経由でFirebase設定を安全に取得・初期化する
    const initFirebase = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
      } catch (error) {
        console.error("Firebase初期化設定の取得に失敗しました:", error);
      }
    };

=======
    
    // ★追加：追放ダイアログの表示状態を管理
    const showBanModal = ref(false);
    
>>>>>>> 5271017f2a137212771b305a0edc7a35d28d91c3
    const goBack = () => {
      window.location.href = 'index.html';
    };

<<<<<<< HEAD
    const submitLogin = async () => {
      errorMessage.value = '';
      isLoading.value = true;

      try {
        // Firebaseの初期化
        await initFirebase();
        const auth = firebase.auth();

        // 2. Firebase Authenticationでログイン
        await auth.signInWithEmailAndPassword(email.value, password.value);
        
        // 3. Renderサーバーで「追放フラグ」をチェック
        const response = await fetch('/api/login-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value })
        });

        // 4. 403 Forbidden が返ってきたら追放(BAN)と判断
        if (response.status === 403) {
          await auth.signOut(); // 強制ログアウト
          showBanModal.value = true;
          isLoading.value = false;
          return;
        }

        // 5. ログイン成功
        localStorage.setItem('museum_logged_in', 'true');
        window.location.href = 'index.html';

      } catch (error) {
        console.error("ログインエラー:", error);
        errorMessage.value = 'メールアドレス、またはパスワードが正しくありません。';
      } finally {
        isLoading.value = false;
      }
=======
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
>>>>>>> 5271017f2a137212771b305a0edc7a35d28d91c3
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