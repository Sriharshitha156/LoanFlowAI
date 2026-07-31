import os
import sqlite3
import json
from datetime import datetime

# Resolve absolute path to the SQLite database file
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "loanflow.db"))

DDL_STATEMENTS = [
    # Application Table
    """
    CREATE TABLE IF NOT EXISTS application (
        id TEXT PRIMARY KEY,
        applicant_name TEXT NOT NULL,
        amount_requested REAL NOT NULL,
        term_months INTEGER NOT NULL,
        purpose TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        status TEXT NOT NULL
    );
    """,
    # Document Table
    """
    CREATE TABLE IF NOT EXISTS document (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        type TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        extracted_fields TEXT, -- JSON string
        FOREIGN KEY(application_id) REFERENCES application(id)
    );
    """,
    # PolicyScore Table
    """
    CREATE TABLE IF NOT EXISTS policy_score (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        debt_to_income REAL NOT NULL,
        credit_history_score INTEGER NOT NULL,
        income_stability_score INTEGER NOT NULL,
        composite_score REAL NOT NULL,
        computed_at TEXT NOT NULL,
        FOREIGN KEY(application_id) REFERENCES application(id)
    );
    """,
    # FairnessCheck Table
    """
    CREATE TABLE IF NOT EXISTS fairness_check (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        original_score REAL NOT NULL,
        masked_score REAL NOT NULL,
        delta REAL NOT NULL,
        result TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        FOREIGN KEY(application_id) REFERENCES application(id)
    );
    """,
    # Recommendation Table
    """
    CREATE TABLE IF NOT EXISTS recommendation (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        reasoning_text TEXT NOT NULL,
        cited_rules TEXT, -- JSON string
        generated_at TEXT NOT NULL,
        FOREIGN KEY(application_id) REFERENCES application(id)
    );
    """,
    # Decision Table
    """
    CREATE TABLE IF NOT EXISTS decision (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        underwriter_id TEXT NOT NULL,
        final_verdict TEXT NOT NULL,
        overrode_agent INTEGER NOT NULL, -- 0 for False, 1 for True
        override_reason TEXT,
        decided_at TEXT NOT NULL,
        FOREIGN KEY(application_id) REFERENCES application(id)
    );
    """,
    # AuditLog Table
    """
    CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        application_id TEXT,
        step_name TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload TEXT, -- JSON string
        timestamp TEXT NOT NULL,
        FOREIGN KEY(application_id) REFERENCES application(id)
    );
    """,
    # Trigger to enforce decision before marking application as decided
    """
    CREATE TRIGGER IF NOT EXISTS enforce_decision_before_decided
    BEFORE UPDATE OF status ON application
    FOR EACH ROW
    WHEN NEW.status = 'decided' AND NOT EXISTS (SELECT 1 FROM decision WHERE application_id = NEW.id)
    BEGIN
        SELECT RAISE(FAIL, 'An application cannot be marked as decided without a corresponding Decision record.');
    END;
    """
]

