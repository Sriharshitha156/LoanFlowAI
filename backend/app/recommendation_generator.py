import os
import json
import urllib.request
import urllib.error

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

def generate_recommendation(score_breakdown: dict, fairness_check: dict, application_id: str = None, conn=None) -> dict:
    """
    Calls Claude (or fallback API/mock) to generate a structured reasoning explanation.
    """
    verdict = score_breakdown["verdict"]
    composite = score_breakdown["composite_score"]
    dti_score = score_breakdown["dti_score"]
    credit_score = score_breakdown["credit_score"]
    income_stability = score_breakdown["income_stability_score"]
    fairness_result = fairness_check["result"]
    
    prompt = f"""
    You are an automated loan recommendation assistant.
    Analyze the credit application scoring metrics:
    - Verdict: {verdict}
    - Composite Score: {composite} (Thresholds: Approve >= 80, Refer >= 60, Decline < 60)
    - Debt-to-Income Score: {dti_score} (out of 100)
    - Credit History Score: {credit_score} (out of 100)
    - Income Stability Score: {income_stability} (out of 100)
    - Fairness Check Result: {fairness_result}

    Task:
    Explain the decision verdict. You must match the deterministic Verdict.
    Do NOT change the verdict.
    Provide your output in strict JSON format matching this shape:
    {{
      "verdict": "{verdict}",
      "reasoning_text": "A 1-2 sentence explanation of the decision details.",
      "cited_rules": ["List of applicable guidelines, e.g., 'Low Debt-to-Income', 'Poor Credit Score'"]
    }}
    Provide ONLY the raw JSON. No markdown blocks, no greeting, no preamble.
    """
    
    response_text = ""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    
    # 1. Try Claude (Anthropic)
    if anthropic_key:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        data = {
            "model": "claude-3-5-sonnet-latest",
            "max_tokens": 512,
            "messages": [{"role": "user", "content": prompt}]
        }
        req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                response_text = res_data["content"][0]["text"]
        except Exception:
            pass
            
    # 2. Try GPT-4o (OpenAI Fallback)
    if not response_text and openai_key:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {openai_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"}
        }
        req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                response_text = res_data["choices"][0]["message"]["content"]
        except Exception:
            pass
            
    # 3. Try Local Rule-based Mock Fallback
    if not response_text:
        response_text = mock_llm_response(verdict, composite, dti_score, credit_score, income_stability, fairness_result)
        
    # Clean and parse response text
    rec_result = None
    try:
        clean_text = response_text.strip()
        if clean_text.startswith("```"):
            lines = clean_text.splitlines()
            if lines[0].startswith("```json"):
                clean_text = "\n".join(lines[1:-1])
            else:
                clean_text = "\n".join(lines[1:-1])
        rec_result = json.loads(clean_text)
    except Exception:
        rec_result = {
            "verdict": verdict,
            "reasoning_text": f"Decision processed for composite score {composite}.",
            "cited_rules": ["General Score Assessment"]
        }
        
    # Write audit log if application_id is provided
    if application_id:
        log_audit(application_id, "recommendation_generation", "AGENT", rec_result, conn=conn)
        
    return rec_result

def mock_llm_response(verdict: str, composite: float, dti: float, credit: float, income: float, fairness: str) -> str:
    rules = []
    if verdict == "APPROVE":
        reasoning = f"The application is approved as the composite score of {composite} meets all creditworthiness thresholds."
        if dti >= 80: rules.append("Low Debt-To-Income")
        if credit >= 80: rules.append("Excellent Credit History")
        if income >= 80: rules.append("Stable Income Source")
    elif verdict == "REFER":
        if credit == 50.0:
            reasoning = "The application is referred due to a thin credit file requiring manual underwriter verification."
            rules.append("Thin Credit File")
        elif fairness == "FLAG":
            reasoning = "The application is referred and flagged for manual fairness audit due to significant score delta under demographic masking."
            rules.append("Fairness Parity Flag")
        else:
            reasoning = "The composite score falls in the borderline refer range, requiring standard manual underwriting."
            rules.append("Borderline Score Audit")
    else: # DECLINE
        if composite == 59.0:
            reasoning = "The application is declined due to missing or unverified required documentation."
            rules.append("Unverified Required Documents")
        else:
            reasoning = f"The composite score of {composite} falls below minimum credit risk thresholds."
            if dti < 60: rules.append("High Debt-To-Income Ratio")
            if credit < 60: rules.append("Poor Credit History")
            if income < 60: rules.append("Low Income Stability")
            
    return json.dumps({
        "verdict": verdict,
        "reasoning_text": reasoning,
        "cited_rules": rules
    })
