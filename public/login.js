const { createApp, ref } = Vue;

createApp({
  setup() {
    const email = ref('');
    const password = ref('');
    const errorMessage = ref('');
    const isLoading = ref(false);
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

    const goBack = () => {
      window.location.href = 'index.html';
    };

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