SEED_DATA = {
    "applications": [
        # 1. Clean Approve Case
        {
            "id": "app_clean_approve_001",
            "applicant_name": "Sarah Jenkins",
            "amount_requested": 250000.00,
            "term_months": 360,
            "purpose": "Home Purchase",
            "submitted_at": "2026-07-31T10:00:00Z",
            "status": "submitted"
        },
        # 2. Borderline Refer Case
        {
            "id": "app_borderline_refer_002",
            "applicant_name": "Marcus Brody",
            "amount_requested": 180000.00,
            "term_months": 240,
            "purpose": "Debt Consolidation",
            "submitted_at": "2026-07-31T10:15:00Z",
            "status": "submitted"
        },
        # 3. Clear Decline Case
        {
            "id": "app_clear_decline_003",
            "applicant_name": "Robert Vance",
            "amount_requested": 350000.00,
            "term_months": 360,
            "purpose": "Business Launch",
            "submitted_at": "2026-07-31T10:30:00Z",
            "status": "submitted"
        },
        # 4. Thin-File Case
        {
            "id": "app_thin_file_004",
            "applicant_name": "Emily Zhang",
            "amount_requested": 25000.00,
            "term_months": 60,
            "purpose": "Auto Loan",
            "submitted_at": "2026-07-31T10:45:00Z",
            "status": "submitted"
        },
        # 5. Missing-Document Case
        {
            "id": "app_missing_doc_005",
            "applicant_name": "Daniel Craig",
            "amount_requested": 120000.00,
            "term_months": 180,
            "purpose": "Home Improvement",
            "submitted_at": "2026-07-31T11:00:00Z",
            "status": "submitted"
        },
        # 6. Fairness Check Flag Case
        {
            "id": "app_fairness_flag_006",
            "applicant_name": "Kofi Mensah",
            "amount_requested": 300000.00,
            "term_months": 360,
            "purpose": "Home Purchase",
            "submitted_at": "2026-07-31T11:15:00Z",
            "status": "submitted"
        }
    ],
    "documents": [
        # Sarah Jenkins Docs
        {
            "id": "doc_sarah_w2",
            "application_id": "app_clean_approve_001",
            "type": "W2",
            "verification_status": "VERIFIED",
            "extracted_fields": json.dumps({"employer": "Google LLC", "annual_income": 145000})
        },
        {
            "id": "doc_sarah_paystub",
            "application_id": "app_clean_approve_001",
            "type": "Paystub",
            "verification_status": "VERIFIED",
            "extracted_fields": json.dumps({"pay_period": "biweekly", "net_pay": 4200})
        },
        # Marcus Brody Docs
        {
            "id": "doc_marcus_paystub",
            "application_id": "app_borderline_refer_002",
            "type": "Paystub",
            "verification_status": "VERIFIED",
            "extracted_fields": json.dumps({"employer": "Freelance IT", "annual_income": 95000})
        },
        # Robert Vance Docs
        {
            "id": "doc_robert_bank",
            "application_id": "app_clear_decline_003",
            "type": "BankStatement",
            "verification_status": "VERIFIED",
            "extracted_fields": json.dumps({"average_balance": 1200, "overdraft_count": 4})
        },
        # Emily Zhang Docs
        {
            "id": "doc_emily_paystub",
            "application_id": "app_thin_file_004",
            "type": "Paystub",
            "verification_status": "VERIFIED",
            "extracted_fields": json.dumps({"employer": "Startup Inc", "annual_income": 65000})
        },
        # Daniel Craig Docs (Unverified/Missing details)
        {
            "id": "doc_daniel_tax",
            "application_id": "app_missing_doc_005",
            "type": "TaxReturn",
            "verification_status": "UNVERIFIED",
            "extracted_fields": json.dumps({})
        },
        # Kofi Mensah Docs (Demographics contained in ID)
        {
            "id": "doc_kofi_id",
            "application_id": "app_fairness_flag_006",
            "type": "ID",
            "verification_status": "VERIFIED",
            "extracted_fields": json.dumps({"age": 22, "zipcode": "90001"})
        },
        {
            "id": "doc_kofi_paystub",
            "application_id": "app_fairness_flag_006",
            "type": "Paystub",
            "verification_status": "VERIFIED",
            "extracted_fields": json.dumps({"employer": "Local Gov", "annual_income": 82000})
        }
    ],
    "policy_scores": [
        # Sarah Jenkins Score
        {
            "id": "score_sarah_001",
            "application_id": "app_clean_approve_001",
            "debt_to_income": 0.22,
            "credit_history_score": 810,
            "income_stability_score": 98,
            "composite_score": 94.5,
            "computed_at": "2026-07-31T10:05:00Z"
        },
        # Marcus Brody Score
        {
            "id": "score_marcus_002",
            "application_id": "app_borderline_refer_002",
            "debt_to_income": 0.38,
            "credit_history_score": 640,
            "income_stability_score": 65,
            "composite_score": 64.0,
            "computed_at": "2026-07-31T10:20:00Z"
        },
        # Robert Vance Score
        {
            "id": "score_robert_003",
            "application_id": "app_clear_decline_003",
            "debt_to_income": 0.58,
            "credit_history_score": 490,
            "income_stability_score": 30,
            "composite_score": 32.5,
            "computed_at": "2026-07-31T10:35:00Z"
        },
        # Emily Zhang Score
        {
            "id": "score_emily_004",
            "application_id": "app_thin_file_004",
            "debt_to_income": 0.12,
            "credit_history_score": 0,
            "income_stability_score": 85,
            "composite_score": 58.0,
            "computed_at": "2026-07-31T10:50:00Z"
        },
        # Daniel Craig Score
        {
            "id": "score_daniel_005",
            "application_id": "app_missing_doc_005",
            "debt_to_income": 0.30,
            "credit_history_score": 720,
            "income_stability_score": 90,
            "composite_score": 76.5,
            "computed_at": "2026-07-31T11:05:00Z"
        },
        # Kofi Mensah Score
        {
            "id": "score_kofi_006",
            "application_id": "app_fairness_flag_006",
            "debt_to_income": 0.36,
            "credit_history_score": 670,
            "income_stability_score": 80,
            "composite_score": 69.0,
            "computed_at": "2026-07-31T11:20:00Z"
        }
    ]
}

def setup_database():
    print(f"Connecting to database at: {DB_PATH}")
    
    # Ensure parent directory exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Drop existing tables if they exist to start fresh
    tables_to_drop = ["audit_log", "decision", "recommendation", "fairness_check", "policy_score", "document", "application"]
    print("Dropping existing tables if they exist...")
    for table in tables_to_drop:
        cursor.execute(f"DROP TABLE IF EXISTS {table};")
    
    # Create tables
    print("Creating tables...")
    for statement in DDL_STATEMENTS:
        cursor.execute(statement)
        
    # Seed Application records
    print("Seeding applications...")
    for app in SEED_DATA["applications"]:
        cursor.execute(
            """
            INSERT INTO application (id, applicant_name, amount_requested, term_months, purpose, submitted_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (app["id"], app["applicant_name"], app["amount_requested"], app["term_months"], app["purpose"], app["submitted_at"], app["status"])
        )
        
    # Seed Document records
    print("Seeding documents...")
    for doc in SEED_DATA["documents"]:
        cursor.execute(
            """
            INSERT INTO document (id, application_id, type, verification_status, extracted_fields)
            VALUES (?, ?, ?, ?, ?)
            """,
            (doc["id"], doc["application_id"], doc["type"], doc["verification_status"], doc["extracted_fields"])
        )
        
    # Seed PolicyScore records
    print("Seeding policy scores...")
    for score in SEED_DATA["policy_scores"]:
        cursor.execute(
            """
            INSERT INTO policy_score (id, application_id, debt_to_income, credit_history_score, income_stability_score, composite_score, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (score["id"], score["application_id"], score["debt_to_income"], score["credit_history_score"], score["income_stability_score"], score["composite_score"], score["computed_at"])
        )
        
    conn.commit()
    conn.close()
    print("Database schema successfully set up and seeded!")

if __name__ == "__main__":
    setup_database()
