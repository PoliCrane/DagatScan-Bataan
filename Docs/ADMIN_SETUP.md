# Admin Setup Guide

## Creating Your First Admin Account

To create the first admin account for the Coastal Erosion Monitoring system, follow these steps:

### Step 1: Ensure Backend is Running

Make sure the backend server is running on `http://localhost:5000`

### Step 2: Create Admin Account via API

Use one of the following methods to create an admin account:

#### Option A: Using cURL (Command Line)

```bash
curl -X POST http://localhost:5000/admin/create-admin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "adminuser",
    "email": "admin@coastalerosion.com",
    "password": "AdminPassword123"
  }'
```

#### Option B: Using Postman

1. Open Postman
2. Create a new POST request
3. URL: `http://localhost:5000/admin/create-admin`
4. Headers: Set `Content-Type: application/json`
5. Body (JSON):

```json
{
  "username": "adminuser",
  "email": "admin@coastalerosion.com",
  "password": "AdminPassword123"
}
```

6. Click Send

#### Option C: Using JavaScript Fetch (in Browser Console)

```javascript
fetch("http://localhost:5000/admin/create-admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "adminuser",
    email: "admin@coastalerosion.com",
    password: "AdminPassword123",
  }),
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

### Step 3: Login as Admin

1. Go to the login page
2. Enter the email and password you created
3. You will be automatically redirected to the **Admin Dashboard** (`/admin/data-upload`)

## Admin Features Available

### Dashboard Navigation

Once logged in as an admin, you'll have access to:

- **Data Upload**: Upload coastal monitoring data (GeoJSON, Shapefile, GeoTIFF, CSV)
- **User Management**: View all users and manage their roles

### User Management Capabilities

- View all registered users
- See user roles (admin/user)
- Check verification status
- Edit user roles
- (More features coming soon)

## Important Notes

- The first admin account creation endpoint (`/admin/create-admin`) can only be used **once**
- After the first admin is created, only existing admins can promote other users to admin role through the User Management interface
- Admin accounts are created with `verified: true` status by default
- All admin actions are protected with JWT token verification

## Troubleshooting

### Admin account creation fails with "Admin account already exists"

This means an admin account has already been created. If you need to create another admin:

1. Login with an existing admin account
2. Go to User Management
3. Find the user you want to promote
4. Click Edit and change role to "admin"

### Getting "Access denied" error

This usually means:

- You're not logged in as an admin
- Your token has expired (login again)
- The endpoint requires admin privileges

### Users table doesn't exist

Make sure your database is properly set up with the users table. The table structure should include:

- `id`: UUID or integer primary key
- `username`: string (unique)
- `email`: string (unique)
- `password_hash`: string
- `fullname`: string
- `roles`: string (default: 'user')
- `verified`: boolean (default: false)
- `verification_code`: string
- `password_reset_code`: string
- `password_reset_expiry`: timestamp
- `created_at`: timestamp
