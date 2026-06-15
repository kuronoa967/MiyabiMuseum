const { createApp, ref } = Vue;

createApp({
  setup() {
    const username = ref('');
    const email = ref('');
    const password = ref('');
    const passwordConfirm = ref('');
    const errorMessage = ref('');
    const isLoading = ref(false);

    // ★追加：ログイン画面（または前の画面）に戻る処理
    const goBack = () => {
      // ログイン画面から来たケースが多いため、login.html へ戻すのが自然です
      window.location.href = 'login.html';
    };

    const submitRegister = () => {
      errorMessage.value = '';

      // 1. パスワードの一致チェック
      if (password.value !== passwordConfirm.value) {
        errorMessage.value = '再入力された合言葉が、最初のものと一致しません。';
        return;
      }

      isLoading.value = true;

      // 2. 登録処理のシミュレーション
      setTimeout(() => {
        isLoading.value = false;

        console.log('--- 新規出展者の登録データ ---');
        console.log('作家名:', username.value);
        console.log('メールアドレス:', email.value);
        console.log('パスワード:', password.value);

        // 登録成功と同時にログインした状態にする
        localStorage.setItem('museum_logged_in', 'true');
        
        // メイン展示室（index.html）へ進む
        window.location.href = 'index.html';
      }, 1500);
    };

    return {
      username,
      email,
      password,
      passwordConfirm,
      errorMessage,
      isLoading,
      goBack,         // ★追加：HTML側から呼べるように開放
      submitRegister
    };
  }
}).mount('#app');