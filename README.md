# Organic Mind

Organic Mind is a to-do and productivity web app. It helps you keep your tasks, notes, and events in one place. You can create tasks, break them into smaller steps, organize them with lists and tags, and see everything on a calendar. It sends you live notifications as things happen, and you can use it from any device with a web browser.

## Features

- **Task management** – create, organize, and complete tasks with subtasks, lists, and tags, plus search and filters.
- **Calendar** – see your tasks and events in day, week, or month views.
- **Sticky notes** – keep quick, color-coded notes on a wall.
- **Real-time notifications** – get instant updates across devices over WebSockets.
- **Accounts & settings** – secure sign-in with email verification, plus profile and preference controls.

## Requirements

Install these on your computer before you start:

- **Python 3.12 or newer** — [download](https://www.python.org/downloads/)
- **Node.js 18 or newer** (this also installs npm) — [download](https://nodejs.org/)
- **Git** — [download](https://git-scm.com/)

## Setup

Follow these steps in order. At the end you will have **two terminals running** — one for the backend and one for the frontend. Keep both open while you use the app.

### Step 1 — Get the code

Open a terminal (on Windows you can use **PowerShell** or **Command Prompt**) and run:

```bash
git clone https://github.com/biswas445/Todo-Application.git
cd Todo-Application
```

### Step 2 — Create the environment file

Make a copy of the example environment file.

- **Windows:** `copy .env.example .env`
- **macOS / Linux:** `cp .env.example .env`

The default values are enough for local development, so you do not need to change anything to get started.

### Step 3 — Start the backend (Django)

In your terminal, run these commands one by one.

**Windows**

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**macOS / Linux**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Leave this terminal running — this is your backend server.

### Step 4 — Start the frontend (React)

Open a **second** terminal in the same project folder and run:

```bash
npm install
npm run dev
```

Leave this terminal running too — this is your frontend server.

## URLs

Once both servers are running, open these in your browser:

| What | URL |
| --- | --- |
| Frontend (the app) | http://localhost:5173 |
| Backend API | http://localhost:8000/api |
| Health check | http://localhost:8000/api/health/ |
| Admin panel | http://localhost:8000/admin |
| WebSocket | ws://localhost:8000/ws/notifications/ |

## API Endpoints

All endpoints start with `http://localhost:8000/api`. Except for the auth and health endpoints, you must include your token in the request header as `Authorization: Token <your-token>`.

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health/` | Liveness probe (no auth needed) |

### Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/auth/register/` | Create an account (sends a verification email) |
| POST | `/auth/resend_verification/` | Resend the verification email |
| GET | `/auth/verify_email/` | Verify an email using the link token |
| POST | `/auth/login/` | Sign in and get a token |
| POST | `/auth/logout/` | Sign out |
| POST | `/auth/ws_ticket/` | Get a short-lived WebSocket ticket |

### User

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/user/me/` | Get the current user's profile |
| PATCH | `/user/update_profile/` | Update profile and settings |
| POST | `/user/change_password/` | Change password |
| DELETE | `/user/account/` | Delete the account (needs your password) |

### Lists, Tags, Notes, and Events

Each of these supports the same standard actions. Replace `<name>` with `lists`, `tags`, `notes`, or `events`.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/<name>/` | List all items |
| POST | `/<name>/` | Create an item |
| GET | `/<name>/{id}/` | Get one item |
| PUT / PATCH | `/<name>/{id}/` | Update an item |
| DELETE | `/<name>/{id}/` | Delete an item |

### Tasks

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/tasks/` | List tasks (supports filters below) |
| POST | `/tasks/` | Create a task |
| GET | `/tasks/{id}/` | Get one task |
| PUT / PATCH | `/tasks/{id}/` | Update a task |
| DELETE | `/tasks/{id}/` | Delete a task |
| POST | `/tasks/{id}/toggle/` | Toggle a task complete / incomplete |
| POST | `/tasks/{id}/add_subtask/` | Add a subtask |
| POST | `/tasks/{id}/subtasks/{subtask_id}/toggle/` | Toggle a subtask |
| DELETE | `/tasks/{id}/subtasks/{subtask_id}/` | Delete a subtask |
| PATCH / PUT | `/tasks/subtasks/{subtask_id}/update/` | Update a subtask |

**Task filters** — add these to `GET /tasks/`: `?completed=true|false`, `?list={id}`, `?tags={id}`, `?due_date=YYYY-MM-DD`, `?today=true`, `?upcoming=true`

### Notifications

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/notifications/` | List notifications |
| POST | `/notifications/` | Create a notification |
| PATCH | `/notifications/{id}/` | Mark a notification read / unread |
| POST | `/notifications/mark_all_read/` | Mark all as read |
| DELETE | `/notifications/clear/` | Clear all notifications |

## Project Structure

```
Todo-Application/
├── api/                        # Django app (backend logic)
│   ├── management/commands/    #   Custom commands (e.g. seed_e2e_user)
│   ├── migrations/             #   Database migrations
│   ├── admin.py                #   Django admin setup
│   ├── authentication.py       #   Expiring token authentication
│   ├── middleware.py           #   WebSocket ticket validation
│   ├── models.py               #   Data models
│   ├── serializers.py          #   DRF serializers
│   ├── signals.py              #   Notification signal handlers
│   ├── tests.py                #   Backend tests
│   ├── views.py                #   API viewsets
│   └── websocket.py            #   WebSocket consumer
├── organic_mind_backend/       # Django project config
│   ├── asgi.py                 #   ASGI entrypoint (HTTP + WebSocket)
│   ├── settings.py             #   Settings
│   ├── urls.py                 #   Root URL routing
│   └── wsgi.py                 #   WSGI entrypoint
├── src/                        # React frontend
│   ├── api/                    #   API client
│   ├── components/             #   UI views and components
│   ├── hooks/                  #   WebSocket hook
│   ├── store/                  #   App state
│   ├── types/                  #   TypeScript types
│   ├── utils/                  #   Helpers
│   ├── __tests__/              #   Frontend tests
│   ├── App.tsx                 #   Root component
│   ├── main.tsx                #   Entry point
│   └── index.css               #   Global styles
├── tests/e2e/                  # Playwright end-to-end tests
├── public/                     # Static assets
├── .env.example                # Environment variable template
├── manage.py                   # Django CLI
├── requirements.txt            # Python dependencies
├── package.json                # Node dependencies and scripts
├── vite.config.ts              # Vite + Vitest config
├── playwright.config.ts        # Playwright config
└── tailwind.config.js          # Tailwind config
```

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
