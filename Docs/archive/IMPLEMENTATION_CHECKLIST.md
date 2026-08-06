# Email Verification System - Quick Start Guide

## ✅ System Status: FULLY IMPLEMENTED

All code has been implemented in your **DagatScan Bataan** coastal erosion monitoring platform.

---

## 📋 Pre-Flight Checklist

### ✅ Backend Files

- [x] `server.js` - Updated with dotenv, register/verify/login/resend-code endpoints
- [x] `email.js` - Email service ready with your Gmail credentials
- [x] `db.js` - Database connection configured
- [x] `.env` - Email credentials set up
- [x] `package.json` - All dependencies installed (bcrypt, cors, dotenv, express, jwt, nodemailer, pg)

### ✅ Frontend Files

- [x] `api/auth.js` - Register, verify, resend, and login functions
- [x] `pages/register.jsx` - Registration page with validation
- [x] `pages/login.jsx` - Login page with verification check
- [x] `pages/verify.jsx` - Email verification page
- [x] `App.jsx` - Routes configured

### ✅ Database

- [ ] Run migration SQL script (DO THIS NEXT)

---

## 🚀 Implementation Steps

### Step 1: Update Your Database

Open PostgreSQL and run this command:

```bash
psql -U postgres -d db_coastalerosion -f DB_MIGRATION.sql
```

Or copy the migrations manually:

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='verified'
    ) THEN
        ALTER TABLE users ADD COLUMN verified BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='verification_code'
    ) THEN
        ALTER TABLE users ADD COLUMN verification_code VARCHAR(10);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_verification_code ON users(verification_code);
```

**Verify it worked:**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='users' ORDER BY ordinal_position;
```

You should see:

- `verified` (boolean)
- `verification_code` (character varying)

---

### Step 2: Start the Backend Server

```bash
cd coastalerosion/backend
npm start
```

Should display:

```
Email service ready
Server running on http://localhost:5000
```

---

### Step 3: Start the Frontend Development Server

In a new terminal:

```bash
cd coastalerosion/frontend
npm run dev
```

Should display:

```
  VITE v... ready in ... ms

  ➜  Local:   http://localhost:5173/
```

---

## 🧪 Testing the Complete Flow

### Test Registration → Verification → Login

1. **Open browser**: `http://localhost:5173`
2. **Click Register**
3. **Fill in the form**:
   - Username: `testuser`
   - Email: `your_real_email@gmail.com` (will receive code)
   - Password: `Test123456`
   - Confirm: `Test123456`
4. **Click "Register" button**

**Expected response**: "User registered. Verification code sent to email."

5. **Check your email** for a message from DagatScan Bataan with a 6-digit code
6. **Enter the code** on the verification page
7. **Click "Verify Email"**

**Expected response**: "Email verified! Redirecting to login..."

8. **Login page** should appear automatically
9. **Enter credentials**:
   - Email: `your_real_email@gmail.com`
   - Password: `Test123456`
10. **Click "Login"**

**Expected result**: Redirected to `/home` page ✅

---

## 🔍 Verify Database Records

After completing a test registration:

```sql
-- View all users
SELECT id, username, email, verified, verification_code FROM users;

-- Should show:
-- id | username | email               | verified | verification_code
-- 1  | testuser | test@example.com    | true     | NULL
```

---

## 🛠️ Troubleshooting

### Email Not Sending?

**Error in backend console:**

```
Email service error: ...
```

**Solutions**:

1. Verify Gmail App Password is correct in `.env`
2. Enable 2FA on Gmail: https://myaccount.google.com/apppasswords
3. Check `.env` file exists in backend folder
4. Restart backend server after `.env` changes

**Test email connection:**

```bash
# In backend folder
node
> require('nodemailer')
> const transporter = require('./email.js')
> transporter.verify()
```

---

### Verification Code Invalid?

**Error**: "Invalid verification code"

**Solutions**:

1. Code must be exactly 6 digits
2. Code is case-sensitive
3. Code expires after verification attempt
4. Click "Resend" to get a new code

