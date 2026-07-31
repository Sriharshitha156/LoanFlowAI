import unittest
import sys
import os

# Ensure backend directory is in path for module imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.fairness_check import run_fairness_check

class TestFairnessCheckModule(unittest.TestCase):
    
    def test_case_6_should_flag(self):
        """Case 6: Kofi Mensah (should FLAG due to demographic-biased penalties)"""
        data = {
            "applicant_name": "Kofi Mensah",
            "dti": 0.36,
            "credit_score": 670,
            "income_stability": 80.0,
            "documents_verified": True,
            "zipcode": "90001", # Redlined zipcode in config (-10 points)
            "age": 22           # Under young age threshold of 25 (-5 points)
        }
        
        result = run_fairness_check(data)
        
        # Original Score:
        # Base: 70*0.35 + 75*0.40 + 80*0.25 = 74.5
        # Penalties: -10 (zip) - 5 (age) = -15
        # Original Score = 59.5 -> Verdict: DECLINE
        self.assertEqual(result["original_verdict"], "DECLINE")
        self.assertEqual(result["original_score"], 59.5)
        
        # Masked Score:
        # Demographics removed -> Base = 74.5 -> Verdict: REFER
        self.assertEqual(result["masked_verdict"], "REFER")
        self.assertEqual(result["masked_score"], 74.5)
        
        # Comparison:
        self.assertEqual(result["delta"], 15.0)
        self.assertEqual(result["result"], "FLAG")

    def test_case_1_should_pass(self):
        """Case 1: Sarah Jenkins (should PASS - no bias penalties triggered)"""
        data = {
            "applicant_name": "Sarah Jenkins",
            "dti": 0.22,
            "credit_score": 810,
            "income_stability": 98.0,
            "documents_verified": True,
            "zipcode": "94043", # Safe zipcode
            "age": 35           # Above age threshold
        }
        
        result = run_fairness_check(data)
        
        # Original Score: 98.19 -> Verdict: APPROVE
        self.assertEqual(result["original_verdict"], "APPROVE")
        
        # Masked Score: 98.19 -> Verdict: APPROVE
        self.assertEqual(result["masked_verdict"], "APPROVE")
        
        # Comparison:
        self.assertEqual(result["delta"], 0.0)
        self.assertEqual(result["result"], "PASS")

if __name__ == "__main__":
    unittest.main()
