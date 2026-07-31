# CreditPath: Algorithmic Lending & Fairness Auditing Portal

CreditPath is an enterprise-grade automated credit risk underwriting pipeline and compliance auditing system. It calculates deterministic lending scores, audits decisions for proxy-variable demographic bias, generates AI recommendations, enforces human-override compliance boundaries, and logs a comprehensive audit trail of every pipeline operation.

---

## 1. Project Architecture Diagram

Below is the conceptual flow of an application through the CreditPath pipeline:

```text
       +-------------------------------------------------------+
       |                  Application Payload                  |
       |  (Financials + verification documents + demographics) |
       +-------------------------------------------------------+
                                   |
                                   v
             +-------------------------------------------+
             |           Policy Scoring Engine           |
             |  - Normalized Debt-to-Income (DTI)        |
             |  - Normalized Credit History rating       |
             |  - Normalized Stability multiplier        |
             |  - Missing document score caps            |
             |  - Demographic-sensitive bias rules       |
             +-------------------------------------------+
               /                                       \
  [Original Run]                                   [Masked Run]
  Includes zip & age                               Removes proxy fields
              /                                         \
             v                                           v
    (Original Score)                              (Masked Score)
             \                                           /
              \--> +-------------------------------+ <--/
                   |     Fairness Audit Check      |
                   |  Compares scores for shift    |
                   |  Result: PASS or bias FLAG    |
                   +-------------------------------+
                                   |
                                   v
             +-------------------------------------------+
             |         Recommendation Generator          |
             |  Retrieves policy breakdowns + audits    |
             |  Prompts Claude-Sonnet for justification  |
             +-------------------------------------------+
                                   |
                                   v
             +-------------------------------------------+
             |           Human Decision Gate             |
             |  - Underwriter submits final decision     |
             |  - DB trigger blocks "decided" status     |
             |    unless Decision record exists          |
             |  - Forces justification on override       |
             +-------------------------------------------+
                                   |
                                   v
             +-------------------------------------------+
             |             Audit Log Trace               |
             |  Persists timestamps, actors, payloads    |
             +-------------------------------------------+
```

---

## 2. Core Modules & Pipeline Steps

### I. Policy Scoring Engine
Located in `backend/app/scoring_engine.py`. Translates raw financial parameters into standard $0\text{--}100$ scores:
- **Debt-To-Income (DTI)**: Uses linear interpolation pieces to map DTI to $0\text{--}100$.
- **Credit Rating**: Maps FICO ranges to scores. Sets a standard fallback for "thin credit files" (no credit record).
- **Stability Rating**: Multiplier representing employment and history checks.
- **Document Penalty Cap**: If verification documents are marked missing or unverified, the composite score is strictly capped (defaults to maximum $59.0$, forcing a `DECLINE` or `REFER`).
- **Demographic Bias Proxies**: Simulates systemic bias by applying point penalties for protected redlined zip codes or younger age thresholds.

### II. Demographic Fairness Check
Located in `backend/app/fairness_check.py`. Audits demographic variables:
1. Executes scoring on the raw application file (yielding `original_score` and `original_verdict`).
2. Creates an identity-masked profile copy, stripping out name, address, gender, race, age, and zipcode.
3. Re-runs the scoring engine (yielding `masked_score` and `masked_verdict`).
4. Compares results:
   - **PASS**: The verdict category (`APPROVE`, `REFER`, `DECLINE`) remains unchanged.
   - **FLAG**: The verdict category shifts under masking, exposing that proxy-demographic parameters (such as zip code or age) were decisive factors in the decision.

### III. AI Recommendation Generator
Located in `backend/app/recommendation_generator.py`. Calls Anthropic Claude-3.5-Sonnet (with fallback triggers for OpenAI GPT-4o or a rules-based mock engine) to generate strict JSON explanations justifying the policy score without altering the deterministic verdict.

### IV. Human Decision Gate
Located in `backend/app/main.py`. Intercepts final underwriting:
- Enforces an SQLite database trigger `enforce_decision_before_decided` which blocks applications from being updated to `decided` status unless a corresponding underwriter `decision` record exists.
- Validates that an `override_reason` is supplied if the underwriter overrides the system's recommended verdict.

---

## 3. Configuration & Policy Threshold Tuning

You can adjust weights, risk thresholds, and simulated bias rules inside `backend/app/scoring_config.json`:

```json
{
  "weights": {
    "dti": 0.4,
    "credit": 0.4,
    "income": 0.2
  },
  "thresholds": {
    "approve": 80.0,
    "refer": 60.0
  },
  "thin_file_score": 50.0,
  "missing_doc_penalty_cap": 59.0,
  "bias_rules": {
    "redlined_zipcodes": ["90210", "30301"],
    "zipcode_penalty": 15.0,
    "young_age_threshold": 25,
    "young_age_penalty": 10.0
  }
}
```
### Adjustments:
- **Approval Boundaries**: Modify `"thresholds"` to make approval criteria tighter or looser.
- **Weights**: Tweak `"weights"` to shift relative importance between DTI, Credit, and Income.
- **Bias Auditing Settings**: Modify `"bias_rules"` to simulate or remove redlining/age penalties.

---

## 4. Run Locally on Windows (PowerShell)

Follow these instructions to launch both servers from your terminal.

### Prerequisites
- Python 3.10+
- Node.js 18+

### Step 1: Initialize Database & Dependencies
Clone the repository, open PowerShell, and run:
```powershell
# Navigate to backend folder
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
.venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt

# Seed the database
python scripts/setup_db.py
```

### Step 2: Start Backend Server
Ensure your virtual environment is active in your PowerShell session and execute:
```powershell
uvicorn app.main:app --reload --port 8000
```
The backend API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Step 3: Start Frontend Server
Open a new PowerShell terminal, navigate to the frontend directory, and run:
```powershell
# Navigate to frontend folder
cd frontend

# Install package dependencies
npm install

# Start the Vite development server
npm run dev -- --port 5173
```
Open your browser and navigate to **[http://localhost:5173](http://localhost:5173)** to explore the portal!
