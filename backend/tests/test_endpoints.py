import unittest
from fastapi.testclient import TestClient
import sqlite3
import os
import sys
import json

# Ensure backend directory is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app, get_db

class TestAPIEndpoints(unittest.TestCase):
    
    def setUp(self):
        self.client = TestClient(app)
        self.db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "loanflow.db"))
        
    def test_01_get_case_file_success(self):
        """Test retrieving a full application case file successfully"""
        # Retrieve Sarah Jenkins' case (app_clean_approve_001)
        response = self.client.get("/applications/app_clean_approve_001/case-file")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertIn("application", data)
        self.assertIn("documents", data)
        self.assertIn("policy_score", data)
        self.assertIn("fairness_check", data)
        self.assertIn("recommendation", data)
        
        self.assertEqual(data["application"]["id"], "app_clean_approve_001")
        self.assertEqual(data["application"]["applicant_name"], "Sarah Jenkins")
        self.assertEqual(len(data["documents"]), 2)
        self.assertEqual(data["recommendation"]["verdict"], "APPROVE")

    def test_02_post_decision_override_without_reason_rejected(self):
        """POST /decision overrides agent but has no override_reason -> Reject with 400"""
        # Sarah Jenkins is recommended APPROVE. We try to DECLINE without override_reason.
        payload = {
            "underwriter_id": "underwriter_42",
            "final_verdict": "DECLINE",
            "override_reason": "" # Empty reason!
        }
        
        response = self.client.post("/applications/app_clean_approve_001/decision", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Override reason is required", response.json()["detail"])

    def test_03_database_constraint_rejection_direct_update(self):
        """Direct DB update to set status='decided' without a Decision row must fail (SQLite trigger)"""
        conn = get_db()
        cursor = conn.cursor()
        
        try:
            # Ensure there is NO decision record for Marcus Brody (app_borderline_refer_002)
            cursor.execute("DELETE FROM decision WHERE application_id = 'app_borderline_refer_002'")
            conn.commit()
            
            # Attempt to set application status to 'decided'
            with self.assertRaises(sqlite3.IntegrityError) as ctx:
                cursor.execute("UPDATE application SET status = 'decided' WHERE id = 'app_borderline_refer_002'")
                conn.commit()
                
            # Verify the trigger message was triggered
            self.assertIn("An application cannot be marked as decided without a corresponding Decision record", str(ctx.exception))
        finally:
            conn.close()

    def test_04_post_decision_with_override_reason_success(self):
        """POST /decision with valid override reason should succeed and update status to decided"""
        # Sarah Jenkins recommended APPROVE. We override to DECLINE with a reason.
        payload = {
            "underwriter_id": "underwriter_42",
            "final_verdict": "DECLINE",
            "override_reason": "Applicant requested to withdraw/change terms, declining this ticket to re-apply."
        }
        
        response = self.client.post("/applications/app_clean_approve_001/decision", json=payload)
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertEqual(res_data["status"], "success")
        self.assertIn("decision_id", res_data)
        
        # Verify changes in DB
        conn = get_db()
        cursor = conn.cursor()
        
        # 1. Verify application status is now 'decided'
        cursor.execute("SELECT status FROM application WHERE id = 'app_clean_approve_001'")
        app_status = cursor.fetchone()["status"]
        self.assertEqual(app_status, "decided")
        
        # 2. Verify Decision record was inserted
        cursor.execute("SELECT * FROM decision WHERE application_id = 'app_clean_approve_001'")
        dec_row = cursor.fetchone()
        self.assertIsNotNone(dec_row)
        self.assertEqual(dec_row["final_verdict"], "DECLINE")
        self.assertEqual(dec_row["overrode_agent"], 1) # True
        self.assertEqual(dec_row["override_reason"], payload["override_reason"])
        
        # 3. Verify AuditLog record was inserted
        cursor.execute("SELECT * FROM audit_log WHERE application_id = 'app_clean_approve_001' AND step_name = 'underwriter_decision'")
        log_row = cursor.fetchone()
        self.assertIsNotNone(log_row)
        self.assertEqual(log_row["actor"], "underwriter_42")
        
        conn.close()

if __name__ == "__main__":
    unittest.main()
