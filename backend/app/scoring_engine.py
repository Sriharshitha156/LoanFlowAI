import json
import os

CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "scoring_config.json"))

def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(f"Scoring config file not found at {CONFIG_PATH}")
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)

def calculate_dti_score(dti: float) -> float:
    """
    Translates Debt-To-Income (DTI) ratio to a score out of 100:
    - DTI <= 0.20 -> 100
    - 0.20 < DTI <= 0.36 -> linear interpolation 100 to 70
    - 0.36 < DTI <= 0.45 -> linear interpolation 70 to 40
    - 0.45 < DTI <= 0.60 -> linear interpolation 40 to 0
    - DTI > 0.60 -> 0
    """
    if dti <= 0.20:
        return 100.0
    elif dti <= 0.36:
        # Interpolate between 100 (for 0.20) and 70 (for 0.36)
        return 100.0 - ((dti - 0.20) / (0.36 - 0.20)) * 30.0
    elif dti <= 0.45:
        # Interpolate between 70 (for 0.36) and 40 (for 0.45)
        return 70.0 - ((dti - 0.36) / (0.45 - 0.36)) * 30.0
    elif dti <= 0.60:
        # Interpolate between 40 (for 0.45) and 0 (for 0.60)
        return 40.0 - ((dti - 0.45) / (0.60 - 0.45)) * 40.0
    else:
        return 0.0

def calculate_credit_score(credit_history_score: int, thin_file_score: float) -> float:
    """
    Maps credit_history_score (e.g. FICO score) to 0-100 score:
    - credit_history_score = 0 -> baseline thin-file score
    - credit_history_score >= 800 -> 100
    - 700 - 799 -> 90
    - 650 - 699 -> 75
    - 600 - 649 -> 60
    - 500 - 599 -> 40
    - < 500 -> 10
    """
    if credit_history_score == 0:
        return thin_file_score
    if credit_history_score >= 800:
        return 100.0
    elif credit_history_score >= 700:
        return 90.0
    elif credit_history_score >= 650:
        return 75.0
    elif credit_history_score >= 600:
        return 60.0
    elif credit_history_score >= 500:
        return 40.0
    else:
        return 10.0

def score_application(financial_data: dict) -> dict:
    """
    Computes scores for an application:
    - dti_score: normalized score for DTI (0-100)
    - credit_score: normalized score for credit history (0-100)
    - income_stability_score: direct score out of 100
    - composite_score: weighted average of the three component scores
    - verdict: 'APPROVE', 'REFER', or 'DECLINE'
    
    Inputs in financial_data:
    - dti: float (debt to income ratio)
    - credit_score: int (credit score, or 0/None for thin-file)
    - income_stability: float (stability score out of 100)
    - documents_verified: bool (default True, False if any doc is unverified/missing)
    """
    config = load_config()
    weights = config["weights"]
    thresholds = config["thresholds"]
    thin_file_score = config["thin_file_score"]
    missing_doc_penalty_cap = config["missing_doc_penalty_cap"]
    
    # Safely get fields
    dti = float(financial_data.get("dti", 0.0))
    fico = int(financial_data.get("credit_score", 0) or 0)
    income_stability = float(financial_data.get("income_stability", 0.0))
    docs_verified = bool(financial_data.get("documents_verified", True))
    
    # Component calculations
    s_dti = calculate_dti_score(dti)
    s_credit = calculate_credit_score(fico, thin_file_score)
    s_income = float(income_stability)
    
    # Weighted composite score
    composite = (
        (s_dti * weights["dti"]) +
        (s_credit * weights["credit"]) +
        (s_income * weights["income"])
    )
    
    # Document verification constraint: cap the composite score if docs are missing
    if not docs_verified:
        composite = min(composite, missing_doc_penalty_cap)
        
    # Verdict assignment
    if composite >= thresholds["approve"]:
        verdict = "APPROVE"
    elif composite >= thresholds["refer"]:
        verdict = "REFER"
    else:
        verdict = "DECLINE"
        
    return {
        "dti_score": round(s_dti, 2),
        "credit_score": round(s_credit, 2),
        "income_stability_score": round(s_income, 2),
        "composite_score": round(composite, 2),
        "verdict": verdict
    }
