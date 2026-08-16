# 🚀 Organic Mind - Setup Guide

> Complete step-by-step instructions for setting up Organic Mind on Windows and Linux.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Download Link |
|-------------|---------|---------------|
| **Python** | 3.10+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 18.x+ | [nodejs.org](https://nodejs.org/) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |
| **npm** | 9.x+ | (Comes with Node.js) |

### Verify Installations

```bash
python --version    # Should show Python 3.10 or higher
node --version      # Should show v18.x or higher
npm --version       # Should show 9.x or higher
git --version       # Should show git version
```

---

## 🐧 Linux Setup

### Step 1: Clone the Repository

```bash
cd ~
git clone https://github.com/biswas445/Django-Project.git organic-mind
cd organic-mind
```

### Step 2: Set Up Python Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate
```

### Step 3: Install Backend Dependencies

```bash
# Navigate to backend directory (if structure requires)
# cd organic_mind_backend  # Uncomment if backend is in subfolder

# Install Django and dependencies
pip install django
pip install djangorestframework
pip install django-cors-headers
```

### Step 4: Configure Database

```bash
# Apply migrations
python manage.py migrate

# Create superuser (optional, for admin access)
python manage.py createsuperuser
```

### Step 5: Start Backend Server

```bash
python manage.py runserver
```

✅ Backend should now be running at `http://127.0.0.1:8000`

### Step 6: Install Frontend Dependencies (New Terminal)

Open a **new terminal window** and run:

```bash
cd ~/organic-mind

# Install npm packages
npm install
```

### Step 7: Start Frontend Development Server

```bash
npm run dev
```

✅ Frontend should now be running at `http://localhost:5173`

---

## 🪟 Windows Setup

### Step 1: Clone the Repository

**Using Git Bash:**
```bash
cd C:\Users\YourUsername
git clone https://github.com/biswas445/Django-Project.git organic-mind
cd organic-mind
```

**Or using GitHub Desktop:**
1. Open GitHub Desktop
2. Click "Clone a repository"
3. Select `biswas445/Django-Project`
4. Choose local path: `C:\Users\YourUsername\organic-mind`

### Step 2: Set Up Python Virtual Environment

**Command Prompt or PowerShell:**
```cmd
cd C:\Users\YourUsername\organic-mind

# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate
```

*You should see `(venv)` prefix in your terminal.*

### Step 3: Install Backend Dependencies

```cmd
# Install Django and dependencies
pip install django
pip install djangorestframework
pip install django-cors-headers
```

### Step 4: Configure Database

```cmd
# Apply migrations
python manage.py migrate

# Create superuser (optional)
python manage.py createsuperuser
```

Follow the prompts to set username, email, and password.

### Step 5: Start Backend Server

```cmd
python manage.py runserver
```

✅ Backend should now be running at `http://127.0.0.1:8000`

Keep this terminal window open.

### Step 6: Install Frontend Dependencies (New Terminal)

Open a **new Command Prompt or PowerShell window**:

```cmd
cd C:\Users\YourUsername\organic-mind

# Install npm packages
npm install
```

*This may take 2-5 minutes depending on your internet speed.*

### Step 7: Start Frontend Development Server

```cmd
npm run dev
```

✅ Frontend should now be running at `http://localhost:5173`

---

## 🌐 Access the Application

1. Open your web browser (Chrome, Firefox, Edge recommended)
2. Navigate to: **`http://localhost:5173`**
3. You should see the Organic Mind landing page!

---

## 🔧 Troubleshooting

### ❌ Port Already in Use

**Error:** `Error: That port is already in use.`

**Solution (Linux/Mac):**
```bash
# Find process using port 8000
lsof -i :8000

# Kill the process (replace PID with actual number)
kill -9 <PID>
```

**Solution (Windows):**
```cmd
# Find process using port 8000
netstat -ano | findstr :8000

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F
```

Then restart the server on a different port:
```bash
python manage.py runserver 8001
```

---

### ❌ npm Install Fails

**Error:** `npm ERR! code ENOENT` or `npm ERR! network timeout`

**Solutions:**

1. **Clear npm cache:**
   ```bash
   npm cache clean --force
   npm install
   ```

2. **Use npm mirror (if in region with slow access):**
   ```bash
   npm config set registry https://registry.npmmirror.com
   npm install
   ```

3. **Delete node_modules and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

---

### ❌ Database Migration Errors

**Error:** `django.core.exceptions.ImproperlyConfigured`

**Solutions:**

1. **Ensure virtual environment is activated:**
   ```bash
   # Linux/Mac
   source venv/bin/activate
   
   # Windows
   venv\Scripts\activate
   ```

2. **Reapply migrations:**
   ```bash
   python manage.py migrate --run-syncdb
   ```

3. **Delete database and recreate (development only):**
   ```bash
   rm db.sqlite3
   python manage.py migrate
   ```

---

### ❌ CORS Errors in Browser Console

**Error:** `Access to fetch at ... has been blocked by CORS policy`

**Solution:**

Ensure backend is running on `http://127.0.0.1:8000` and frontend on `http://localhost:5173`.

Check `organic_mind_backend/settings.py`:

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
```

Restart backend after changes.

---

### ❌ Module Not Found Errors

**Error:** `ModuleNotFoundError: No module named 'rest_framework'`

**Solution:**

Ensure you're installing packages in the activated virtual environment:

```bash
# Check if venv is active (should see prefix)
which python  # Linux/Mac
where python  # Windows

# Reinstall requirements
pip install -r requirements.txt  # If file exists
# OR
pip install django djangorestframework django-cors-headers
```

---

### ❌ TypeScript Errors

**Error:** `Cannot find module ...`

**Solution:**

```bash
# Clear and reinstall
rm -rf node_modules
npm install
npm run typecheck
```

---

## 🧹 Clean Shutdown

When you're done working:

1. **Stop Frontend:** Press `Ctrl + C` in the frontend terminal
2. **Stop Backend:** Press `Ctrl + C` in the backend terminal
3. **Deactivate Virtual Environment:**
   ```bash
   deactivate  # Only if venv was activated
   ```

---

## 🔄 Daily Development Workflow

### Starting Your Work Session

```bash
# Terminal 1 - Backend
cd organic-mind
source venv/bin/activate  # Linux/Mac
# OR
venv\Scripts\activate     # Windows
python manage.py runserver

# Terminal 2 - Frontend
cd organic-mind
npm run dev
```

### Ending Your Work Session

```bash
# Press Ctrl+C in both terminals
deactivate  # Optional: deactivate venv
```

---

## 📦 Production Build (Optional)

For deployment to production:

### Frontend Build

```bash
npm run build
# Output: dist/ folder with optimized assets
```

### Backend Collection

```bash
python manage.py collectstatic
# Collects static files for production serving
```

### Production Server

Use a production-ready WSGI server like Gunicorn:

```bash
pip install gunicorn
gunicorn organic_mind_backend.wsgi:application
```

---

## 🆘 Need Help?

If you encounter issues not covered here:

1. **Check existing issues:** [GitHub Issues](https://github.com/biswas445/Django-Project/issues)
2. **Review error logs:** Check terminal output for detailed error messages
3. **Verify versions:** Ensure Python 3.10+ and Node 18+ are installed
4. **Clean reinstall:** Delete `venv`, `node_modules`, and `db.sqlite3`, then start fresh

---

<div align="center">

**Happy Coding! 🎉**

Built with ❤️ by Biswas

</div>
