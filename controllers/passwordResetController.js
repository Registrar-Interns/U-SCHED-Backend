// controllers/passwordResetController.js
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const pool = require('../db');

// Note: Ensure your `users` table has additional columns: resetToken (VARCHAR) and resetExpires (BIGINT)

exports.requestPasswordReset = (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  // Look up user by email
  const selectQuery = 'SELECT * FROM users WHERE email = ?';
  pool.query(selectQuery, [email], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error.', error: err.message });
    }
    if (results.length === 0) {
      // For security, respond with the same message even if no user is found.
      return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
    }
    const user = results[0];

    // Generate a token (valid for 1 hour)
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetExpires = Date.now() + 3600000; // 1 hour from now

    // Update the user record with the reset token and expiration
    const updateQuery = 'UPDATE users SET resetToken = ?, resetExpires = ? WHERE user_id = ?';
    pool.query(updateQuery, [resetToken, resetExpires, user.user_id], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ message: 'Error setting reset token.', error: updateErr.message });
      }

      const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const resetLink = `http://localhost:5173/reset-password/set?token=${resetToken}`;
      const mailOptions = {
        from: "U-SCHED <carlaarongalang@gmail.com>",
        to: email,
        subject: "Password Reset",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8" />
              <title>Password Reset</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f2f2f2;">
              <table width="100%" bgcolor="#f2f2f2" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <!-- Main container -->
                    <table width="600" bgcolor="#ffffff" cellpadding="0" cellspacing="0" style="border-radius: 5px;">
                      <tr>
                        <td style="padding: 20px;">
                          <h1 style="margin-top: 0; color: #333333; text-align: center;">Hello!</h1>
                          <p style="font-size: 16px; color: #333333;">
                            You are receiving this email because we received a password reset request for your account.
                          </p>
      
                          <!-- Reset Button -->
                          <div style="text-align: center; margin: 30px 0;">
                            <a
                              href="${resetLink}"
                              style="
                                background-color: #4CAF50;
                                color: #ffffff;
                                padding: 12px 24px;
                                text-decoration: none;
                                border-radius: 4px;
                                font-size: 16px;
                                display: inline-block;
                              "
                            >
                              Reset Password
                            </a>
                          </div>
      
                          <p style="font-size: 16px; color: #333333;">
                            This password reset link will expire in 60 minutes.
                            <br /><br />
                            If you did not request a password reset, no further action is required.
                          </p>
      
                          <p style="font-size: 16px; color: #333333;">
                            Regards,
                            <br />
                            U-SCHED
                          </p>
      
                          <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eeeeee;" />
      
                          <p style="font-size: 14px; color: #999999;">
                            If you're having trouble clicking the "Reset Password" button,
                            copy and paste the URL below into your web browser:
                            <br />
                            <a href="${resetLink}" style="color: #4CAF50;">${resetLink}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                    <!-- End main container -->
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      };      

      transporter.sendMail(mailOptions, (mailErr, info) => {
        if (mailErr) {
          console.error(mailErr);
          return res.status(500).json({ message: 'Error sending email.' });
        }

        // Log the nodemailer info object to see details like messageId, accepted recipients, etc.
        console.log("Email sent successfully:", info);
        res.json({ message: 'If that email exists, a reset link has been sent.' });
      });
    });
  });
};

exports.resetPassword = (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required.' });
    }
  
    // Find user with matching token that hasn't expired
    const selectQuery = 'SELECT * FROM users WHERE resetToken = ? AND resetExpires > ?';
    pool.query(selectQuery, [token, Date.now()], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Database error.', error: err.message });
      }
      if (results.length === 0) {
        return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
      }
  
      const user = results[0];
      // Hash the new password
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
  
      // 1) Update the user table
      const updateUsersQuery = `
        UPDATE users
        SET password = ?, resetToken = NULL, resetExpires = NULL
        WHERE user_id = ?
      `;
      pool.query(updateUsersQuery, [hashedPassword, user.user_id], (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ message: 'Error resetting password (users).', error: updateErr.message });
        }
  
        // 2) If the user is ADMIN, also update the admin table
        if (user.role === 'ADMIN') {
          const updateAdminQuery = `
            UPDATE admin
            SET password = ?
            WHERE admin_id = ?
          `;
          pool.query(updateAdminQuery, [hashedPassword, user.ref_id], (adminErr) => {
            if (adminErr) {
              return res.status(500).json({ message: 'Error resetting password (admin).', error: adminErr.message });
            }
            // Done updating both tables
            return res.json({ message: 'Password has been reset successfully.' });
          });
        } else {
          // If the user is not ADMIN, we’re done after updating users table
          return res.json({ message: 'Password has been reset successfully.' });
        }
      });
    });
  };