# 🚀 Organic Mind - Setup Guide

Complete setup instructions for Windows and Linux environments.

---

## 📋 Prerequisites

Before starting, ensure you have the following installed:

### Required Software

| Software | Version | Download Link |
|----------|---------|---------------|
| **Python** | 3.10 or higher | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 18 or higher | [nodejs.org](https://nodejs.org/) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

### Verify Installations

Open your terminal/command prompt and run:

```bash
python --version    # Should show Python 3.10+
node --version      # Should show v18+
npm --version       # Should show npm 8+
git --version       # Should show git version
```

---

## 🪟 Windows Setup

### Step 1: Clone the Repository

```bash
# Open Command Prompt or PowerShell
cd C:\Projects  # Or your preferred development folder
git clone https://github.com/biswas445/Django-Project.git
cd Django-Project
```

### Step 2: Setup Backend (Django)

#### 2.1 Create Virtual Environment

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate
```

You should see `(venv)` prefix in your command prompt.

#### 2.2 Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

If `requirements.txt` doesn't exist, install manually:

```bash
pip install django djangorestframework django-cors-headers
```

#### 2.3 Run Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

#### 2.4 Create Superuser (Optional - for Admin Panel)

```bash
python manage.py createsuperuser
```

Follow the prompts to set username, email, and password.

#### 2.5 Start Backend Server

```bash
python manage.py runserver
```

✅ Backend is now running at: **http://localhost:8000**

> **Keep this terminal open** while working on the frontend.

---

### Step 3: Setup Frontend (React + Vite)

#### 3.1 Open New Terminal

Open a **new** Command Prompt or PowerShell window (keep backend running).

```bash
# Navigate to frontend directory
cd C:\Projects\Django-Project\frontend
```

#### 3.2 Install Dependencies

```bash
npm install
```

This may take a few minutes. Be patient.

#### 3.3 Start Development Server

```bash
npm run dev
```

✅ Frontend is now running at: **http://localhost:5173**

---

### Step 4: Access the Application

Open your browser and visit:

- **Frontend App**: http://localhost:5173
- **Backend API**: http://localhost:8000/api
- **Admin Panel**: http://localhost:8000/admin (if you created superuser)

---

## 🐧 Linux Setup

### Step 1: Clone the Repository

```bash
# Open Terminal
cd ~/projects  # Or your preferred development folder
git clone https://github.com/biswas445/Django-Project.git
cd Django-Project
```

### Step 2: Setup Backend (Django)

#### 2.1 Create Virtual Environment

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate
```

You should see `(venv)` prefix in your terminal.

#### 2.2 Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

If `requirements.txt` doesn't exist, install manually:

```bash
pip install django djangorestframework django-cors-headers
```

#### 2.3 Run Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

#### 2.4 Create Superuser (Optional - for Admin Panel)

```bash
python manage.py createsuperuser
```

Follow the prompts to set username, email, and password.

#### 2.5 Start Backend Server

```bash
python manage.py runserver
```

✅ Backend is now running at: **http://localhost:8000**

> **Keep this terminal open** while working on the frontend.

---

### Step 3: Setup Frontend (React + Vite)

#### 3.1 Open New Terminal

Open a **new** terminal window (keep backend running).

```bash
# Navigate to frontend directory
cd ~/projects/Django-Project/frontend
```

#### 3.2 Install Dependencies

```bash
npm install
```

This may take a few minutes. Be patient.

#### 3.3 Start Development Server

```bash
npm run dev
```

✅ Frontend is now running at: **http://localhost:5173**

---

### Step 4: Access the Application

Open your browser and visit:

- **Frontend App**: http://localhost:5173
- **Backend API**: http://localhost:8000/api
- **Admin Panel**: http://localhost:8000/admin (if you created superuser)

---

## 🧪 Verify Installation

### Backend Tests

```bash
# In backend terminal (with venv activated)
python manage.py test
```

Expected output: `94 tests passed, 0 failures`

### Frontend Build

```bash
# In frontend directory
npm run build
npm run typecheck
npm run lint
```

All commands should complete without errors.

---

## 🔧 Common Issues & Solutions

### Issue: Port Already in Use

**Error**: `Address already in use` or `Port 8000 is already in use`

**Solution**:

```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID_NUMBER> /F

# Linux
lsof -i :8000
kill -9 <PID_NUMBER>
```

Or use a different port:

```bash
python manage.py runserver 8001
```

Then update frontend API configuration to use port 8001.

---

### Issue: Module Not Found (Python)

**Error**: `ModuleNotFoundError: No module named 'rest_framework'`

**Solution**:

```bash
# Ensure virtual environment is activated
# Then reinstall dependencies
pip install -r requirements.txt
```

---

### Issue: npm Install Fails

**Error**: Various npm installation errors

**Solution**:

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json  # Linux/Mac
rmdir /s /q node_modules & del package-lock.json  # Windows

# Reinstall
npm install
```

---

### Issue: Database Migration Errors

**Error**: `Migration ... applied before` or database locked

**Solution**:

```bash
# Delete database file (development only!)
rm db.sqlite3  # Linux/Mac
del db.sqlite3  # Windows

# Recreate migrations
python manage.py makemigrations
python manage.py migrate
```

> ⚠️ **Warning**: This deletes all local data. Only do this in development.

---

### Issue: CORS Errors in Browser Console

**Error**: `Access to fetch at ... has been blocked by CORS policy`

**Solution**:

Ensure backend `settings.py` has:

```python
INSTALLED_APPS = [
    ...
    'corsheaders',
    ...
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    ...
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]
```

---

### Issue: Frontend Can't Connect to Backend

**Error**: Network errors when calling API

**Solution**:

1. Verify backend is running (`http://localhost:8000/api`)
2. Check frontend API base URL configuration
3. Ensure CORS is properly configured (see above)
4. Check browser console for specific error messages

---

## 📦 Production Build

### Frontend Production Build

```bash
cd frontend
npm run build
```

Output will be in `frontend/dist/` directory.

### Backend Production Settings

For production deployment:

1. Set `DEBUG = False` in `settings.py`
2. Configure proper `ALLOWED_HOSTS`
3. Use PostgreSQL instead of SQLite
4. Set up static file serving
5. Configure proper secret key management

---

## 🔄 Updating the Project

If you pull updates from repository:

### Backend

```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python manage.py migrate
```

### Frontend

```bash
cd frontend
npm install
```

---

## 🆘 Getting Help

If you encounter issues not listed here:

1. Check the main [README.md](./README.md) for general information
2. Review error messages carefully
3. Check browser console (F12) for frontend errors
4. Check backend terminal for server errors
5. Search GitHub Issues for similar problems
6. Create a new issue with detailed error information

---

## ✅ Quick Reference

| Task | Command |
|------|---------|
| **Start Backend** | `cd backend && source venv/bin/activate && python manage.py runserver` |
| **Start Frontend** | `cd frontend && npm run dev` |
| **Run Backend Tests** | `cd backend && python manage.py test` |
| **Build Frontend** | `cd frontend && npm run build` |
| **Create Migration** | `cd backend && python manage.py makemigrations` |
| **Apply Migration** | `cd backend && python manage.py migrate` |
| **Create Superuser** | `cd backend && python manage.py createsuperuser` |

---

<div align="center">

**Happy Coding! 🎉**

Need help? Check [README.md](./README.md) or open an issue on GitHub.

</div>
