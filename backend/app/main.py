from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import os
import json
import uuid
from datetime import datetime

# Import engine components
from app.scoring_engine import score_application
from app.fairness_check import run_fairness_check
from app.recommendation_generator import generate_recommendation

app = FastAPI(title="CreditPath API")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "loanflow.db"))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enforce foreign key constraints
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

class DecisionRequest(BaseModel):
    underwriter_id: str
    final_verdict: str
    override_reason: str = None

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/applications/{application_id}/case-file")
def get_case_file(application_id: str):
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Fetch application
    cursor.execute("SELECT * FROM application WHERE id = ?", (application_id,))
    app_row = cursor.fetchone()
    if not app_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Application not found")
    app_data = dict(app_row)
    
    # 2. Fetch documents
    cursor.execute("SELECT * FROM document WHERE application_id = ?", (application_id,))
    doc_rows = cursor.fetchall()
    documents = []
    for doc in doc_rows:
        doc_dict = dict(doc)
        if doc_dict.get("extracted_fields"):
            try:
                doc_dict["extracted_fields"] = json.loads(doc_dict["extracted_fields"])
            except Exception:
                pass
        documents.append(doc_dict)
        
    # 3. Fetch policy score
    cursor.execute("SELECT * FROM policy_score WHERE application_id = ?", (application_id,))
    score_row = cursor.fetchone()
    policy_score = dict(score_row) if score_row else None
    
    # 4. Fetch fairness check
    cursor.execute("SELECT * FROM fairness_check WHERE application_id = ?", (application_id,))
    fairness_row = cursor.fetchone()
    fairness_check = dict(fairness_row) if fairness_row else None
    
    # 5. Fetch recommendation
    cursor.execute("SELECT * FROM recommendation WHERE application_id = ?", (application_id,))
    rec_row = cursor.fetchone()
    recommendation = dict(rec_row) if rec_row else None
    if recommendation and recommendation.get("cited_rules"):
        try:
            recommendation["cited_rules"] = json.loads(recommendation["cited_rules"])
        except Exception:
            pass

    # If policy_score, fairness_check, or recommendation are missing, compute them on the fly and save them!
    if not policy_score or not fairness_check or not recommendation:
        # Resolve metrics
        docs_verified = True
        age = None
        zipcode = None
        for doc in documents:
            if doc.get("verification_status") != "VERIFIED":
                docs_verified = False
            fields = doc.get("extracted_fields")
            if isinstance(fields, dict):
                if "age" in fields:
                    age = fields["age"]
                if "zipcode" in fields:
                    zipcode = fields["zipcode"]
                    
        dti = policy_score["debt_to_income"] if policy_score else 0.30
        credit_score = policy_score["credit_history_score"] if policy_score else 650
        income_stability = policy_score["income_stability_score"] if policy_score else 80
        
        financial_payload = {
            "dti": dti,
            "credit_score": credit_score,
            "income_stability": income_stability,
            "documents_verified": docs_verified
        }
        if age is not None:
            financial_payload["age"] = age
        if zipcode is not None:
            financial_payload["zipcode"] = zipcode
            
        # Compute scores if missing
        if not policy_score:
            computed_scores = score_application(financial_payload)
            score_id = f"score_{uuid.uuid4().hex[:8]}"
            cursor.execute(
                """
                INSERT INTO policy_score (id, application_id, debt_to_income, credit_history_score, income_stability_score, composite_score, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (score_id, application_id, dti, credit_score, income_stability, computed_scores["composite_score"], datetime.utcnow().isoformat() + "Z")
            )
            cursor.execute("SELECT * FROM policy_score WHERE id = ?", (score_id,))
            policy_score = dict(cursor.fetchone())
            
        # Compute fairness if missing
        if not fairness_check:
            computed_fairness = run_fairness_check(financial_payload)
            fairness_id = f"fc_{uuid.uuid4().hex[:8]}"
            cursor.execute(
                """
                INSERT INTO fairness_check (id, application_id, original_score, masked_score, delta, result, checked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (fairness_id, application_id, computed_fairness["original_score"], computed_fairness["masked_score"], computed_fairness["delta"], computed_fairness["result"], datetime.utcnow().isoformat() + "Z")
            )
            cursor.execute("SELECT * FROM fairness_check WHERE id = ?", (fairness_id,))
            fairness_check = dict(cursor.fetchone())
            
        # Compute recommendation if missing
        if not recommendation:
            computed_scores = score_application(financial_payload)
            computed_fairness = run_fairness_check(financial_payload)
            computed_rec = generate_recommendation(computed_scores, computed_fairness)
            rec_id = f"rec_{uuid.uuid4().hex[:8]}"
            cursor.execute(
                """
                INSERT INTO recommendation (id, application_id, verdict, reasoning_text, cited_rules, generated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (rec_id, application_id, computed_rec["verdict"], computed_rec["reasoning_text"], json.dumps(computed_rec.get("cited_rules", [])), datetime.utcnow().isoformat() + "Z")
            )
            cursor.execute("SELECT * FROM recommendation WHERE id = ?", (rec_id,))
            recommendation = dict(cursor.fetchone())
            if recommendation.get("cited_rules"):
                try:
                    recommendation["cited_rules"] = json.loads(recommendation["cited_rules"])
                except Exception:
                    pass
            
        conn.commit()
        
    conn.close()
    
    return {
        "application": app_data,
        "documents": documents,
        "policy_score": policy_score,
        "fairness_check": fairness_check,
        "recommendation": recommendation
    }

@app.post("/applications/{application_id}/decision")
def post_decision(application_id: str, req: DecisionRequest):
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Fetch application
    cursor.execute("SELECT * FROM application WHERE id = ?", (application_id,))
    app_row = cursor.fetchone()
    if not app_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Application not found")
        
    # 2. Fetch recommendation
    cursor.execute("SELECT verdict FROM recommendation WHERE application_id = ?", (application_id,))
    rec_row = cursor.fetchone()
    
    if not rec_row:
        # Self-heal and compute recommendation dynamically if missing
        conn.close()
        get_case_file(application_id)
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT verdict FROM recommendation WHERE application_id = ?", (application_id,))
        rec_row = cursor.fetchone()
        
    rec_verdict = rec_row["verdict"]
    
    # Enforce override constraint
    overrode = 0
    if req.final_verdict != rec_verdict:
        overrode = 1
        if not req.override_reason or not req.override_reason.strip():
            conn.close()
            raise HTTPException(
                status_code=400,
                detail="Override reason is required because final verdict differs from recommendation."
            )
            
    decision_id = f"dec_{uuid.uuid4().hex[:8]}"
    log_id = f"log_{uuid.uuid4().hex[:8]}"
    decided_at = datetime.utcnow().isoformat() + "Z"
    
    try:
        # Insert Decision first to fulfill trigger
        cursor.execute(
            """
            INSERT INTO decision (id, application_id, underwriter_id, final_verdict, overrode_agent, override_reason, decided_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (decision_id, application_id, req.underwriter_id, req.final_verdict, overrode, req.override_reason, decided_at)
        )
        
        # Update Application status (will be validated by SQLite enforce_decision_before_decided trigger)
        cursor.execute(
            "UPDATE application SET status = 'decided' WHERE id = ?",
            (application_id,)
        )
        
        # Insert AuditLog
        payload_data = {
            "underwriter_id": req.underwriter_id,
            "final_verdict": req.final_verdict,
            "overrode_agent": overrode,
            "override_reason": req.override_reason
        }
        cursor.execute(
            """
            INSERT INTO audit_log (id, application_id, step_name, actor, payload, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (log_id, application_id, "underwriter_decision", req.underwriter_id, json.dumps(payload_data), decided_at)
        )
        
        conn.commit()
    except sqlite3.Error as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")
        
    conn.close()
    return {"status": "success", "decision_id": decision_id}
