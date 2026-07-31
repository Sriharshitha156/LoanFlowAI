import { useState, useEffect } from "react";

const API_BASE = "http://localhost:8000";

interface ApplicationSummary {
  id: string;
  applicant_name: string;
  amount_requested: number;
  status: string;
}

interface Document {
  id: string;
  type: string;
  verification_status: string;
  extracted_fields: Record<string, any> | null;
}

interface PolicyScore {
  debt_to_income: number;
  credit_history_score: number;
  income_stability_score: number;
  composite_score: number;
  computed_at: string;
}

interface FairnessCheck {
  original_score: number;
  masked_score: number;
  delta: number;
  result: string;
  checked_at: string;
}

interface Recommendation {
  verdict: string;
  reasoning_text: string;
  cited_rules: string[];
}

interface AuditLog {
  id: string;
  step_name: string;
  actor: string;
  payload: Record<string, any>;
  timestamp: string;
}

interface CaseFile {
  application: {
    id: string;
    applicant_name: string;
    amount_requested: number;
    term_months: number;
    purpose: string;
    submitted_at: string;
    status: string;
  };
  documents: Document[];
  policy_score: PolicyScore;
  fairness_check: FairnessCheck;
  recommendation: Recommendation;
}

function App() {
  const [apps, setApps] = useState<ApplicationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [caseFile, setCaseFile] = useState<CaseFile | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form States
  const [underwriterId, setUnderwriterId] = useState<string>("underwriter_sarah");
  const [finalVerdict, setFinalVerdict] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load applications list
  useEffect(() => {
    fetchApplications();
  }, []);

  // Load application details when selection changes
  useEffect(() => {
    if (selectedId) {
      fetchCaseFile(selectedId);
      fetchAuditTrail(selectedId);
    }
  }, [selectedId]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/applications`);
      if (!res.ok) throw new Error("Failed to fetch applications list");
      const data = await res.json();
      setApps(data);
      if (data.length > 0) {
        setSelectedId(data[0].id);
      }
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  const fetchCaseFile = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/applications/${id}/case-file`);
      if (!res.ok) throw new Error("Failed to fetch case file");
      const data = await res.json();
      setCaseFile(data);
      setFinalVerdict(data.recommendation?.verdict || "APPROVE");
      setOverrideReason("");
      setSubmitMessage(null);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchAuditTrail = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/applications/${id}/audit-trail`);
      if (!res.ok) throw new Error("Failed to fetch audit trail");
      const data = await res.json();
      setAuditTrail(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseFile) return;

    const isOverride = finalVerdict !== caseFile.recommendation?.verdict;
    if (isOverride && !overrideReason.trim()) {
      setSubmitMessage({ type: "error", text: "Override reason is required when differing from AI recommendation." });
      return;
    }

    try {
      setSubmitting(true);
      setSubmitMessage(null);
      const res = await fetch(`${API_BASE}/applications/${selectedId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          underwriter_id: underwriterId,
          final_verdict: finalVerdict,
          override_reason: isOverride ? overrideReason : null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit decision");

      setSubmitMessage({ type: "success", text: "Decision recorded successfully!" });
      // Refresh details
      await fetchCaseFile(selectedId);
      await fetchAuditTrail(selectedId);
      // Refresh list to update status badge
      const listRes = await fetch(`${API_BASE}/applications`);
      if (listRes.ok) {
        setApps(await listRes.json());
      }
    } catch (err: any) {
      setSubmitMessage({ type: "error", text: err.message || "Submission failed" });
    } finally {
      setSubmitting(false);
    }
  };

  // Styles helpers
  const getVerdictColor = (verdict: string) => {
    switch (verdict?.toUpperCase()) {
      case "APPROVE": return "text-emerald-400 border-emerald-500 bg-emerald-950/40";
      case "REFER": return "text-amber-400 border-amber-500 bg-amber-950/40";
      case "DECLINE": return "text-rose-400 border-rose-500 bg-rose-950/40";
      default: return "text-slate-400 border-slate-500 bg-slate-800/40";
    }
  };

  const getVerdictBg = (verdict: string) => {
    switch (verdict?.toUpperCase()) {
      case "APPROVE": return "bg-emerald-500";
      case "REFER": return "bg-amber-500";
      case "DECLINE": return "bg-rose-500";
      default: return "bg-slate-500";
    }
  };

  const getFairnessColor = (result: string) => {
    return result?.toUpperCase() === "PASS" 
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" 
      : "text-rose-400 border-rose-500/30 bg-rose-500/10 animate-pulse";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Sleek Top Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">CreditPath</h1>
            <p className="text-xs text-slate-500 font-medium">Algorithmic Risk & Fairness Auditing Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-slate-400">API Server Connected</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin"></div>
          <p className="text-slate-500 font-medium text-sm">Synchronizing case files...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="p-4 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Synchronization Error</h2>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 max-w-7xl w-full mx-auto">
          {/* Left Column: Applications List Navigation */}
          <aside className="lg:w-80 flex flex-col gap-4 shrink-0">
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 backdrop-blur-md">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 px-2">Applications ({apps.length})</h2>
              <div className="flex flex-col gap-2">
                {apps.map((app) => {
                  const isSelected = app.id === selectedId;
                  return (
                    <button
                      key={app.id}
                      onClick={() => setSelectedId(app.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600/10 border-indigo-500/50 shadow-md shadow-indigo-900/10 text-white"
                          : "bg-slate-900/20 border-slate-900/50 hover:bg-slate-900/50 hover:border-slate-800 text-slate-400"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <span className="font-semibold text-sm truncate max-w-[140px] block">{app.applicant_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${getVerdictColor(app.status)}`}>
                          {app.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Requested: ${app.amount_requested.toLocaleString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Right Column: Case File Display */}
          <main className="flex-1 flex flex-col gap-6">
            {caseFile && (
              <>
                {/* Active Application Header */}
                <div className="bg-slate-900/20 border border-slate-900/50 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 backdrop-blur-md">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold tracking-tight text-white">{caseFile.application.applicant_name}</h2>
                      <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border ${getVerdictColor(caseFile.application.status)}`}>
                        {caseFile.application.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">Case ID: <span className="font-mono text-slate-400">{caseFile.application.id}</span> • Submitted: {new Date(caseFile.application.submitted_at).toLocaleString()}</p>
                  </div>
                </div>

                {/* Grid 1: Application Details & Policy Scores */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Application Card */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-5 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                      <h3 className="font-semibold text-base text-slate-200">Application File</h3>
                      <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500 text-xs block mb-0.5">Requested Amount</span>
                        <span className="font-bold text-lg text-white">${caseFile.application.amount_requested.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs block mb-0.5">Term Length</span>
                        <span className="font-bold text-lg text-white">{caseFile.application.term_months} Months</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500 text-xs block mb-0.5">Loan Purpose</span>
                        <span className="font-medium text-slate-300">{caseFile.application.purpose}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-900 pt-4 mt-1">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Verification Documents</h4>
                      <div className="flex flex-col gap-2">
                        {caseFile.documents.map((doc) => (
                          <div key={doc.id} className="p-3 rounded-xl bg-slate-900/30 border border-slate-900 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-semibold text-slate-300 block">{doc.type} Document</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                Extracted: {doc.extracted_fields ? JSON.stringify(doc.extracted_fields) : "No fields"}
                              </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] tracking-wide border ${
                              doc.verification_status === "VERIFIED" 
                                ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" 
                                : "text-rose-400 border-rose-500/20 bg-rose-500/5 animate-pulse"
                            }`}>
                              {doc.verification_status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Policy Score Panel */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between gap-5 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                      <h3 className="font-semibold text-base text-slate-200">Policy Risk Assessment</h3>
                      <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>

                    <div className="flex flex-col gap-4">
                      {/* Metric 1 */}
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-400 font-medium">Debt-to-Income (DTI) Score</span>
                          <span className="text-white font-bold">{caseFile.policy_score?.debt_to_income ? Math.round(caseFile.policy_score.debt_to_income * 100) : 0}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${caseFile.policy_score?.debt_to_income ? Math.min(100, Math.round(caseFile.policy_score.debt_to_income * 100)) : 0}%` }}></div>
                        </div>
                      </div>

                      {/* Metric 2 */}
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-400 font-medium">Credit History Score</span>
                          <span className="text-white font-bold">{caseFile.policy_score?.credit_history_score}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                          {/* Scale FICO range 300-850 to percentage */}
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${caseFile.policy_score?.credit_history_score ? Math.round(((caseFile.policy_score.credit_history_score - 300) / 550) * 100) : 0}%` }}></div>
                        </div>
                      </div>

                      {/* Metric 3 */}
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-400 font-medium">Income Stability Rating</span>
                          <span className="text-white font-bold">{caseFile.policy_score?.income_stability_score}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                          <div className="h-full bg-pink-500 rounded-full" style={{ width: `${caseFile.policy_score?.income_stability_score}%` }}></div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-900 flex items-center justify-between mt-2">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Composite Score</span>
                        <span className="text-3xl font-extrabold text-white tracking-tight">{caseFile.policy_score?.composite_score?.toFixed(1) || "0.0"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Risk Verdict</span>
                        <span className={`text-xl font-bold uppercase tracking-wider ${
                          caseFile.policy_score?.composite_score >= 80 ? "text-emerald-400" : (caseFile.policy_score?.composite_score >= 60 ? "text-amber-400" : "text-rose-400")
                        }`}>
                          {caseFile.policy_score?.composite_score >= 80 ? "APPROVE" : (caseFile.policy_score?.composite_score >= 60 ? "REFER" : "DECLINE")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid 2: AI Recommendation & Fairness Check */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Recommendation Panel */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between gap-4 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                      <h3 className="font-semibold text-base text-slate-200">AI Policy Recommendation</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-slate-950 text-indigo-400 border border-indigo-500/20">Claude-Sonnet</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${getVerdictBg(caseFile.recommendation?.verdict)}`}></span>
                        <span className="text-sm font-bold uppercase tracking-wide text-white">Recommended Verdict: {caseFile.recommendation?.verdict}</span>
                      </div>
                      <p className="text-sm text-slate-300 italic leading-relaxed border-l-2 border-indigo-500/40 pl-3">
                        "{caseFile.recommendation?.reasoning_text}"
                      </p>
                    </div>

                    <div className="mt-2">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-2">Cited Policy Guidelines</span>
                      <div className="flex flex-wrap gap-1.5">
                        {caseFile.recommendation?.cited_rules?.map((rule, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-1 rounded bg-slate-950 text-slate-400 border border-slate-900">
                            {rule}
                          </span>
                        ))}
                        {(!caseFile.recommendation?.cited_rules || caseFile.recommendation.cited_rules.length === 0) && (
                          <span className="text-xs text-slate-500 italic">No specific rules cited.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fairness Check Panel */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between gap-4 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                      <h3 className="font-semibold text-base text-slate-200">Demographic Fairness Check</h3>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${getFairnessColor(caseFile.fairness_check?.result)}`}>
                        {caseFile.fairness_check?.result}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-900/50">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1 font-bold">Original Score</span>
                        <span className="text-2xl font-bold text-white">{caseFile.fairness_check?.original_score?.toFixed(1) || "0.0"}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-900/50">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1 font-bold">Demographic Masked</span>
                        <span className="text-2xl font-bold text-white">{caseFile.fairness_check?.masked_score?.toFixed(1) || "0.0"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs border-t border-slate-900 pt-4 mt-2">
                      <span className="text-slate-400">Demographic Bias Delta:</span>
                      <span className={`font-mono font-bold text-sm ${caseFile.fairness_check?.delta > 5 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
                        {caseFile.fairness_check?.delta?.toFixed(1) || "0.0"} Points
                      </span>
                    </div>
                    {caseFile.fairness_check?.result === "FLAG" && (
                      <p className="text-[10px] text-rose-400 leading-relaxed bg-rose-950/10 border border-rose-900/30 p-2 rounded-lg">
                        ⚠️ **Warning**: Masking demographic factors shifts the final lending verdict category. Potential proxy-variable bias flagged!
                      </p>
                    )}
                  </div>
                </div>

                {/* Section 4: Human Decision Gate */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4 backdrop-blur-md">
                  <div className="flex items-center gap-3 border-b border-slate-900 pb-3 mb-2">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-base text-slate-200">Underwriter Decision Gate</h3>
                  </div>

                  <form onSubmit={handleDecisionSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Underwriter ID */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Underwriter Sign-off ID</label>
                        <input
                          type="text"
                          value={underwriterId}
                          onChange={(e) => setUnderwriterId(e.target.value)}
                          className="w-full text-sm bg-slate-950 border border-slate-900 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500/50"
                          placeholder="Enter your credential code"
                          required
                        />
                      </div>

                      {/* Final Verdict */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Final Lending Verdict</label>
                        <select
                          value={finalVerdict}
                          onChange={(e) => setFinalVerdict(e.target.value)}
                          className="w-full text-sm bg-slate-950 border border-slate-900 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                        >
                          <option value="APPROVE">APPROVE (Green Channel)</option>
                          <option value="REFER">REFER (Manual Underwriting)</option>
                          <option value="DECLINE">DECLINE (Risk Reject)</option>
                        </select>
                      </div>
                    </div>

                    {/* Conditional Override Reason */}
                    {finalVerdict !== caseFile.recommendation?.verdict && (
                      <div className="flex flex-col gap-1.5 mt-2 animate-fadeIn">
                        <label className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Agent Override Justification (Required)</label>
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          className="w-full text-sm bg-slate-950 border border-rose-900/30 rounded-xl p-3 text-white focus:outline-none focus:border-rose-500/50 h-20 resize-none"
                          placeholder="Provide audit-trail reasoning for overriding the AI recommend verdict..."
                          required
                        />
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-3 pt-3 border-t border-slate-900">
                      <p className="text-xs text-slate-500 leading-relaxed max-w-md">
                        ⚠️ **Compliance Note**: Submitting marks the case as resolved. Decisions overriding agent recommendation are subject to compliance fairness audits.
                      </p>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full md:w-auto font-semibold text-sm bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl px-8 py-3.5 shadow-lg shadow-indigo-500/10 cursor-pointer hover:shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {submitting ? "Signing Record..." : "Confirm Final Sign-off"}
                      </button>
                    </div>

                    {submitMessage && (
                      <div className={`p-4 rounded-xl text-xs border ${
                        submitMessage.type === "success" 
                          ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                          : "bg-rose-950/20 border-rose-500/30 text-rose-400"
                      }`}>
                        {submitMessage.text}
                      </div>
                    )}
                  </form>
                </div>

                {/* Section 5: Chronological Audit Trail */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4 backdrop-blur-md">
                  <div className="flex items-center gap-3 border-b border-slate-900 pb-3 mb-2">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-base text-slate-200">Chronological Pipeline Audit Trail</h3>
                  </div>

                  <div className="relative pl-6 border-l border-slate-900 flex flex-col gap-6 ml-3">
                    {auditTrail.map((log) => (
                      <div key={log.id} className="relative group">
                        {/* Circle badge indicator */}
                        <span className="absolute -left-[30px] top-1 h-3 w-3 rounded-full bg-slate-950 border-2 border-indigo-500 flex items-center justify-center group-hover:scale-125 transition-transform duration-200"></span>
                        
                        <div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-indigo-400 tracking-wide font-mono uppercase">{log.step_name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-950 text-slate-500 border border-slate-900 w-fit">
                              Actor: {log.actor}
                            </span>
                            <span className="text-[10px] text-slate-600 font-medium sm:ml-auto">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          
                          <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-900 text-xs font-mono text-slate-400 leading-relaxed overflow-x-auto">
                            {JSON.stringify(log.payload, null, 2)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {auditTrail.length === 0 && (
                      <p className="text-xs text-slate-500 italic py-2 pl-2">No audit log records stored yet.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
