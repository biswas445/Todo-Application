# 🧠 Organic Mind

> **A Modern, Full-Stack Productivity Suite for Task Management, Planning, and Organization**

![Status](https://img.shields.io/badge/status-production%20ready-success)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### 📋 Task Management
- Create, edit, and organize tasks with rich details
- Subtask support with progress tracking
- Priority levels and due dates
- Smart filtering (Today, Upcoming, This Week)

### 🏷️ Organization
- Custom Lists for categorization (Personal, Work, etc.)
- Tags with color coding for flexible grouping
- Advanced search across titles, descriptions, and metadata

### 📅 Calendar Integration
- Day, Week, and Month views
- Visual scheduling for tasks and events
- Timezone-aware event planning
- Drag-and-drop simplicity

### 📝 Sticky Notes
- Color-coded sticky notes wall
- Quick capture for ideas and reminders
- Organized grid layout

### ⚙️ User Preferences
- Customizable date formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
- 12-hour / 24-hour time formats
- Week start preference (Monday / Sunday)
- Timezone support for global teams

### 🔒 Security & Privacy
- Secure token-based authentication
- Multi-user isolation (your data is yours alone)
- Server-side validation and ownership enforcement
- No data leakage between accounts

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS |
| **State** | Centralized Store (Zustand-like) |
| **Backend** | Django 5 + Django REST Framework |
| **Database** | SQLite3 (Development) |
| **Auth** | DRF Token Authentication |

---

## 🚀 Quick Start

```bash
# Backend Setup
cd organic_mind_backend
python manage.py migrate
python manage.py runserver

# Frontend Setup (new terminal)
npm install
npm run dev
```

👉 **Detailed setup instructions:** See [SETUP.md](./SETUP.md)

---

## 📂 Project Structure

```
organic-mind/
├── src/                      # React Frontend Source
│   ├── components/           # Reusable UI Components
│   ├── pages/                # Page Views (Today, Calendar, etc.)
│   ├── store/                # State Management
│   ├── services/             # API Service Layer
│   └── types/                # TypeScript Definitions
├── organic_mind_backend/     # Django Backend
│   ├── api/                  # API App (Models, Serializers, Views)
│   └── settings.py           # Django Configuration
├── db.sqlite3                # Development Database
└── README.md                 # This File
```

---

## 🧪 Testing

### Backend Tests
```bash
python manage.py test
# 94/94 tests passing ✅
```

### Frontend Checks
```bash
npm run build      # Production Build
npm run typecheck  # TypeScript Validation
npm run lint       # Code Quality
```

---

## 📸 Screenshots

*(Coming Soon - Add screenshots of Dashboard, Calendar, and Sticky Wall)*

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👤 Author

**Biswas**  
[GitHub](https://github.com/biswas445) • [Project Repo](https://github.com/biswas445/Django-Project)

---

<div align="center">

**Made with ❤️ using React, Django, and TypeScript**

⭐ Star this repo if you find it helpful!

</div>
