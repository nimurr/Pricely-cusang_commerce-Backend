const express = require("express");
const config = require("../../config/config");
const authRoute = require("./auth.routes");
const userRoute = require("./user.routes");
const docsRoute = require("./docs.routes");
const analysisHistoryRoute = require("./analysisHistoryRoute.routes");
const webhookRoute = require("./webhook.routes");
const feedbackRoute = require("./feedback.routes");
const productRoute = require("./product.routes");
const notificationRoute = require("./notifications.routes");

const router = express.Router();

const defaultRoutes = [
  {
    path: "/auth",
    route: authRoute,
  },
  {
    path: "/users",
    route: userRoute,
  },
  {
    path: "/feedback",
    route: feedbackRoute,
  },
  {
    path: "/products",
    route: productRoute,
  },
  {
    path: "/notifications",
    route: notificationRoute,
  }









  // {
  //   path: "/analysis-history",
  //   route: analysisHistoryRoute,
  // },
  // {
  //   path: "/checkout",
  //   route: webhookRoute,
  // }

];

const devRoutes = [
  // routes available only in development mode
  {
    path: "/docs",
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === "development") {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
