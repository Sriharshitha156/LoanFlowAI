import { useState, useEffect } from "react";
import { motion } from "framer-motion";

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

  // Status Styling Mappings
  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVE": return "text-[#0F766E] border-[#0F766E]/30 bg-[#0F766E]/5";
      case "REFER": return "text-[#D97706] border-[#D97706]/30 bg-[#D97706]/5";
      case "DECLINE": return "text-[#B91C1C] border-[#B91C1C]/30 bg-[#B91C1C]/5";
      default: return "text-slate-500 border-slate-200 bg-slate-50";
    }
  };

  const getFairnessColor = (result: string) => {
    return result?.toUpperCase() === "PASS"
      ? "text-[#0F766E] border-[#0F766E]/30 bg-[#0F766E]/10"
      : "text-[#D97706] border-[#D97706]/30 bg-[#D97706]/10";
  };

  const getStatusTextClass = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVE": return "text-[#0F766E]";
      case "REFER": return "text-[#D97706]";
      case "DECLINE": return "text-[#B91C1C]";
      default: return "text-slate-600";
    }
  };

  const getStatusBorderClass = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVE": return "border-[#0F766E]";
      case "REFER": return "border-[#D97706]";
      case "DECLINE": return "border-[#B91C1C]";
      default: return "border-slate-300";
    }
  };

  const getStatusBgClass = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVE": return "bg-[#0F766E]/10";
      case "REFER": return "bg-[#D97706]/10";
      case "DECLINE": return "bg-[#B91C1C]/10";
      default: return "bg-slate-100";
    }
  };

  const getStatusIndicatorClass = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVE": return "bg-[#0F766E]";
      case "REFER": return "bg-[#D97706]";
      case "DECLINE": return "bg-[#B91C1C]";
      default: return "bg-slate-400";
    }
  };

  // Actor Color Scheme
  const getActorBadgeClass = (actor: string) => {
    switch (actor?.toUpperCase()) {
      case "SYSTEM": return "text-slate-700 bg-slate-100 border-slate-200";
      case "AGENT": return "text-[#0F766E] bg-[#0F766E]/10 border-[#0F766E]/20";
      case "HUMAN": return "text-[#D97706] bg-[#D97706]/10 border-[#D97706]/20";
      default: return "text-slate-500 bg-slate-50 border-slate-200";
    }
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
    <div className="min-h-screen bg-[#F8F9FA] text-[#0B1B3A] flex flex-col font-sans selection:bg-[#0F766E]/20 selection:text-[#0F766E]">
      {/* Neo-flat Navbar */}
      <header className="border-b border-slate-200 bg-[#0B1B3A] text-white px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-[#0F766E] flex items-center justify-center">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight font-heading">CreditPath — Decisioning</h1>
            <p className="text-[10px] text-slate-300 font-medium tracking-wide">Enterprise Lending Policy & Fairness Audit System</p>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="flex bg-[#0B1B3A]/40 p-1 border border-white/10 rounded">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-1.5 rounded text-xs font-bold cursor-pointer transition-all ${
              activeTab === "dashboard"
                ? "bg-white text-[#0B1B3A]"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Review Queue
          </button>
          <button
            onClick={() => setActiveTab("auditLogs")}
            className={`px-4 py-1.5 rounded text-xs font-bold cursor-pointer transition-all ${
              activeTab === "auditLogs"
                ? "bg-white text-[#0B1B3A]"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Audit Logs
          </button>
        </nav>

        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-[#0F766E]/20 border border-[#0F766E]/40 text-xs text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          <span className="font-bold tracking-wide">SECURE CONNECTED</span>
        </div>
      </header>

      {/* Dynamic Header Statistics Banner */}
      <section className="px-6 pt-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stat 1: Decision Turnaround */}
          <div className="bg-white border border-slate-200 p-5 rounded-lg flex items-center justify-between shadow-sm">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Avg Turnaround Time</span>
              <span className="text-2xl font-extrabold text-[#0B1B3A] tracking-tight">
                {stats.avg_turnaround_mins > 0 
                  ? `${stats.avg_turnaround_mins.toFixed(1)} mins` 
                  : "N/A"}
              </span>
            </div>
            <div className="text-slate-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Stat 2: Straight-Through Rate */}
          <div className="bg-white border border-slate-200 p-5 rounded-lg flex items-center justify-between shadow-sm">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Straight-Through Rate</span>
              <span className="text-2xl font-extrabold text-[#0B1B3A] tracking-tight">
                {stats.straight_through_rate > 0 ? `${stats.straight_through_rate.toFixed(1)}%` : "0.0%"}
              </span>
            </div>
            <div className="text-slate-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          {/* Stat 3: Audit-Pass Rate */}
          <div className="bg-white border border-slate-200 p-5 rounded-lg flex items-center justify-between shadow-sm">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Audit-Pass Rate</span>
              <span className="text-2xl font-extrabold text-[#0B1B3A] tracking-tight">{stats.audit_pass_rate.toFixed(1)}%</span>
            </div>
            <div className="text-slate-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-[#0B1B3A] animate-spin"></div>
          <p className="text-slate-500 font-bold text-xs tracking-wider uppercase">Loading Secure Audit Trails...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="p-4 rounded-lg bg-[#B91C1C]/10 border border-[#B91C1C]/20 text-[#B91C1C]">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-base font-bold tracking-tight">Sync Failure</h2>
          <p className="text-slate-500 text-xs">{error}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 max-w-7xl w-full mx-auto">
          
          {/* TAB 1: Main Dashboard Review Queue */}
          {activeTab === "dashboard" && (
            <>
              {/* Left Column: Applications Selector */}
              <aside className="lg:w-80 flex flex-col gap-4 shrink-0">
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 px-1">Case Review Queue ({apps.length})</h2>
                  <div className="flex flex-col gap-2">
                    {apps.map((app) => {
                      const isSelected = app.id === selectedId;
                      return (
                        <button
                          key={app.id}
                          onClick={() => setSelectedId(app.id)}
                          className={`w-full text-left p-3.5 rounded border transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? "bg-slate-100 border-[#0B1B3A] text-[#0B1B3A] font-bold"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-bold text-sm tracking-tight truncate max-w-[145px] block">{app.applicant_name}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wide border ${getStatusColor(app.status)}`}>
                              {app.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 font-sans">
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
                    <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-xl font-bold tracking-tight text-[#0B1B3A] font-heading">{caseFile.application.applicant_name}</h2>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold uppercase tracking-wide border ${getStatusColor(caseFile.application.status)}`}>
                            {caseFile.application.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-sans">
                          Loan ID: <span className="font-mono text-[#0B1B3A] font-semibold">{caseFile.application.id}</span> • Submission Date: {new Date(caseFile.application.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Grid 1: Application Details & Policy Scores */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Application Card */}
                      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-5 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="font-bold text-sm uppercase tracking-wider text-[#0B1B3A] font-sans">Application File</h3>
                          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm font-sans">
                          <div>
                            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Requested Amount</span>
                            <span className="font-bold text-base text-[#0B1B3A]">${caseFile.application.amount_requested.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Term Length</span>
                            <span className="font-bold text-base text-[#0B1B3A]">{caseFile.application.term_months} Months</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-0.5">Loan Purpose</span>
                            <span className="font-medium text-slate-700">{caseFile.application.purpose}</span>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4 mt-1">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Verification Documents</h4>
                          <div className="flex flex-col gap-2">
                            {caseFile.documents.map((doc) => (
                              <div key={doc.id} className="p-3 rounded bg-slate-50 border border-slate-200 flex justify-between items-center text-xs font-sans">
                                <div>
                                  <span className="font-bold text-[#0B1B3A] block">{doc.type} Verification</span>
                                  <span className="text-[9px] text-slate-500 font-mono">
                                    Extracted: {doc.extracted_fields ? JSON.stringify(doc.extracted_fields) : "No fields"}
                                  </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] tracking-wide border ${
                                  doc.verification_status === "VERIFIED" 
                                    ? "text-[#0F766E] border-[#0F766E]/20 bg-[#0F766E]/5" 
                                    : "text-[#B91C1C] border-[#B91C1C]/20 bg-[#B91C1C]/5"
                                }`}>
                                  {doc.verification_status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Policy Score Panel */}
                      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-5 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="font-bold text-sm uppercase tracking-wider text-[#0B1B3A] font-sans">Policy Risk Assessment</h3>
                          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>

                        <div className="flex flex-col gap-4 font-sans">
                          {/* DTI progress bar with framer motion width animation */}
                          <div>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Debt-to-Income (DTI) Score</span>
                              <span className="text-[#0B1B3A] font-extrabold">{caseFile.policy_score?.debt_to_income ? Math.round(caseFile.policy_score.debt_to_income * 100) : 0}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded bg-slate-100 overflow-hidden">
                              <motion.div 
                                className={`h-full rounded ${getStatusIndicatorClass(caseFile.recommendation?.verdict)}`}
                                initial={{ width: "0%" }}
                                animate={{ width: `${caseFile.policy_score?.debt_to_income ? Math.min(100, Math.round(caseFile.policy_score.debt_to_income * 100)) : 0}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                          </div>

                          {/* Credit history progress bar */}
                          <div>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Credit History Score</span>
                              <span className="text-[#0B1B3A] font-extrabold">{caseFile.policy_score?.credit_history_score}</span>
                            </div>
                            <div className="h-1.5 w-full rounded bg-slate-100 overflow-hidden">
                              <motion.div 
                                className={`h-full rounded ${getStatusIndicatorClass(caseFile.recommendation?.verdict)}`}
                                initial={{ width: "0%" }}
                                animate={{ width: `${caseFile.policy_score?.credit_history_score ? Math.round(((caseFile.policy_score.credit_history_score - 300) / 550) * 100) : 0}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                          </div>

                          {/* Stability rating progress bar */}
                          <div>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Income Stability Rating</span>
                              <span className="text-[#0B1B3A] font-extrabold">{caseFile.policy_score?.income_stability_score}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded bg-slate-100 overflow-hidden">
                              <motion.div 
                                className={`h-full rounded ${getStatusIndicatorClass(caseFile.recommendation?.verdict)}`}
                                initial={{ width: "0%" }}
                                animate={{ width: `${caseFile.policy_score?.income_stability_score}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded bg-slate-50 border border-slate-200 flex items-center justify-between mt-2 font-sans">
                          <div>
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">Composite Score</span>
                            <span className="text-2xl font-extrabold text-[#0B1B3A] tracking-tight">{caseFile.policy_score?.composite_score?.toFixed(1) || "0.0"}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold">Risk Verdict</span>
                            <span className={`text-base font-extrabold uppercase tracking-wider ${getStatusTextClass(caseFile.recommendation?.verdict)}`}>
                              {caseFile.policy_score?.composite_score >= 80 ? "APPROVE" : (caseFile.policy_score?.composite_score >= 60 ? "REFER" : "DECLINE")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Grid 2: AI Recommendation & Fairness Check */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Recommendation Panel */}
                      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="font-bold text-sm uppercase tracking-wider text-[#0B1B3A] font-sans">AI Recommendation</h3>
                          <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-slate-150 text-slate-600 border border-slate-200 font-sans">Claude-3.5-Sonnet</span>
                        </div>

                        <div>
                          {/* Larger, boldest colored recommendation badge fades in staggeredly */}
                          <motion.div 
                            className={`p-4 border rounded mb-3 flex items-center justify-center flex-col gap-1.5 ${getStatusBgClass(caseFile.recommendation?.verdict)} ${getStatusBorderClass(caseFile.recommendation?.verdict)}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6, duration: 0.4 }}
                          >
                            <span className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">Recommended Verdict</span>
                            <span className={`text-3xl font-extrabold uppercase tracking-widest ${getStatusTextClass(caseFile.recommendation?.verdict)}`}>
                              {caseFile.recommendation?.verdict}
                            </span>
                          </motion.div>
                          <p className="text-xs text-slate-600 italic leading-relaxed border-l-2 border-slate-300 pl-3">
                            "{caseFile.recommendation?.reasoning_text}"
                          </p>
                        </div>

                        <div className="mt-1 font-sans">
                          <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold mb-2">Cited Guidelines</span>
                          <div className="flex flex-wrap gap-1.5">
                            {caseFile.recommendation?.cited_rules?.map((rule, idx) => (
                              <span key={idx} className="text-[9px] px-2 py-1 rounded bg-slate-50 text-slate-600 border border-slate-200">
                                {rule}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Fairness Check Panel */}
                      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="font-bold text-sm uppercase tracking-wider text-[#0B1B3A] font-sans">Demographic Fairness Audit</h3>
                          
                          {/* Fairness badge scale/pulse animation */}
                          <motion.span 
                            className={`text-xs px-2.5 py-0.5 rounded font-bold uppercase tracking-wider border ${getFairnessColor(caseFile.fairness_check?.result)}`}
                            animate={{ scale: [1, 1.08, 1] }}
                            transition={{ duration: 0.4, ease: "easeInOut" }}
                          >
                            {caseFile.fairness_check?.result}
                          </motion.span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-center font-sans">
                          <div className="p-3 rounded bg-slate-50 border border-slate-200">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1 font-bold">Original Score</span>
                            <span className="text-xl font-extrabold text-[#0B1B3A]">{caseFile.fairness_check?.original_score?.toFixed(1) || "0.0"}</span>
                          </div>
                          <div className="p-3 rounded bg-slate-50 border border-slate-200">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1 font-bold">Demographic Masked</span>
                            <span className="text-xl font-extrabold text-[#0B1B3A]">{caseFile.fairness_check?.masked_score?.toFixed(1) || "0.0"}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-4 mt-2 font-sans">
                          <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Demographic Delta:</span>
                          <span className={`font-mono font-bold text-sm ${caseFile.fairness_check?.delta > 5 ? "text-[#B91C1C]" : "text-[#0F766E]"}`}>
                            {caseFile.fairness_check?.delta?.toFixed(1) || "0.0"} Points
                          </span>
                        </div>
                        
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                          Rescored with identity parameters (name, address, zipcode, age) stripped.
                          {caseFile.fairness_check?.result === "FLAG" && (
                            <span className="text-[#B91C1C] font-bold block mt-1">⚠️ Warning: Masking shifts the recommendation category. Bias audit triggered.</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Section 4: Human Decision Gate - The One Glass Moment */}
                    <div className="bg-[#0B1B3A]/95 backdrop-blur-md border border-white/10 shadow-[0_0_20px_rgba(15,118,110,0.12)] text-white rounded-lg p-6 flex flex-col gap-4 relative overflow-hidden">
                      <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-2">
                        <div className="h-8 w-8 rounded bg-[#0F766E] flex items-center justify-center text-white">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-bold text-base tracking-tight font-heading">Human Decision Required</h3>
                          <p className="text-[10px] text-slate-300 font-sans uppercase tracking-wider font-bold">Mandatory Underwriter Approval Gate</p>
                        </div>
                      </div>

                      <form onSubmit={handleDecisionSubmit} className="flex flex-col gap-4 font-sans text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Underwriter Credentials ID</label>
                            <input
                              type="text"
                              value={underwriterId}
                              onChange={(e) => setUnderwriterId(e.target.value)}
                              className="w-full bg-[#0B1B3A] border border-white/10 rounded p-3 text-white focus:outline-none focus:border-[#0F766E] font-medium"
                              required
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Final Lending Verdict</label>
                            <select
                              value={finalVerdict}
                              onChange={(e) => setFinalVerdict(e.target.value)}
                              className="w-full bg-[#0B1B3A] border border-white/10 rounded p-3 text-white focus:outline-none focus:border-[#0F766E] font-bold cursor-pointer"
                            >
                              <option value="APPROVE" className="bg-[#0B1B3A]">APPROVE (Green Channel)</option>
                              <option value="REFER" className="bg-[#0B1B3A]">REFER (Manual Review)</option>
                              <option value="DECLINE" className="bg-[#0B1B3A]">DECLINE (Risk Reject)</option>
                            </select>
                          </div>
                        </div>

                        {finalVerdict !== caseFile.recommendation?.verdict && (
                          <div className="flex flex-col gap-1.5 mt-2 animate-fadeIn">
                            <label className="text-[9px] font-bold text-[#D97706] uppercase tracking-wider">Agent Override Justification (Mandatory)</label>
                            <textarea
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              className="w-full bg-[#0B1B3A] border border-[#D97706]/40 rounded p-3 text-white focus:outline-none focus:border-[#D97706] h-20 resize-none"
                              placeholder="Provide compliance justification for overriding the machine recommended decision..."
                              required
                            />
                          </div>
                        )}

                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-3 pt-3 border-t border-white/10">
                          <p className="text-[10px] text-slate-400 leading-relaxed max-w-md">
                            * Note: Signing this form logs an immutable underwriter action record. Overrides are audited for fairness compliance.
                          </p>
                          <button
                            type="submit"
                            disabled={submitting}
                            className="w-full md:w-auto font-bold text-xs bg-[#0F766E] hover:bg-[#0d6861] text-white rounded px-8 py-3.5 shadow transition-all disabled:opacity-50 cursor-pointer uppercase tracking-wider"
                          >
                            {submitting ? "Signing Record..." : "Confirm Final Decision"}
                          </button>
                        </div>

                        {submitMessage && (
                          <div className={`p-4 rounded text-xs border ${
                            submitMessage.type === "success" 
                              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                              : "bg-rose-950/20 border-rose-500/30 text-[#B91C1C]"
                          }`}>
                            {submitMessage.text}
                          </div>
                        )}
                      </form>
                    </div>

                    {/* Section 5: Case Timeline */}
                    <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-4 shadow-sm">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-2">
                        <div className="text-slate-400">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="font-bold text-sm uppercase tracking-wider text-[#0B1B3A] font-sans">Chronological Case Timeline</h3>
                      </div>

                      <div className="relative pl-6 border-l border-slate-200 flex flex-col gap-6 ml-2 font-sans">
                        {auditTrail.map((log) => (
                          <div key={log.id} className="relative text-xs">
                            <span className="absolute -left-[30px] top-1 h-2.5 w-2.5 rounded-full bg-white border-2 border-[#0B1B3A]"></span>
                            <div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1.5">
                                <span className="font-bold text-[#0B1B3A] tracking-wider uppercase">{log.step_name}</span>
                                <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] border ${getActorBadgeClass(log.actor)}`}>
                                  {log.actor}
                                </span>
                                <span className="text-[10px] text-slate-500 sm:ml-auto font-mono">
                                  {formatTimestamp(log.timestamp)}
                                </span>
                              </div>
                              <div className="p-3.5 rounded bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-600 overflow-x-auto leading-relaxed">
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
            <main className="flex-1 flex flex-col gap-6 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-[#0B1B3A] font-heading">Audit Ledger Viewer</h2>
                  <p className="text-xs text-slate-500">Dense compliance review trail across all applications.</p>
                </div>
                
                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto text-xs font-sans">
                  <select
                    value={filterAppId}
                    onChange={(e) => setFilterAppId(e.target.value)}
                    className="bg-white border border-slate-200 rounded p-2 text-[#0B1B3A] focus:outline-none focus:border-[#0B1B3A] w-full sm:w-48 font-bold cursor-pointer"
                  >
                    <option value="">All Case Files</option>
                    {apps.map(app => (
                      <option key={app.id} value={app.id}>{app.applicant_name} ({app.id})</option>
                    ))}
                  </select>
                  
                  <input
                    type="text"
                    value={filterKeyword}
                    onChange={(e) => setFilterKeyword(e.target.value)}
                    placeholder="Filter ledger (actor, payload)..."
                    className="bg-white border border-slate-200 rounded p-2 text-[#0B1B3A] focus:outline-none focus:border-[#0B1B3A] w-full sm:w-56"
                  />
                </div>
              </div>

              {/* Log Table Container */}
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="p-3 w-40 font-mono text-[10px]">Timestamp</th>
                      <th className="p-3 w-36 font-mono text-[10px]">Application ID</th>
                      <th className="p-3 w-40">Step Name</th>
                      <th className="p-3 w-24">Actor</th>
                      <th className="p-3">Log Payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans">
                    {filteredLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          {/* Monospace Timestamp */}
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                            {formatTimestamp(log.timestamp)}
                          </td>
                          {/* Monospace App ID */}
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                            {log.application_id}
                          </td>
                          {/* Step Name */}
                          <td className="p-3 font-bold text-[#0B1B3A] uppercase tracking-wide">
                            {log.step_name}
                          </td>
                          {/* Actor Badge */}
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] border ${getActorBadgeClass(log.actor)}`}>
                              {log.actor}
                            </span>
                          </td>
                          {/* Payload Details */}
                          <td className="p-3">
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-[#0F766E] hover:underline font-bold cursor-pointer flex items-center gap-1 focus:outline-none"
                            >
                              <span>{isExpanded ? "Collapse" : "View JSON payload"}</span>
                              <svg className={`h-3 w-3 transform transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {isExpanded && (
                              <div className="mt-2 p-3.5 rounded bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-600 overflow-x-auto leading-relaxed">
                                <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                          No audit trace logs match current ledger filters.
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
