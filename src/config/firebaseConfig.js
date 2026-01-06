const admin = require("firebase-admin");
const serviceAccount = require("./car-wash-app-4a70f-firebase-adminsdk-cd5tl-b6815105c0.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
