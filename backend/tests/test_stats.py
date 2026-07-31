import unittest
from fastapi.testclient import TestClient
import sqlite3
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app, get_db
from scripts.setup_db import setup_database

class TestDashboardStatsAPI(unittest.TestCase):
    
    def setUp(self):
        setup_database()
        self.client = TestClient(app)
        
    def test_stats_calculations(self):
        """Test retrieving dashboard stats and verifying calculation ranges"""
        # Initially, there are no decisions, so turnaround time and STP rate should be 0.
        # Audit pass rate should reflect seeded checks if populated, or default to 100
        response = self.client.get("/dashboard/stats")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertIn("avg_turnaround_mins", data)
        self.assertIn("straight_through_rate", data)
        self.assertIn("audit_pass_rate", data)
        
        # Default with no decisions
        self.assertEqual(data["avg_turnaround_mins"], 0.0)
        self.assertEqual(data["straight_through_rate"], 0.0)
        
        # Populate case file for app_clean_approve_001 to generate fairness check
        self.client.get("/applications/app_clean_approve_001/case-file")
        
        # Submit an approved decision (with no override)
        payload = {
            "underwriter_id": "underwriter_1",
            "final_verdict": "APPROVE",
            "override_reason": ""
        }
        res_post = self.client.post("/applications/app_clean_approve_001/decision", json=payload)
        self.assertEqual(res_post.status_code, 200)
        
        # Re-fetch stats
        response_new = self.client.get("/dashboard/stats")
        self.assertEqual(response_new.status_code, 200)
        data_new = response_new.json()
        
        # We have 1 decision, which matches recommended APPROVE and is straight-through (overrode=0)
        # So straight_through_rate should be 100.0%
        self.assertEqual(data_new["straight_through_rate"], 100.0)
        self.assertEqual(data_new["audit_pass_rate"], 100.0)
        self.assertGreaterEqual(data_new["avg_turnaround_mins"], 0.0)

    def test_audit_logs_list_endpoint(self):
        """Test retrieving list of audit logs across all cases"""
        # Generate some logs
        self.client.get("/applications/app_clean_approve_001/case-file")
        
        response = self.client.get("/audit-logs")
        self.assertEqual(response.status_code, 200)
        logs = response.json()
        self.assertGreater(len(logs), 0)
        
        # Verify columns are present
        self.assertIn("step_name", logs[0])
        self.assertIn("actor", logs[0])
        self.assertIn("timestamp", logs[0])

if __name__ == "__main__":
    unittest.main()
