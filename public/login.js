const { createApp, ref } = Vue;

createApp({
  setup() {
    const email = ref('');
    const password = ref('');
    const errorMessage = ref('');
    const isLoading = ref(false);
    const showBanModal = ref(false);

    // RenderサーバーからFirebase設定を取得して初期化
    const initFirebase = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
      } catch (error) {
        console.error("Firebase初期化失敗:", error);
        throw error;
      }
    };

    const goBack = () => { window.location.href = 'index.html'; };

    const submitLogin = async () => {
      errorMessage.value = '';
      isLoading.value = true;

      try {
        await initFirebase();
        const auth = firebase.auth();

        // 1. Firebase Authentication でログイン認証
        const userCredential = await auth.signInWithEmailAndPassword(email.value, password.value);
        const user = userCredential.user;

        // 2. サーバー検証用のIDトークンを取得
        const idToken = await user.getIdToken();
        
        // 3. RenderのBANチェックエンドポイントへ問い合わせ
        const response = await fetch('/api/login-check', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          }
        });

        // 4. BAN（403）を検知した場合
        if (response.status === 403) {
          await auth.signOut(); // セッションを即座に破棄
          showBanModal.value = true;
          isLoading.value = false;
          return;
        }

        if (!response.ok) throw new Error('サーバーチェックに失敗しました');

        // 5. ログイン成功
        window.location.href = 'index.html';

      } catch (error) {
        console.error("ログインエラー:", error);
        
        // ★修正：最新のFirebaseエラーコードに対応
        if (error.code === 'auth/invalid-login-credentials' || 
            error.code === 'auth/user-not-found' || 
            error.code === 'auth/wrong-password') {
          errorMessage.value = 'メールアドレスまたは合言葉（パスワード）が違います。';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage.value = 'メールアドレスの形式が正しくありません。';
        } else if (error.code === 'auth/user-disabled') {
          errorMessage.value = 'このアカウントは無効化されています。';
        } else {
          // その他の予期せぬエラー
          errorMessage.value = `ログイン処理中にエラーが発生しました（${error.message}）`;
        }

      } finally {
        isLoading.value = false;
      }
    };

    return { email, password, errorMessage, isLoading, showBanModal, goBack, submitLogin };
  }
}).mount('#app');