const nodemailer = require("nodemailer");
const config = require("../config/config");
const logger = require("../config/logger");

const timeNow = () => new Date().toLocaleString();

const transport = nodemailer.createTransport(config.email.smtp);
/* istanbul ignore next */
if (config.env !== "test") {
  transport
    .verify()
    .then(() => logger.info("Connected to email server"))
    .catch((err) =>
      logger.warn(
        "Unable to connect to email server. Make sure you have configured the SMTP options in .env"
      )
    );
}


const sendEmail = async (to, subject, html) => {
  const msg = { from: config.email.from, to, subject, html };
  await transport.sendMail(msg);
};

const sendEmailVerification = async (to, otp) => {
  console.log("sendEmailVerification", to, otp);
  const subject = "User verification code";
  const html = `
  <body style="background-color: #f3f4f6; padding: 2rem; font-family: Arial, sans-serif; color: #333;">
    <div
        style="max-width: 32rem; margin: 0 auto; background-color: #ffffff; padding: 2rem; border-radius: 0.75rem; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15); text-align: center;">
         <img src="https://res.cloudinary.com/nerob/image/upload/v1766636310/ForBdcolling/logo_qa0fhd.png" alt="Pricely Logo" style="width: 100px; margin-bottom: 1rem;" />
              
        <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; color: #1f2937;">Welcome to Pricely</h1>
        <p style="color: #4b5563; margin-bottom: 1.5rem;">Thank you for joining Pricely TAG! Your account is almost
            ready.</p>
        <div
            style="background: linear-gradient(135deg, #35e6a5ff, #22b37dff); color: #ffffff; padding: 1rem; border-radius: 0.5rem; font-size: 2rem; font-weight: 800; letter-spacing: 0.1rem; margin-bottom: 1.5rem;">
            ${otp}
        </div>
        <p style="color: #4b5563; margin-bottom: 1.5rem;">Collect this code to verify your account.</p>
        <p style="color: #ff0000; font-size: 0.85rem; margin-top: 1.5rem;"> Email Sented at ${timeNow()}. This code expires in <span
                id="timer">5:00</span>
            minutes.</p>
        <a href="https://shadat-hossain.netlify.app" style="color: #888; font-size: 12px; text-decoration: none;"
            target="_blank">ᯤ
            Develop by ᯤ</a>
    </div>
`;
  await sendEmail(to, subject, html);
};

const sendResetPasswordEmail = async (to, otp) => {
  console.log("Password Reset Email", to, otp);
  const subject = "Password Reset Email";
  const html = `
      <body style="background-color: #f3f4f6; padding: 2rem; font-family: Arial, sans-serif; color: #333;">
          <div
              style="max-width: 32rem; margin: 0 auto; background-color: #ffffff; padding: 2rem; border-radius: 0.75rem; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15); text-align: center;">
          
            <img src="https://res.cloudinary.com/nerob/image/upload/v1766636310/ForBdcolling/logo_qa0fhd.png" alt="Pricely Logo" style="width: 100px; margin-bottom: 1rem;" />
            
              <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; color: #1f2937;">Password Reset Request
              </h1>
           
              <div
                  style="background: linear-gradient(135deg, #35e6a5ff, #22b37dff); color: #ffffff; padding: 1rem; border-radius: 0.5rem; font-size: 2rem; font-weight: 800; letter-spacing: 0.1rem; margin-bottom: 1.5rem;">
                  ${otp}
              </div>
              <p style="color: #d6471c; margin-bottom: 1.5rem;"> Email Sented at ${timeNow()}. This code is valid
                  for
                  5
                  minutes.</p>
          
              <a href="https://shadat-hossain.netlify.app" style="color: #888; font-size: 12px; text-decoration: none;"
                  target="_blank">ᯤ
                  Develop by ᯤ</a>
          </div>
      </body>
`;
  await sendEmail(to, subject, html);
};


const sendVerificationEmail = async (to, token) => {
  const subject = "Email Verification";
  // replace this url with the link to the email verification page of your front-end app
  const verificationEmailUrl = `http://link-to-app/verify-email?token=${token}`;
  const text = `Dear user,
To verify your email, click on this link: ${verificationEmailUrl}
If you did not create an account, then ignore this email.`;
  await sendEmail(to, subject, text);
};

const sendFeedbackEmail = async (to, title, message) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>New Feedback</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, Helvetica, sans-serif;">
    
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8; padding:20px;">
      <tr>
        <td align="center">
          
          <!-- Main Container -->
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
            
            <!-- Header -->
            <tr>
              <td style="background:#00aff5; padding:20px; text-align:center;">
                <h1 style="color:#ffffff; margin:0; font-size:24px;">
                  New Feedback Received
                </h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:30px;">
                <p style="font-size:16px; color:#333; margin-bottom:10px;">
                  <strong>Title:</strong>
                </p>
                <p style="font-size:15px; color:#555; margin-top:0;">
                  ${title}
                </p>

                <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

                <p style="font-size:16px; color:#333; margin-bottom:10px;">
                  <strong>Message:</strong>
                </p>
                <p style="font-size:15px; color:#555; line-height:1.6;">
                  ${message}
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f9fafb; padding:20px; text-align:center;">
                <p style="font-size:13px; color:#888; margin:0;">
                  This email was generated automatically from your website.
                </p>
                <p style="font-size:13px; color:#888; margin:5px 0 0;">
                  © ${new Date().getFullYear()} Your Company Name
                </p>
              </td>
            </tr>

          </table>
          <!-- End Main Container -->

        </td>
      </tr>
    </table>

  </body>
  </html>
  `;

  await sendEmail(to, `Feedback: ${title}`, html);
};


module.exports = {
  transport,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendEmailVerification,
  sendFeedbackEmail
};
