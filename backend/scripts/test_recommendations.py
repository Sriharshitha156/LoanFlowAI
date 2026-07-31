import os
import sys
import sqlite3
import json

# Ensure backend directory is in path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.scoring_engine import score_application
from app.fairness_check import run_fairness_check
from app.recommendation_generator import generate_recommendation

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "loanflow.db"))

def run_test_recommendations():
    print(f"Loading seed data from SQLite database: {DB_PATH}\n")
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file not found at {DB_PATH}")
        sys.exit(1)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Query all applications
    cursor.execute("SELECT id, applicant_name, amount_requested, purpose FROM application")
    apps = cursor.fetchall()
    
    for app_id, applicant_name, amount, purpose in apps:
        print(f"==================================================")
        print(f"APPLICATION ID: {app_id}")
        print(f"APPLICANT:      {applicant_name}")
        print(f"AMOUNT:         ${amount:,.2f} ({purpose})")
        
        # Query matching documents
        cursor.execute("SELECT type, verification_status, extracted_fields FROM document WHERE application_id = ?", (app_id,))
        docs = cursor.fetchall()
        
        docs_verified = True
        age = None
        zipcode = None
        
        for doc_type, status, ext_fields_str in docs:
            if status != "VERIFIED":
                docs_verified = False
            if ext_fields_str:
                try:
                    fields = json.loads(ext_fields_str)
                    if "age" in fields:
                        age = fields["age"]
                    if "zipcode" in fields:
                        zipcode = fields["zipcode"]
                except Exception:
                    pass
                    
        # Query matching policy score from seeding
        cursor.execute(
            "SELECT debt_to_income, credit_history_score, income_stability_score FROM policy_score WHERE application_id = ?",
            (app_id,)
        )
        score_record = cursor.fetchone()
        
        if not score_record:
            print(f"Warning: No policy score record found for application {app_id}")
            continue
            
        dti, credit_score, income_stability = score_record
        
        # Formulate full payload for engine execution
        financial_data = {
            "applicant_name": applicant_name,
            "dti": dti,
            "credit_score": credit_score,
            "income_stability": income_stability,
            "documents_verified": docs_verified
        }
        if age is not None:
            financial_data["age"] = age
        if zipcode is not None:
            financial_data["zipcode"] = zipcode
            
        # Run Pipeline Components
        score_breakdown = score_application(financial_data)
        fairness_result = run_fairness_check(financial_data)
        recommendation = generate_recommendation(score_breakdown, fairness_result)
        
        # Output results
        print("\nPipeline Execution Outputs:")
        print(f"  - Component Scores: DTI={score_breakdown['dti_score']}, Credit={score_breakdown['credit_score']}, Income={score_breakdown['income_stability_score']}")
        print(f"  - Composite Score:  {score_breakdown['composite_score']} (Verdict: {score_breakdown['verdict']})")
        print(f"  - Fairness Audit:   {fairness_result['result']} (Delta: {fairness_result['delta']})")
        print("\nGenerated Recommendation Output (Strict JSON):")
        print(json.dumps(recommendation, indent=2))
        print("==================================================\n")
        
    conn.close()

if __name__ == "__main__":
    run_test_recommendations()
