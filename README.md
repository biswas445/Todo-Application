# Organic Mind

A modern, full-stack productivity platform built with Django and React.

## Requirements

- Python 3.10+
- Node.js 18+
- npm or yarn

## Features

- **Task Management**: Create, edit, complete, and organize tasks with subtasks, lists, and tags
- **Calendar**: Day, week, and month views with event scheduling and task visualization
- **Sticky Notes**: Color-coded notes with rich content support
- **Search & Filters**: Global search with filtering by status, list, tag, and date
- **User Settings**: Profile customization, timezone, date/time formats, and notifications
- **Security**: User isolation, token authentication, and server-side validation

## Setup Instructions

### Step 1: Clone the Project
Open your terminal and run:
```bash
git clone https://github.com/biswas445/Todo-Application.git
cd Todo-Application
```

### Set Up Backend (Django)

**Backend:**
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Linux/macOS

**Backend:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Frontend (new terminal):**
```bash
cd src
npm install
npm run dev
```

## Access

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api
- Admin Panel: http://localhost:8000/admin

## License

MIT License
