# CreditPath / LoanFlowAI

A modern full-stack loan flow and credit processing application.

This skeleton project contains:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS v4
- **Backend**: FastAPI (Python)
- **Database**: SQLite (Empty initialized file `backend/loanflow.db`)

---

## Getting Started (Windows PowerShell)

Follow these instructions to run the application locally on Windows.

### 1. Frontend Development Server

The frontend is built with React, Vite, and Tailwind CSS v4.

```powershell
# Navigate to the frontend directory
cd frontend

# Install dependencies (if not already installed)
npm install

# Start the Vite development server
npm run dev
```

The frontend will start at **[http://localhost:5173](http://localhost:5173)**.

---

### 2. Backend Development Server

The backend is built with FastAPI. It runs on a Python virtual environment (`.venv`).

```powershell
# Navigate to the backend directory
cd backend

# (Optional) Create virtual environment if setting up from scratch
python -m venv .venv

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt

# Start the FastAPI uvicorn server
uvicorn app.main:app --reload --port 8000
```

The backend server will run at **[http://localhost:8000](http://localhost:8000)**.

#### Test the health check endpoint:
In a new PowerShell window, run:
```powershell
Invoke-RestMethod -Uri http://localhost:8000/health
```
Expected output:
```json
{
  "status": "ok"
}
```

---

### 3. Database

An empty SQLite database is initialized at:
* `backend/loanflow.db`
