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
  application_id: string;
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

interface DashboardStats {
  avg_turnaround_mins: number;
  straight_through_rate: number;
  audit_pass_rate: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "auditLogs">("dashboard");
  const [apps, setApps] = useState<ApplicationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [caseFile, setCaseFile] = useState<CaseFile | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Stats State
  const [stats, setStats] = useState<DashboardStats>({
    avg_turnaround_mins: 0,
    straight_through_rate: 0,
    audit_pass_rate: 100
  });

  // Global Audit Logs State
  const [allLogs, setAllLogs] = useState<AuditLog[]>([]);
  const [filterAppId, setFilterAppId] = useState<string>("");
  const [filterKeyword, setFilterKeyword] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Form States
  const [underwriterId, setUnderwriterId] = useState<string>("underwriter_sarah");
  const [finalVerdict, setFinalVerdict] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch case details when selection changes
  useEffect(() => {
    if (selectedId && activeTab === "dashboard") {
      fetchCaseFile(selectedId);
      fetchAuditTrail(selectedId);
    }
  }, [selectedId, activeTab]);

  // Fetch all logs when entering Audit Logs view or changing filters
  useEffect(() => {
    if (activeTab === "auditLogs") {
      fetchAllLogs(filterAppId);
    }
  }, [activeTab, filterAppId]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/applications`);
      if (!res.ok) throw new Error("Failed to fetch applications list");
      const data = await res.json();
      setApps(data);
      if (data.length > 0) {
        setSelectedId(data[0].id);
      }
      await fetchStats();
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`);
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
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

