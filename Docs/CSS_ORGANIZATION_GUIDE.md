# CSS Organization Structure

The `style.css` file has been reorganized into modular CSS files based on functionality. This improves maintainability, scalability, and makes it easier to find and update styles.

## File Structure

```
frontend/src/pages/
├── styles/
│   ├── variables.css         # CSS variables and theming
│   ├── globals.css           # Global styles (body, h1-h3, etc.)
│   ├── navbar.css            # Navbar and profile dropdown
│   ├── forms.css             # Form inputs, buttons, validation
│   ├── sidebar.css           # User navigation sidebar
│   ├── admin-sidebar.css     # Admin sidebar and controls
│   ├── footer.css            # Footer component
│   ├── index.css             # Landing/index page styles
│   ├── map.css               # Map page styles
│   └── layout.css            # Layout containers
├── index-organized.css       # Main entry point (imports all)
└── style.css                 # Original (can be deprecated)
```

## CSS File Organization

### 1. **variables.css** (16 lines)

- CSS custom properties (--primary, --secondary, colors, etc.)
- Central theming location
- Easy to modify brand colors globally

### 2. **globals.css** (12 lines)

- Base styles: `body`, font families, headings
- Global resets and baseline styling

### 3. **navbar.css** (231 lines)

- Main navbar `.navbar` and `.main-navbar`
- Navigation buttons
- Profile dropdown menu
- All navbar-related components

### 4. **forms.css** (367 lines)

- Form containers and inputs
- Form buttons and links
- Password field with toggle
- Validation messages (error, success)
- Verification components
- Form helpers

### 5. **sidebar.css** (166 lines)

- User navigation sidebar `.map-sidebar`
- Sidebar items and sections
- Sidebar footer
- Expansion/collapse animations

### 6. **admin-sidebar.css** (175 lines)

- Admin sidebar `.admin-sidebar`
- Admin controls section
- Admin-specific styling and colors

### 7. **footer.css** (186 lines)

- Footer structure
- Footer branding and data sources
- Footer links
- Responsive footer

### 8. **index.css** (133 lines)

- Landing page sections
- Core features cards
- About section
- Hero section (IndexBG)

### 9. **map.css** (59 lines)

- Map page layout
- Satellite toggle button
- Leaflet map customizations

### 10. **layout.css** (35 lines)

- Main layout container
- Content wrapper
- Fade-in animations with keyframes

### 11. **index-organized.css** (Main entry point)

- Single file that imports all organized CSS
- Use this instead of `style.css`

## How to Use

### Update Component Imports

Replace old imports:

```javascript
import "../style.css";
```

With the new organized import:

```javascript
import "../index-organized.css";
```

### Where to Add New Styles

1. **Component styling** → Check which component file it belongs to
2. **Navbar changes** → Add to `navbar.css`
3. **Form validation** → Add to `forms.css`
4. **New admin features** → Add to `admin-sidebar.css`
5. **Page-specific** → Add to appropriate page file (`index.css`, `map.css`)
6. **Layout/container** → Add to `layout.css`
7. **Global/utility** → Add to `globals.css`

## Benefits

✅ **Better Maintainability** - Find styles by component name
✅ **Easier Debugging** - Reduced file size, faster search
✅ **Team Collaboration** - Clear organization for multiple developers
✅ **Scalability** - Easy to add new feature CSS files
✅ **Performance** - Modular approach allows for future optimization
✅ **Central Theming** - All colors in one place (variables.css)

## Size Overview

| File              | Lines      | Purpose          |
| ----------------- | ---------- | ---------------- |
| variables.css     | 16         | Theming          |
| globals.css       | 12         | Global resets    |
| navbar.css        | 231        | Navigation       |
| forms.css         | 367        | Forms & inputs   |
| sidebar.css       | 166        | User sidebar     |
| admin-sidebar.css | 175        | Admin controls   |
| footer.css        | 186        | Footer           |
| index.css         | 133        | Landing page     |
| map.css           | 59         | Map features     |
| layout.css        | 35         | Layout           |
| **Total**         | **~1,380** | Organized styles |

## Migration Notes

- `style.css` can be kept as backup or removed after verification
- All JSX files should be updated to import `index-organized.css`
- The original `style.css` is still present and functional
- All selectors remain unchanged - no CSS refactoring, just reorganization

## Future Improvements

Consider creating additional files as the project grows:

- `admin/dashboard.css` - Admin dashboard specific
- `admin/data-upload.css` - Data upload page
- `admin/user-management.css` - User management page
- `components/modal.css` - Modal styles
- `responsive.css` - All media queries (for optimization)

---

**Last Updated**: March 28, 2026
**Total Styles Organized**: 1,380+ lines across 10 functional areas