---

### Can't Login After Verification?

**Error**: "Email not verified. Please verify your email first."

**Solutions**:

1. Check database: `SELECT verified FROM users WHERE email='...';`
2. If `verified` is `false`, run the `/verify` endpoint again
3. Make sure verification code matches exactly

---

### CORS or Network Error?

**Error**: "Failed to fetch" or CORS error

**Solutions**:

1. Backend must be running on `http://localhost:5000`
2. Frontend must be running on `http://localhost:5173`
3. Check backend console for errors
4. Restart both servers

---

## 📊 API Endpoints Reference

### Register User

```
POST http://localhost:5000/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}

Response:
{
  "message": "User registered. Verification code sent to email.",
  "userId": 1,
  "email": "john@example.com"
}
```

### Verify Email

```
POST http://localhost:5000/verify
Content-Type: application/json

{
  "email": "john@example.com",
  "code": "483921"
}

Response:
{ "message": "Email verified successfully" }
```

### Resend Verification Code

```
POST http://localhost:5000/resend-code
Content-Type: application/json

{ "email": "john@example.com" }

Response:
{ "message": "New verification code sent to email" }
```

### Login

```
POST http://localhost:5000/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123"
}

Response (verified):
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}

Response (unverified):
{
  "error": "Email not verified. Please verify your email first.",
  "userId": 1,
  "email": "john@example.com"
}
```

---

## 📁 Project Structure

```
coastalerosion/
├── backend/
│   ├── server.js                     ✅ UPDATED
│   ├── email.js                      ✅ NEW
│   ├── db.js                         ✅ CONFIGURED
│   ├── .env                          ✅ READY
│   ├── package.json                  ✅ READY
│   ├── DB_MIGRATION.sql              ✅ NEW
│   └── SETUP_EMAIL_VERIFICATION.md   (Reference)
│
└── frontend/
    ├── src/
    │   ├── App.jsx                   ✅ UPDATED
    │   ├── api/
    │   │   └── auth.js               ✅ UPDATED
    │   └── pages/
    │       ├── register.jsx          ✅ UPDATED
    │       ├── login.jsx             ✅ UPDATED
    │       ├── verify.jsx            ✅ NEW
    │       ├── Home.jsx              (Unchanged)
    │       ├── Map.jsx               (Unchanged)
    │       └── style.css             (Shared styles)
```

---

## 🎯 Features Implemented

✅ **User Registration**

- Username, email, password input
- Password confirmation validation
- Automatic full name generation from email
- Verification code generation

✅ **Email Verification**

- Send 6-digit code to user's email
- Beautiful HTML email template
- Verify code against database
- Mark user as verified

✅ **Secure Login**

- Check if user is verified before login
- JWT token generation
- Bcrypt password hashing
- Direct link to verification if unverified

✅ **Resend Code**

- Generate new verification code
- Re-send email with new code
- Update database with latest code

✅ **Error Handling**

- Clear error messages
- Validation on frontend and backend
- Database integrity checks

✅ **Professional UX**

- Loading states on buttons
- Success/error notifications
- Email confirmation messaging
- Auto-redirect after verification

---

## 🔐 Security Features

✅ Passwords hashed with bcrypt (10 salt rounds)
✅ JWT tokens with 1-hour expiration
✅ Environment variables for secrets
✅ SQL injection prevention (parameterized queries)
✅ CORS configured for frontend only
✅ Email verification before login
✅ Code validation on server

---

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. View backend console for error messages
3. Check frontend browser console (F12)
4. Verify `.env` file exists and is properly formatted
5. Ensure both servers are running

---

## 🎉 You're All Set!

Your **DagatScan Bataan** coastal erosion monitoring platform now has a professional email verification system!

**Next Steps (Optional)**:

- Add forgot password functionality
- Implement 2-factor authentication
- Add email templates for additional events
- Create admin panel to manage users
- Add user profile page
- Implement rate limiting on endpoints

Good luck with your project! 🚀