  const fetchAllLogs = async (appId?: string) => {
    try {
      const url = appId ? `${API_BASE}/audit-logs?application_id=${appId}` : `${API_BASE}/audit-logs`;
      const res = await fetch(url);
      if (res.ok) {
        setAllLogs(await res.json());
      }
    } catch (err) {
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
      
      // Refresh Stats, Case file, and List
      await fetchStats();
      await fetchCaseFile(selectedId);
      await fetchAuditTrail(selectedId);
      
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

  // Format Helper for timestamps
  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return isoStr;
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

  const getActorColor = (actor: string) => {
    switch (actor?.toUpperCase()) {
      case "SYSTEM": return "text-purple-400 border-purple-500/20 bg-purple-500/5";
      case "AGENT": return "text-indigo-400 border-indigo-500/20 bg-indigo-500/5";
      case "HUMAN": return "text-amber-400 border-amber-500/20 bg-amber-500/5";
      default: return "text-slate-400 border-slate-500/20 bg-slate-500/5";
    }
  };

  const getFairnessColor = (result: string) => {
    return result?.toUpperCase() === "PASS" 
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" 
      : "text-rose-400 border-rose-500/30 bg-rose-500/10 animate-pulse";
  };

  // Filter logs locally based on text keyword search
  const filteredLogs = allLogs.filter(log => {
    if (!filterKeyword) return true;
    const kw = filterKeyword.toLowerCase();
    return (
      log.step_name.toLowerCase().includes(kw) ||
      log.actor.toLowerCase().includes(kw) ||
      JSON.stringify(log.payload).toLowerCase().includes(kw) ||
      log.application_id.toLowerCase().includes(kw)
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navbar */}
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
        
        {/* Navigation Tabs */}
        <nav className="flex bg-slate-900/60 p-1 border border-slate-900 rounded-xl">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer transition-all ${
              activeTab === "dashboard"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Review Queue
          </button>
          <button
            onClick={() => setActiveTab("auditLogs")}
            className={`px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer transition-all ${
              activeTab === "auditLogs"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Audit Logs
          </button>
        </nav>

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="text-slate-400">API Connected</span>
        </div>
      </header>

      {/* Dynamic Header Statistics Banner */}
      <section className="bg-slate-950 px-6 pt-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stat 1: Decision Turnaround */}
          <div className="bg-slate-900/20 border border-slate-900/60 p-5 rounded-2xl flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Avg Turnaround Time</span>
              <span className="text-2xl font-extrabold text-white tracking-tight">
                {stats.avg_turnaround_mins > 0 
                  ? `${stats.avg_turnaround_mins.toFixed(1)} mins` 
                  : "N/A"}
              </span>
            </div>
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Stat 2: Straight-Through Rate */}
          <div className="bg-slate-900/20 border border-slate-900/60 p-5 rounded-2xl flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Straight-Through Rate</span>
              <span className="text-2xl font-extrabold text-white tracking-tight">
                {stats.straight_through_rate > 0 ? `${stats.straight_through_rate.toFixed(1)}%` : "0.0%"}
              </span>
            </div>
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          {/* Stat 3: Audit-Pass Rate */}
          <div className="bg-slate-900/20 border border-slate-900/60 p-5 rounded-2xl flex items-center justify-between backdrop-blur-md">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Audit-Pass Rate</span>
              <span className="text-2xl font-extrabold text-white tracking-tight">{stats.audit_pass_rate.toFixed(1)}%</span>
            </div>
            <div className="h-10 w-10 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin"></div>
          <p className="text-slate-500 font-medium text-sm">Syncing pipeline databases...</p>
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
          
          {/* TAB 1: Main Dashboard Review Queue */}
          {activeTab === "dashboard" && (
            <>
              {/* Left Column: Applications Selector */}
              <aside className="lg:w-80 flex flex-col gap-4 shrink-0">
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 backdrop-blur-md">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 px-2">Applications ({apps.length})</h2>
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
                              <div key={doc.id} className="p-3 rounded-xl bg-slate-950/20 border border-slate-900 flex justify-between items-center text-xs">
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
                          <div>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-slate-400 font-medium">Debt-to-Income (DTI) Score</span>
                              <span className="text-white font-bold">{caseFile.policy_score?.debt_to_income ? Math.round(caseFile.policy_score.debt_to_income * 100) : 0}%</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${caseFile.policy_score?.debt_to_income ? Math.min(100, Math.round(caseFile.policy_score.debt_to_income * 100)) : 0}%` }}></div>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-slate-400 font-medium">Credit History Score</span>
                              <span className="text-white font-bold">{caseFile.policy_score?.credit_history_score}</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${caseFile.policy_score?.credit_history_score ? Math.round(((caseFile.policy_score.credit_history_score - 300) / 550) * 100) : 0}%` }}></div>
                            </div>
                          </div>

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
                          <h3 className="font-semibold text-base text-slate-200">AI Recommendation</h3>
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
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-2">Cited Guidelines</span>
                          <div className="flex flex-wrap gap-1.5">
                            {caseFile.recommendation?.cited_rules?.map((rule, idx) => (
                              <span key={idx} className="text-[10px] px-2 py-1 rounded bg-slate-950 text-slate-400 border border-slate-900">
                                {rule}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Fairness Check Panel */}
                      <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between gap-4 backdrop-blur-md">
                        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                          <h3 className="font-semibold text-base text-slate-200">Fairness Auditing</h3>
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
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1 font-bold">Masked Score</span>
                            <span className="text-2xl font-bold text-white">{caseFile.fairness_check?.masked_score?.toFixed(1) || "0.0"}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs border-t border-slate-900 pt-4 mt-2">
                          <span className="text-slate-400">Demographic Delta:</span>
                          <span className={`font-mono font-bold text-sm ${caseFile.fairness_check?.delta > 5 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
                            {caseFile.fairness_check?.delta?.toFixed(1) || "0.0"} Points
                          </span>
                        </div>
                        {caseFile.fairness_check?.result === "FLAG" && (
                          <p className="text-[10px] text-rose-400 leading-relaxed bg-rose-950/10 border border-rose-900/30 p-2 rounded-lg">
                            ⚠️ **Warning**: Masking demographic markers shifts the verdict. Potential bias flagged.
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
                        <h3 className="font-semibold text-base text-slate-200">Human Decision Gate</h3>
                      </div>

                      <form onSubmit={handleDecisionSubmit} className="flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Underwriter ID</label>
                            <input
                              type="text"
                              value={underwriterId}
                              onChange={(e) => setUnderwriterId(e.target.value)}
                              className="w-full text-sm bg-slate-950 border border-slate-900 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500/50"
                              required
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Final Verdict</label>
                            <select
                              value={finalVerdict}
                              onChange={(e) => setFinalVerdict(e.target.value)}
                              className="w-full text-sm bg-slate-950 border border-slate-900 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                            >
                              <option value="APPROVE">APPROVE (Green Channel)</option>
                              <option value="REFER">REFER (Manual Review)</option>
                              <option value="DECLINE">DECLINE (Risk Reject)</option>
                            </select>
                          </div>
                        </div>

                        {finalVerdict !== caseFile.recommendation?.verdict && (
                          <div className="flex flex-col gap-1.5 mt-2 animate-fadeIn">
                            <label className="text-xs font-bold text-rose-400 uppercase tracking-wider">Agent Override Justification (Required)</label>
                            <textarea
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              className="w-full text-sm bg-slate-950 border border-rose-900/30 rounded-xl p-3 text-white focus:outline-none focus:border-rose-500/50 h-20 resize-none"
                              placeholder="Provide audit reasoning for overriding the AI recommendation..."
                              required
                            />
                          </div>
                        )}

                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-3 pt-3 border-t border-slate-900">
                          <p className="text-xs text-slate-500 leading-relaxed max-w-md">
                            ⚠️ Decisions overriding AI recommendations are logged for validation compliance.
                          </p>
                          <button
                            type="submit"
                            disabled={submitting}
                            className="w-full md:w-auto font-bold text-sm bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl px-8 py-3.5 shadow-lg shadow-indigo-500/10 cursor-pointer hover:shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                          >
                            {submitting ? "Signing Record..." : "Confirm Final Decision"}
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

                    {/* Section 5: Case Timeline */}
                    <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 flex flex-col gap-4 backdrop-blur-md">
                      <div className="flex items-center gap-3 border-b border-slate-900 pb-3 mb-2">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-base text-slate-200">Chronological Event Timeline</h3>
                      </div>

                      <div className="relative pl-6 border-l border-slate-900 flex flex-col gap-6 ml-3">
                        {auditTrail.map((log) => (
                          <div key={log.id} className="relative group text-xs">
                            <span className="absolute -left-[30px] top-1 h-3 w-3 rounded-full bg-slate-950 border-2 border-indigo-500 flex items-center justify-center"></span>
                            <div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                                <span className="font-bold text-indigo-400 tracking-wide font-mono uppercase">{log.step_name}</span>
                                <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] border ${getActorColor(log.actor)}`}>
                                  {log.actor}
                                </span>
                                <span className="text-[10px] text-slate-600 sm:ml-auto font-mono">
                                  {formatTimestamp(log.timestamp)}
                                </span>
                              </div>
                              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-900/60 font-mono text-slate-400 overflow-x-auto leading-relaxed">
                                {JSON.stringify(log.payload, null, 2)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </main>
            </>
          )}

          {/* TAB 2: Dense plainer Audit Log Viewer Page */}
          {activeTab === "auditLogs" && (
            <main className="flex-1 flex flex-col gap-6 bg-slate-900/20 border border-slate-900/60 rounded-2xl p-6 backdrop-blur-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-900 pb-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">Audit Log Trace System</h2>
                  <p className="text-xs text-slate-500">Read-only plainer audit trails across all lending operations.</p>
                </div>
                
                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto text-xs">
                  {/* Select Application */}
                  <select
                    value={filterAppId}
                    onChange={(e) => setFilterAppId(e.target.value)}
                    className="bg-slate-950 border border-slate-900 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500/50 w-full sm:w-48 cursor-pointer"
                  >
                    <option value="">All Applications</option>
                    {apps.map(app => (
                      <option key={app.id} value={app.id}>{app.applicant_name} ({app.id})</option>
                    ))}
                  </select>
                  
                  {/* Keyword Filter */}
                  <input
                    type="text"
                    value={filterKeyword}
                    onChange={(e) => setFilterKeyword(e.target.value)}
                    placeholder="Search logs (keyword, actor, step)..."
                    className="bg-slate-950 border border-slate-900 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500/50 w-full sm:w-56"
                  />
                </div>
              </div>

              {/* Log Table Container */}
              <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/20">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-900">
                      <th className="p-3 w-40 font-mono">Timestamp</th>
                      <th className="p-3 w-40 font-mono">Application ID</th>
                      <th className="p-3 w-40">Step Name</th>
                      <th className="p-3 w-28">Actor</th>
                      <th className="p-3">Log Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-sans">
                    {filteredLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <tr key={log.id} className="hover:bg-slate-900/10 transition-colors">
                          {/* Monospace Timestamp */}
                          <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                            {formatTimestamp(log.timestamp)}
                          </td>
                          {/* Monospace App ID */}
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                            {log.application_id}
                          </td>
                          {/* Step Name */}
                          <td className="p-3 font-bold text-slate-300">
                            {log.step_name}
                          </td>
                          {/* Actor Badge */}
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] border ${getActorColor(log.actor)}`}>
                              {log.actor}
                            </span>
                          </td>
                          {/* Payload Details */}
                          <td className="p-3">
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline underline-offset-2 flex items-center gap-1 focus:outline-none"
                            >
                              <span>{isExpanded ? "Collapse" : "Expand JSON payload"}</span>
                              <svg className={`h-3 w-3 transform transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {isExpanded && (
                              <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-900 font-mono text-[11px] text-slate-400 overflow-x-auto leading-relaxed">
                                <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                          No audit trace logs match current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </main>
          )}

        </div>
      )}
    </div>
  );
}

export default App;
