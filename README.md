# 🧠 Organic Mind

> **A Modern, Full-Stack Productivity Platform**  
> *Organize your thoughts, tasks, and life in one beautiful interface.*

---

## ✨ Features

### 📋 Task Management
- **Smart Organization**: Create tasks with titles, descriptions, priorities, and due dates
- **Subtasks**: Break down complex tasks into manageable steps with progress tracking
- **Lists & Tags**: Categorize tasks with custom lists and color-coded tags
- **Quick Actions**: Complete, edit, or delete tasks with intuitive interactions

### 📅 Calendar Integration
- **Multiple Views**: Day, Week, and Month calendar views
- **Event Management**: Schedule events with start/end times and colors
- **Task Visualization**: See tasks with due dates alongside calendar events
- **Timezone Support**: Works seamlessly across different timezones

### 📝 Sticky Wall
- **Visual Notes**: Create colorful sticky notes for quick ideas and reminders
- **Rich Content**: Support for long-form notes with detail views
- **Grid Layout**: Beautiful masonry-style arrangement

### 🔍 Search & Filtering
- **Global Search**: Find tasks by title, description, or associated tags
- **Smart Filters**: Filter by completion status, lists, tags, and dates
- **Today & Upcoming**: Automatically organized views for immediate focus

### ⚙️ User Settings
- **Profile Customization**: Display name, bio, and timezone settings
- **Preferences**: Date format (DD/MM/YYYY, MM/DD/YYYY), 12/24-hour time, week start day
- **Notifications**: Configure push notifications and task reminders
- **Security**: Change password with validation

### 🔐 Security & Privacy
- **User Isolation**: Complete data separation between users
- **Token Authentication**: Secure session management
- **Data Validation**: Server-side enforcement of all limits and rules
- **No Data Leakage**: Rigorous ownership checks on all operations

---

## 🛠️ Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for blazing-fast builds
- **CSS3** with custom design system
- **Local State Management** with centralized store architecture

### Backend
- **Django 5.x** with Python
- **Django REST Framework** for API
- **SQLite3** database (development)
- **Token Authentication**

### Architecture
- **RESTful API** design
- **Centralized State** pattern
- **Type-Safe** data mapping
- **Responsive** mobile-first design

---

## 📊 Project Status

| Component | Status | Tests |
|-----------|--------|-------|
| Authentication | ✅ Complete | 6/6 Pass |
| Profile & Settings | ✅ Complete | 15/15 Pass |
| Lists | ✅ Complete | 8/8 Pass |
| Tags | ✅ Complete | 8/8 Pass |
| Tasks | ✅ Complete | 13/13 Pass |
| Subtasks | ✅ Complete | 7/7 Pass |
| Calendar Events | ✅ Complete | 10/10 Pass |
| Sticky Notes | ✅ Complete | 7/7 Pass |
| Search & Filters | ✅ Complete | 8/8 Pass |
| Security/Ownership | ✅ Complete | 6/6 Pass |

**Total Backend Tests**: 94/94 Passing ✅  
**Frontend Build**: ✅ Passing  
**TypeCheck**: ✅ Passing  
**Lint**: ✅ Passing  

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/biswas445/Django-Project.git
cd Django-Project

# Setup backend (see SETUP.md for details)
python manage.py migrate
python manage.py runserver

# Setup frontend (in new terminal)
cd frontend
npm install
npm run dev
```

### Access
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000/api
- **Admin Panel**: http://localhost:8000/admin

---

## 📁 Project Structure

```
Django-Project/
├── backend/
│   ├── organic_mind_backend/    # Django project settings
│   ├── api/                     # Main application app
│   │   ├── models.py           # Database models
│   │   ├── serializers.py      # API serializers
│   │   ├── views.py            # API viewsets
│   │   ├── urls.py             # URL routing
│   │   └── tests.py            # Comprehensive test suite
│   ├── manage.py               # Django management script
│   └── db.sqlite3              # SQLite database (ignored in git)
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── store/              # State management
│   │   ├── services/           # API service layer
│   │   ├── types/              # TypeScript definitions
│   │   ├── utils/              # Helper functions
│   │   └── App.tsx             # Main application
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
├── README.md
└── SETUP.md
```

---

## 🔑 Key Design Principles

### 🎨 UI/UX
- **Frozen Design**: Consistent visual language throughout
- **Light Theme Only**: Clean, focused interface
- **Responsive**: Works on desktop, tablet, and mobile
- **Accessible**: Keyboard navigation and focus states

### 🏗️ Architecture
- **Single Source of Truth**: Database is authoritative
- **Centralized State**: One store for all frontend data
- **Type Safety**: Full TypeScript coverage
- **API Mapping**: Clean snake_case ↔ camelCase conversion

### 🔒 Security
- **User Ownership**: All queries filtered by user
- **Token Auth**: Secure session management
- **Validation**: Both client and server-side
- **No Secrets**: Environment variables properly ignored

---

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register/` - Create account
- `POST /api/auth/login/` - Login
- `POST /api/auth/logout/` - Logout
- `GET /api/auth/me/` - Get current user

### Resources
- `GET/POST /api/tasks/` - List/Create tasks
- `GET/POST /api/lists/` - List/Create lists
- `GET/POST /api/tags/` - List/Create tags
- `GET/POST /api/notes/` - List/Create notes
- `GET/POST /api/calendar-events/` - List/Create events
- `GET/POST /api/subtasks/` - List/Create subtasks

### User Profile
- `GET /api/user/me/` - Get profile
- `PATCH /api/user/update_profile/` - Update settings
- `POST /api/user/change_password/` - Change password

---

## 🧪 Testing

### Backend Tests
```bash
python manage.py test          # Run all tests
python manage.py test api.tests.AuthenticationTests  # Specific test class
python manage.py test --verbosity=2  # Detailed output
```

### Frontend Tests
```bash
npm run build      # Production build
npm run typecheck  # TypeScript validation
npm run lint       # Code style check
```

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 👥 Credits

**Developer**: Biswas  
**Version**: 1.0.0  
**Release Date**: 2024  

---

## 🆘 Support

For setup issues, see [SETUP.md](./SETUP.md)  
For bugs or feature requests, please open an issue on GitHub.

---

<div align="center">

**Built with ❤️ using Django + React**

[Report Bug](https://github.com/biswas445/Django-Project/issues) · [Request Feature](https://github.com/biswas445/Django-Project/issues)

</div>
