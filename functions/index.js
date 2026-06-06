const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * notifications/{staffId} に書き込まれたとき FCM プッシュを送信する
 */
exports.sendPushOnNotification = onDocumentWritten(
  "notifications/{staffId}",
  async (event) => {
    const afterSnap = event.data?.after;
    // ドキュメント削除時は何もしない
    if (!afterSnap?.exists) return;

    const data = afterSnap.data();
    const staffId = event.params.staffId;

    // users/{staffId} から FCM トークンを取得
    const userSnap = await admin.firestore()
      .collection("users")
      .doc(staffId)
      .get();

    const fcmToken = userSnap.data()?.fcmToken;
    if (!fcmToken) {
      console.log(`No FCM token for staff: ${staffId}`);
      return;
    }

    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: "シフト管理",
          body: data.message,
        },
        webpush: {
          fcm_options: { link: "https://shift-97e6f.web.app/" },
        },
      });
      console.log(`✅ Push sent to ${staffId}`);
    } catch (err) {
      console.error("Push error:", err.code, err.message);
      // 無効なトークンならクリア
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await admin.firestore()
          .collection("users")
          .doc(staffId)
          .update({ fcmToken: null });
      }
    }
  }
);
