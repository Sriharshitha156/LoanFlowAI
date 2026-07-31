from app.scoring_engine import score_application
import json
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "loanflow.db"))

def log_audit(application_id: str, step_name: str, actor: str, payload: dict, conn=None):
    if not application_id:
        return
    import sqlite3
    import uuid
    from datetime import datetime
    
    log_id = f"log_{uuid.uuid4().hex[:8]}"
    timestamp = datetime.utcnow().isoformat() + "Z"
    query = """
        INSERT INTO audit_log (id, application_id, step_name, actor, payload, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    
    if conn:
        cursor = conn.cursor()
        cursor.execute(query, (log_id, application_id, step_name, actor, json.dumps(payload), timestamp))
    else:
        try:
            conn_new = sqlite3.connect(DB_PATH)
            cursor = conn_new.cursor()
            cursor.execute(query, (log_id, application_id, step_name, actor, json.dumps(payload), timestamp))
            conn_new.commit()
            conn_new.close()
        except Exception as e:
            print(f"Warning: Failed to write audit log for step {step_name}: {str(e)}")

def run_fairness_check(application_data: dict, application_id: str = None, conn=None) -> dict:
    """
    Runs a fairness auditing check on an application:
    1. Runs the scoring engine with original data (including demographics).
    2. Creates a masked copy of the data (removes applicant_name, zipcode, age, address, etc.).
    3. Runs the scoring engine with masked data.
    4. Compares the verdicts.
    5. Returns PASS if the verdict is the same, or FLAG if it shifts.
    """
    # 1. Original Run (with all demographics/proxy fields)
    original_result = score_application(application_data)
    original_score = original_result["composite_score"]
    original_verdict = original_result["verdict"]
    
    # 2. Masking identity-correlated fields
    masked_data = application_data.copy()
    identity_fields = ["applicant_name", "name", "zipcode", "zip_code", "age", "address", "gender", "race"]
    for field in identity_fields:
        if field in masked_data:
            del masked_data[field]
            
    # 3. Masked Run (without demographics/proxy fields)
    masked_result = score_application(masked_data)
    masked_score = masked_result["composite_score"]
    masked_verdict = masked_result["verdict"]
    
    # 4. Compare
    delta = round(abs(original_score - masked_score), 2)
    result = "PASS" if original_verdict == masked_verdict else "FLAG"
    
    res = {
        "original_score": original_score,
        "original_verdict": original_verdict,
        "masked_score": masked_score,
        "masked_verdict": masked_verdict,
        "delta": delta,
        "result": result
    }
    
    # Write audit log if application_id is provided
    if application_id:
        log_audit(application_id, "fairness_check", "SYSTEM", res, conn=conn)
        
    return res
