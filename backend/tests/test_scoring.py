import unittest
import sys
import os

# Ensure backend directory is in path for module imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.scoring_engine import score_application

class TestPolicyScoringEngine(unittest.TestCase):
    
    def test_case_1_clean_approve(self):
        """Case 1: Sarah Jenkins (Clean Approve - strong financials and credit)"""
        data = {
            "dti": 0.22,
            "credit_score": 810,
            "income_stability": 98.0,
            "documents_verified": True
        }
        result = score_application(data)
        
        # Calculations:
        # DTI = 0.22 -> DTI Score = 100 - (0.02 / 0.16 * 30) = 96.25
        # Credit Score = 810 -> Credit Score = 100.0
        # Income Stability = 98.0 -> Stability Score = 98.0
        # Composite = 96.25*0.35 + 100*0.40 + 98*0.25 = 33.6875 + 40 + 24.5 = 98.19
        self.assertEqual(result["verdict"], "APPROVE")
        self.assertGreaterEqual(result["composite_score"], 80.0)
        self.assertEqual(result["credit_score"], 100.0)
        self.assertEqual(result["income_stability_score"], 98.0)

    def test_case_2_borderline_refer(self):
        """Case 2: Marcus Brody (Borderline Refer - mixed history)"""
        data = {
            "dti": 0.38,
            "credit_score": 640,
            "income_stability": 65.0,
            "documents_verified": True
        }
        result = score_application(data)
        
        # Calculations:
        # DTI = 0.38 -> DTI Score = 70 - (0.02 / 0.09 * 30) = 63.33
        # Credit Score = 640 -> Credit Score = 60.0
        # Income Stability = 65.0 -> Stability Score = 65.0
        # Composite = 63.33*0.35 + 60*0.40 + 65*0.25 = 22.17 + 24.0 + 16.25 = 62.42
        self.assertEqual(result["verdict"], "REFER")
        self.assertGreaterEqual(result["composite_score"], 60.0)
        self.assertLess(result["composite_score"], 80.0)

    def test_case_3_clear_decline(self):
        """Case 3: Robert Vance (Clear Decline - high DTI, poor credit)"""
        data = {
            "dti": 0.58,
            "credit_score": 490,
            "income_stability": 30.0,
            "documents_verified": True
        }
        result = score_application(data)
        
        # Calculations:
        # DTI = 0.58 -> DTI Score = 40 - (0.13 / 0.15 * 40) = 5.33
        # Credit Score = 490 -> Credit Score = 10.0
        # Income Stability = 30.0 -> Stability Score = 30.0
        # Composite = 5.33*0.35 + 10*0.40 + 30*0.25 = 1.87 + 4.0 + 7.5 = 13.37
        self.assertEqual(result["verdict"], "DECLINE")
        self.assertLess(result["composite_score"], 60.0)

    def test_case_4_thin_file(self):
        """Case 4: Emily Zhang (Thin File - strong financials but zero credit history)"""
        data = {
            "dti": 0.12,
            "credit_score": 0, # Thin-file
            "income_stability": 85.0,
            "documents_verified": True
        }
        result = score_application(data)
        
        # Calculations:
        # DTI = 0.12 -> DTI Score = 100.0
        # Credit Score = 0 (Thin File) -> Credit Score = 50.0
        # Income Stability = 85.0 -> Stability Score = 85.0
        # Composite = 100*0.35 + 50*0.40 + 85*0.25 = 35 + 20 + 21.25 = 76.25
        self.assertEqual(result["verdict"], "REFER")
        self.assertGreaterEqual(result["composite_score"], 60.0)
        self.assertLess(result["composite_score"], 80.0)

    def test_case_5_missing_document(self):
        """Case 5: Daniel Craig (Missing Document - good scoring, but capped due to unverified docs)"""
        data = {
            "dti": 0.30,
            "credit_score": 720,
            "income_stability": 90.0,
            "documents_verified": False # Penalty Triggered
        }
        result = score_application(data)
        
        # Calculations:
        # DTI = 0.30 -> DTI Score = 100 - (0.10 / 0.16 * 30) = 81.25
        # Credit Score = 720 -> Credit Score = 90.0
        # Income Stability = 90.0 -> Stability Score = 90.0
        # Composite before penalty = 81.25*0.35 + 90*0.40 + 90*0.25 = 28.44 + 36.0 + 22.5 = 86.94
        # Capped because docs_verified is False to: 59.0
        self.assertEqual(result["verdict"], "DECLINE") # Threshold for Decline is < 60
        self.assertEqual(result["composite_score"], 59.0)

    def test_case_6_fairness_flag(self):
        """Case 6: Kofi Mensah (Fairness Flag - borderline credit file)"""
        data = {
            "dti": 0.36,
            "credit_score": 670,
            "income_stability": 80.0,
            "documents_verified": True
        }
        result = score_application(data)
        
        # Calculations:
        # DTI = 0.36 -> DTI Score = 70.0
        # Credit Score = 670 -> Credit Score = 75.0
        # Income Stability = 80.0 -> Stability Score = 80.0
        # Composite = 70*0.35 + 75*0.40 + 80*0.25 = 24.5 + 30.0 + 20.0 = 74.5
        self.assertEqual(result["verdict"], "REFER")
        self.assertGreaterEqual(result["composite_score"], 60.0)
        self.assertLess(result["composite_score"], 80.0)

if __name__ == "__main__":
    unittest.main()
