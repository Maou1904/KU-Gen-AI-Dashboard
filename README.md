# KU Gen-AI Dashboard

A modern, responsive analytics dashboard built with **HTML**, **JavaScript**, and **Tailwind CSS**.

## 📁 Project Structure

```
public/
├── index.html          # Main HTML entry point
├── js/
│   ├── app.js          # Main app logic & routing
│   ├── mock-data.js    # Mock data generators
│   └── charts.js       # Chart.js wrapper functions
package.json            # Project dependencies
README.md               # This file
```

## 🎨 Features

- **Multi-page Dashboard** with client-side routing (hash-based)
- **Real-time Charts** using Chart.js (Bar, Line, Doughnut)
- **Responsive Design** with Tailwind CSS
- **Material Design Icons** for UI elements
- **Glass-morphism UI** with modern styling
- **Mock Data** built-in for testing

## 📊 Pages

1. **Dashboard Overview** - System metrics & trending topics
2. **API Management** - Token consumption & cost breakdown
3. **Department Analytics** - Faculty & department insights
4. **User Behavior** - User activity & app distribution
5. **Settings** - Configuration (placeholder)

## 🚀 Quick Start

### Using Node.js (Recommended)

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open in browser:
```
http://localhost:8080
```

### Using Python

1. Navigate to project directory:
```bash
cd e:\WORK\Comsci\Coop\KU-Gen-AI-Dashboard
```

2. Start Python HTTP server:
```bash
python -m http.server 8080 --directory public
```

3. Open in browser:
```
http://localhost:8080
```

### Using Live Server (VS Code Extension)

1. Install "Live Server" extension
2. Right-click `public/index.html`
3. Select "Open with Live Server"

## 🛠️ Technology Stack

- **Frontend Framework**: Vanilla JavaScript (No framework overhead)
- **CSS Framework**: Tailwind CSS (CDN)
- **Charts**: Chart.js 4.4.0
- **Icons**: Material Symbols (Google Fonts)
- **Server**: http-server (Node.js) or Python

## 📝 Usage

### Navigation
- Click sidebar menu items to navigate between pages
- URLs use hash routing (e.g., `#/api`, `#/department`)

### Charts
- All charts are interactive with hover tooltips
- Built with Chart.js for high performance
- Responsive and mobile-friendly

### Mock Data
- All data is generated from `js/mock-data.js`
- Easy to swap with real API data
- Data structure is consistent across pages

## 🔧 Customization

### Change Theme Colors
Edit the Tailwind config in `public/index.html`:
```javascript
colors: {
    "primary": "#0d631b",
    "secondary": "#556158",
    // ... more colors
}
```

### Add New Page
1. Create a new route in `App.render()` method
2. Create page HTML generator method (e.g., `createNewPage()`)
3. Add navigation link in sidebar
4. Initialize charts if needed

### Replace Mock Data
1. Update `js/mock-data.js` with real API calls
2. Update data fetching in `App.js` methods
3. No need to change UI - same data structure

## 📱 Responsive Design

- Sidebar (fixed width: 256px)
- Main content area auto-adjusts
- Grid layout (12 columns) for bento design
- Mobile-ready (collapse sidebar on small screens)

## 🎯 Future Enhancements

- [ ] Database integration
- [ ] User authentication
- [ ] Real-time data updates
- [ ] Export to PDF/CSV
- [ ] Dark mode toggle
- [ ] Custom date range filtering
- [ ] Advanced charting options

## 📄 License

Created for KU Gen-AI Project

## 👤 Author

KU Gen-AI Development Team
