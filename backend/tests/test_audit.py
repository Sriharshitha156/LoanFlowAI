import unittest
from fastapi.testclient import TestClient
import sqlite3
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app, get_db
from scripts.setup_db import setup_database

class TestAuditLogTrail(unittest.TestCase):
    
    def setUp(self):
        setup_database()
        self.client = TestClient(app)
        self.db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "loanflow.db"))
        
        # Reset database state before running audit tests
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM audit_log")
        cursor.execute("DELETE FROM decision")
        cursor.execute("DELETE FROM recommendation")
        cursor.execute("DELETE FROM fairness_check")
        cursor.execute("UPDATE application SET status = 'submitted'")
        conn.commit()
        conn.close()

    def test_pipeline_audit_trail_generation(self):
        """Test that running the pipeline and submitting a decision writes all audit logs successfully"""
        application_id = "app_clean_approve_001"
        
        # 1. Trigger pipeline via GET case-file (this will write: policy_scoring, fairness_check, recommendation_generation)
        response_get = self.client.get(f"/applications/{application_id}/case-file")
        self.assertEqual(response_get.status_code, 200)
        
        # 2. Trigger decision POST (this will write: underwriter_decision)
        payload = {
            "underwriter_id": "underwriter_99",
            "final_verdict": "APPROVE",
            "override_reason": "" # No override reason needed since it matches APPROVE
        }
        response_post = self.client.post(f"/applications/{application_id}/decision", json=payload)
        self.assertEqual(response_post.status_code, 200)
        
        # 3. Retrieve audit trail
        response_trail = self.client.get(f"/applications/{application_id}/audit-trail")
        self.assertEqual(response_trail.status_code, 200)
        trail = response_trail.json()
        
        # Verify 4 steps were logged
        self.assertEqual(len(trail), 4)
        
        # Verify ordering and steps
        steps = [t["step_name"] for t in trail]
        self.assertIn("policy_scoring", steps)
        self.assertIn("fairness_check", steps)
        self.assertIn("recommendation_generation", steps)
        self.assertIn("underwriter_decision", steps)
        
        # Verify actors
        self.assertEqual(trail[0]["actor"], "SYSTEM") # policy_scoring
        self.assertEqual(trail[1]["actor"], "SYSTEM") # fairness_check
        self.assertEqual(trail[2]["actor"], "AGENT")  # recommendation_generation
        self.assertEqual(trail[3]["actor"], "HUMAN")  # underwriter_decision
        
        # Verify timestamps are in chronological order
        timestamps = [t["timestamp"] for t in trail]
        self.assertEqual(timestamps, sorted(timestamps))

if __name__ == "__main__":
    unittest.main()
