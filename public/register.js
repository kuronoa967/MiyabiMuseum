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

      if (password.value.length < 8) {
        errorMessage.value = 'パスワードは8文字以上で入力してください。';
        return;
      }

      if (password.value !== passwordConfirm.value) {
        errorMessage.value = '再入力されたパスワードが、最初のものと一致しません。';
        return;
      }

      isLoading.value = true;
      let createdUser = null; // エラー時のロールバック用

      try {
        await initFirebase();
        const auth = firebase.auth();
        const db = firebase.firestore();

        // 1. Firebase Authentication にユーザーを作成
        const userCredential = await auth.createUserWithEmailAndPassword(email.value, password.value);
        createdUser = userCredential.user;

        // 2. Authのプロフィールに作家名（Display Name）を設定
        await createdUser.updateProfile({ displayName: username.value });

        // 3. 一括書き込み（Batch）で users と usernames に同時保存
        const batch = db.batch();
        const cleanUsername = username.value.trim();
        const lowerUsername = cleanUsername.toLowerCase(); // 重複防止用の小文字化ID

        // users コレクションへの参照
        const userRef = db.collection('users').doc(createdUser.uid);
        batch.set(userRef, {
          uid: createdUser.uid,
          username: cleanUsername,
          email: email.value,
          role: 'user',       // 初期ロールは一般作家
          status: 'active',   // 初期状態はアクティブ
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // usernames コレクションへの参照（ドキュメントIDを小文字のユーザー名にする）
        const usernameRef = db.collection('usernames').doc(lowerUsername);
        batch.set(usernameRef, {
          uid: createdUser.uid
        });

        // ★ここで2つのデータを同時に書き込み（すでにユーザー名が存在すればルールで弾かれる）
        await batch.commit();

        window.location.href = 'index.html';

      } catch (error) {
        console.error("登録エラー:", error);

        // ★ユーザー名重複（セキュリティルールで拒否）などでFirestore保存に失敗した場合
        if (createdUser && (error.code === 'permission-denied' || error.message.includes('permission'))) {
          // 作成されかけたAuthアカウントを消去して元に戻す（ロールバック）
          await createdUser.delete().catch(() => {});
          errorMessage.value = 'このユーザー名は既に使用されています。別の名前を入力してください。';
        } else if (error.code === 'auth/email-already-in-use') {
          errorMessage.value = 'このメールアドレスは既に美術館に登録されています。';
        } else if (error.code === 'auth/weak-password') {
          errorMessage.value = 'パスワードが脆弱です。8文字以上で入力してください。';
        } else if (error.code === 'auth/invalid-email') { 
          errorMessage.value = 'メールアドレスの形式が正しくありません。半角英数で正しく入力してください。';
        } else {
          errorMessage.value = '参入申請の処理中に構造上のエラーが発生しました。';
        }
      } finally {
        isLoading.value = false;
      }
    };

    return { username, email, password, passwordConfirm, errorMessage, isLoading, goBack, submitRegister };
  }
}).mount('#app');