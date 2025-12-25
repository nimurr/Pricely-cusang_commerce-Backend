const { emailService } = require(".");

const createFeedback = async (data) => {

    const title = data.title;
    const message = data.message;


    const res = await emailService.sendFeedbackEmail('bdcalling.nerob@gmail.com', title, message);
    console.log(res);
    return res;
}
module.exports = {
    createFeedback,
};