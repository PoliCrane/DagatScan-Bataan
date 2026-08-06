# Admin Quick Reference Guide

## Getting Started as an Admin

### 1. First-Time Admin Setup

Run this command to create the first admin account:

```bash
curl -X POST http://localhost:5000/admin/create-admin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "email": "your_email@example.com",
    "password": "your_secure_password"
  }'
```

Expected response:

```json
{
  "message": "Admin account created successfully",
  "admin": {
    "id": 1,
    "username": "your_username",
    "email": "your_email@example.com",
    "fullname": "Your Name",
    "roles": "admin"
  }
}
```

### 2. Logging In

1. Navigate to the login page
2. Enter your admin email and password
3. Click "Login"
4. You'll be automatically redirected to the Admin Dashboard

## Admin Dashboard Features

### Data Upload (`/admin/data-upload`)

- **Purpose**: Upload geospatial and monitoring data
- **Supported formats**:
  - 🗺️ GeoJSON (.geojson, .json) - Vector data
  - 📦 Shapefile (.zip containing .shp, .shx, .dbf) - Vector data
  - 🛰️ GeoTIFF (.tif, .tiff) - Raster data
  - 📊 CSV (.csv) - Tabular data with coordinates

**Coming Soon**:

- Drag-and-drop interface
- File validation
- Upload progress tracking
- Batch import capabilities

### User Management (`/admin/user-management`)

- **View All Users**: See a complete list of all registered users
- **User Information**: Username, Email, Full Name, Role, Verification Status
- **User Status**:
  - ✅ Verified (email confirmed)
  - ⚠️ Unverified (pending email verification)
- **User Roles**:
  - 👤 User (regular user access)
  - 👨‍💼 Admin (administrative access)

**Features**:

- Edit user roles (promote/demote)
- Track user registration dates
- Monitor verification status

**Coming Soon**:

- Delete user accounts
- Search and filter users
- Bulk user management
- User activity logs
- Suspend/activate accounts

## Common Admin Tasks

### Promote a User to Admin

1. Go to **User Management**
2. Find the user in the table
3. Click the **Edit** button
4. Change role from "user" to "admin"
5. Click Save

### View All System Users

1. Navigate to **User Management**
2. View the complete user table
3. Check verification status for each user
4. See user registration dates

### Upload Monitoring Data

1. Go to **Data Upload**
2. Drop files in the upload area or click to browse
3. Select supported file formats
4. Review file information
5. Click Upload
6. Track upload progress

## Sidebar Navigation

The admin sidebar appears on the left side of the screen:

**Compact View** (default):

- Shows only icons
- Hover to reveal full menu labels
- Background color: Light blue (#eaf4f8)

**Expanded View** (on hover):

- Full menu labels visible
- Shows "Admin Controls" title
- Quick navigation to all admin pages

### Sidebar Options:

- 📤 **Data Upload** - Manage spatial datasets
- 👥 **User Management** - Administer user accounts

## API Reference for Developers

### Authentication

All admin endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Get All Users

```
GET /admin/users
Authorization: Bearer <token>

Response: Array of user objects
```

### Update User Role

```
PUT /admin/users/:userId/role
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "roles": "admin" // or "user"
}
```

## Troubleshooting

### "Admin account already exists"

- First admin account has already been created
- Use User Management to promote other users to admin

### "Access denied" Error

- Your account is not an admin
- Try logging out and logging back in
- Check that your token is valid

### User table not loading

- Make sure backend server is running
- Check your internet connection
- Verify you're logged in as admin
- Check browser console for error messages

### Upload not working

- Check supported file formats
- Verify file is not corrupted
- Ensure file size is within limits
- Try a different file format

## Tips & Best Practices

✅ **DO:**

- Regularly review user management
- Keep admin credentials secure
- Monitor file uploads for suspicious activity
- Test with sample data first

❌ **DON'T:**

- Share admin credentials
- Upload unverified data sources
- Delete user accounts without backup
- Promote every user to admin

## System Requirements

- Backend running on: `http://localhost:5000`
- Frontend running on: `http://localhost:5173`
- PostgreSQL database with users table
- Modern web browser (Chrome, Firefox, Safari, Edge)

## Support & Documentation

For more detailed information:

- 📘 See `ADMIN_SETUP.md` for setup instructions
- 📋 See `ADMIN_IMPLEMENTATION.md` for technical details
- 🐛 Check browser console for error messages and debugging

---

**Last Updated**: March 27, 2026
**Admin System Version**: 1.0
