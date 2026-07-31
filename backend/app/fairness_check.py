from app.scoring_engine import score_application

def run_fairness_check(application_data: dict) -> dict:
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
    
    if original_verdict == masked_verdict:
        result = "PASS"
    else:
        result = "FLAG"
        
    return {
        "original_score": original_score,
        "original_verdict": original_verdict,
        "masked_score": masked_score,
        "masked_verdict": masked_verdict,
        "delta": delta,
        "result": result
    }
