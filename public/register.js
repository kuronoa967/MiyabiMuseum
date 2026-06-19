const { createApp, ref } = Vue;

createApp({
  setup() {
    const username = ref('');
    const email = ref('');
    const password = ref('');
    const passwordConfirm = ref('');
    const errorMessage = ref('');
    const isLoading = ref(false);

    const initFirebase = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (!firebase.apps.length) firebase.initializeApp(config);
      } catch (error) {
        console.error("Firebase初期化失敗:", error);
        throw error;
      }
    };

    const goBack = () => { window.location.href = 'login.html'; };

    const submitRegister = async () => {
      errorMessage.value = '';

      if (password.value !== passwordConfirm.value) {
        errorMessage.value = '再入力されたパスワードが、最初のものと一致しません。';
        return;
      }

      isLoading.value = true;

      try {
        await initFirebase();
        const auth = firebase.auth();
        const db = firebase.firestore();

        // 1. Firebase Authentication にユーザーを作成
        const userCredential = await auth.createUserWithEmailAndPassword(email.value, password.value);
        const user = userCredential.user;

        // 2. Authのプロフィールに作家名（Display Name）を設定
        await user.updateProfile({ displayName: username.value });

        // 3. Firestore の users コレクションに権限メタデータを安全に格納
        await db.collection('users').doc(user.uid).set({
          uid: user.uid,
          username: username.value,
          email: email.value,
          role: 'user',       // 初期ロールは一般作家
          status: 'active',   // 初期状態はアクティブ
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        window.location.href = 'index.html';

      } catch (error) {
        console.error("登録エラー:", error);
        if (error.code === 'auth/email-already-in-use') {
          errorMessage.value = 'このメールアドレスは既に登録されています。';
        } else if (error.code === 'auth/weak-password') {
          errorMessage.value = 'パスワードが脆弱です。6文字以上で入力してください。';
        } else {
          errorMessage.value = '参入申請の処理中にエラーが発生しました。';
        }
      } finally {
        isLoading.value = false;
      }
    };

    return { username, email, password, passwordConfirm, errorMessage, isLoading, goBack, submitRegister };
  }
}).mount('#app');