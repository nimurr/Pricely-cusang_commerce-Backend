const { emailService } = require(".");

const createFeedback = async (email, feedbackData) => {


    const title = feedbackData.title;
    const message = feedbackData.message;


    const res = await emailService.sendFeedbackEmail(email, 'info.pricely@gmail.com', title, message);
    console.log(res);
    return res;
}
module.exports = {
    createFeedback,
};