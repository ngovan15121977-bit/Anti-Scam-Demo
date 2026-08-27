import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CheckCircle2,
  Cpu,
  Loader2,
  Mic,
  Navigation,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  MessageSquare,
} from "lucide-react";
import axiosInstance from "@/services/api/axios";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type AgentId = "guardian" | "stt" | "manager" | "chat" | "navigator";

type AgentCard = {
  agent_id: AgentId;
  label: string;
  enabled: boolean;
  model: string | null;
  prompt_version: string | null;
  api_key_configured: boolean;
  updated_at: string | null;
  note: string | null;
  config: Record<string, unknown>;
};

type AgentsConfigResponse = {
  agents: AgentCard[];
  prompt_versions: Record<string, string[]>;
};

type PolicySettings = {
  auto_block: boolean;
  ai_intervention: boolean;
  notify_admin: boolean;
  risk_threshold: number;
  daily_limit: number;
};

const AGENT_ICONS: Record<AgentId, React.ReactNode> = {
  guardian: <Shield className="h-4 w-4" />,
  stt: <Mic className="h-4 w-4" />,
  manager: <Bot className="h-4 w-4" />,
  chat: <MessageSquare className="h-4 w-4" />,
  navigator: <Navigation className="h-4 w-4" />,
};

/* -------------------------------------------------------------------------- */
/* Small UI helpers                                                           */
/* -------------------------------------------------------------------------- */

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-[0_0.75rem_1.5rem_rgba(18,38,63,0.03)]">
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <div
        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-xs font-medium text-slate-600">{children}</label>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Main tab                                                                   */
/* -------------------------------------------------------------------------- */

export default function AgentsManagementTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AgentId>("guardian");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [toast, setToast] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["admin-agents-config"],
    queryFn: async () =>
      (await axiosInstance.get<AgentsConfigResponse>("/v1/admin/agents/config")).data,
  });

  const policyQuery = useQuery({
    queryKey: ["admin-agents-policy"],
    queryFn: async () =>
      (await axiosInstance.get<PolicySettings>("/v1/admin/agents/policy")).data,
  });

  const agents = configQuery.data?.agents ?? [];
  const promptVersions = configQuery.data?.prompt_versions ?? {};
  const current = useMemo(
    () => agents.find((a) => a.agent_id === selected) ?? null,
    [agents, selected],
  );

  useEffect(() => {
    if (current) {
      setDraft({ ...current.config, note: current.note ?? "" });
    }
  }, [current?.agent_id, current?.updated_at, current?.config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(draft)) {
        if (v !== undefined && v !== null && k !== "note") body[k] = v;
      }
      if (typeof draft.note === "string") body.note = draft.note;
      return (await axiosInstance.put(`/v1/admin/agents/${selected}`, body)).data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-agents-config"] });
      setToast("Đã lưu cấu hình agent");
      setTimeout(() => setToast(null), 2500);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () =>
      (await axiosInstance.post(`/v1/admin/agents/${selected}/reset`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-agents-config"] });
      setToast("Đã khôi phục mặc định");
      setTimeout(() => setToast(null), 2500);
    },
  });

  const [policyDraft, setPolicyDraft] = useState<PolicySettings | null>(null);
  useEffect(() => {
    if (policyQuery.data) setPolicyDraft(policyQuery.data);
  }, [policyQuery.data]);

  const policyMutation = useMutation({
    mutationFn: async (body: Partial<PolicySettings>) =>
      (await axiosInstance.put<PolicySettings>("/v1/admin/agents/policy", body)).data,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["admin-agents-policy"] });
      setPolicyDraft(data);
      setToast("Đã lưu chính sách anti-scam");
      setTimeout(() => setToast(null), 2500);
    },
  });

  const setField = (key: string, value: unknown) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải cấu hình 5 agent…
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Không tải được cấu hình agent. Kiểm tra API <code>/v1/admin/agents/config</code> và quyền admin.
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => void configQuery.refetch()}
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed right-4 top-20 z-50 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow">
          <CheckCircle2 className="h-4 w-4" /> {toast}
        </div>
      )}

      {/* Overview cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {agents.map((agent) => {
          const active = agent.agent_id === selected;
          return (
            <button
              key={agent.agent_id}
              type="button"
              onClick={() => setSelected(agent.agent_id)}
              className={`rounded-lg border p-3 text-left transition ${
                active
                  ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  {AGENT_ICONS[agent.agent_id]}
                </span>
                <StatusBadge
                  ok={agent.enabled}
                  label={agent.enabled ? "ON" : "OFF"}
                />
              </div>
              <p className="text-xs font-semibold text-slate-800 line-clamp-2">{agent.label}</p>
              <p className="mt-1 truncate text-[11px] text-slate-400">
                {agent.model || "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <StatusBadge
                  ok={agent.api_key_configured}
                  label={agent.api_key_configured ? "Key OK" : "Thiếu key"}
                />
                {agent.prompt_version && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    v{agent.prompt_version}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail form */}
      {current && (
        <Card
          title={current.label}
          subtitle={`agent_id = ${current.agent_id}`}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void configQuery.refetch()}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                title="Làm mới"
              >
                <RefreshCw className={`h-4 w-4 ${configQuery.isFetching ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                disabled={resetMutation.isPending}
                onClick={() => {
                  if (window.confirm("Khôi phục cấu hình mặc định từ env/Settings?")) {
                    resetMutation.mutate();
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Lưu
              </button>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            {/* Enabled */}
            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 md:col-span-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Bật agent</p>
                <p className="text-[11px] text-slate-400">
                  Tắt → hệ thống fail-closed (Guardian/Manager) hoặc bỏ qua (Navigator/Chat)
                </p>
              </div>
              <Toggle
                checked={Boolean(draft.enabled)}
                onChange={(v) => setField("enabled", v)}
              />
            </div>

            {/* Model */}
            {"model" in draft && (
              <div>
                <FieldLabel hint="Để trống sẽ fallback GROQ_*">Model</FieldLabel>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={String(draft.model ?? "")}
                  onChange={(e) => setField("model", e.target.value)}
                  placeholder="llama-3.1-8b-instant"
                />
              </div>
            )}

            {/* Prompt version */}
            {"prompt_version" in (current.config || {}) && (
              <div>
                <FieldLabel>Prompt version</FieldLabel>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={String(draft.prompt_version ?? "")}
                  onChange={(e) => setField("prompt_version", e.target.value)}
                >
                  {(promptVersions[selected === "manager" ? "manager" : "guardian"] || []).map(
                    (v) => (
                      <option key={v} value={v}>
                        v{v}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}

            {/* Temperature */}
            {"temperature" in (current.config || {}) && (
              <div>
                <FieldLabel>
                  Temperature{" "}
                  <span className="font-bold text-blue-600">
                    {Number(draft.temperature ?? 0).toFixed(2)}
                  </span>
                </FieldLabel>
                <input
                  type="range"
                  min={0}
                  max={selected === "chat" ? 2 : 1}
                  step={0.05}
                  value={Number(draft.temperature ?? 0)}
                  onChange={(e) => setField("temperature", parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            )}

            {/* Max tokens */}
            {"max_completion_tokens" in (current.config || {}) && (
              <div>
                <FieldLabel>Max completion tokens</FieldLabel>
                <input
                  type="number"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={Number(draft.max_completion_tokens ?? 0)}
                  onChange={(e) => setField("max_completion_tokens", parseInt(e.target.value || "0", 10))}
                />
              </div>
            )}

            {/* Guardian-only */}
            {selected === "guardian" && (
              <div>
                <FieldLabel hint="Giây giữa 2 lần gọi agent">Min interval (s)</FieldLabel>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={60}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                  value={Number(draft.min_interval_seconds ?? 6)}
                  onChange={(e) =>
                    setField("min_interval_seconds", parseFloat(e.target.value || "0"))
                  }
                />
              </div>
            )}

            {/* Manager-only */}
            {selected === "manager" && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Use LLM</p>
                    <p className="text-[11px] text-slate-400">Tắt = deterministic only</p>
                  </div>
                  <Toggle
                    checked={Boolean(draft.use_llm)}
                    onChange={(v) => setField("use_llm", v)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Phase 3</p>
                    <p className="text-[11px] text-slate-400">Memory / RAG / multi-step</p>
                  </div>
                  <Toggle
                    checked={Boolean(draft.phase3)}
                    onChange={(v) => setField("phase3", v)}
                  />
                </div>
              </>
            )}

            {/* Chat-only */}
            {selected === "chat" && (
              <>
                <div>
                  <FieldLabel>History limit</FieldLabel>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    value={Number(draft.history_limit ?? 40)}
                    onChange={(e) => setField("history_limit", parseInt(e.target.value || "1", 10))}
                  />
                </div>
                <div>
                  <FieldLabel>Context exchanges</FieldLabel>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    value={Number(draft.context_exchanges ?? 3)}
                    onChange={(e) =>
                      setField("context_exchanges", parseInt(e.target.value || "0", 10))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>Retention days</FieldLabel>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    value={Number(draft.retention_days ?? 90)}
                    onChange={(e) => setField("retention_days", parseInt(e.target.value || "1", 10))}
                  />
                </div>
                <div>
                  <FieldLabel hint="Đổi để invalidate cache chat">Cache version</FieldLabel>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    value={String(draft.cache_version ?? "v2")}
                    onChange={(e) => setField("cache_version", e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Note */}
            <div className="md:col-span-2">
              <FieldLabel>Ghi chú admin</FieldLabel>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                value={String(draft.note ?? "")}
                onChange={(e) => setField("note", e.target.value)}
                placeholder="Lý do thay đổi cấu hình…"
              />
            </div>

            {/* Key status (read-only) */}
            <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Cpu className="h-4 w-4 shrink-0" />
              API key:{" "}
              <strong className={current.api_key_configured ? "text-emerald-600" : "text-amber-600"}>
                {current.api_key_configured ? "đã cấu hình (.env)" : "chưa có — kiểm tra GROQ_* / agent key"}
              </strong>
              <span className="text-slate-300">|</span>
              <Activity className="h-4 w-4 shrink-0" />
              Cập nhật:{" "}
              {current.updated_at
                ? new Date(current.updated_at).toLocaleString("vi-VN")
                : "đang dùng default env"}
            </div>
          </div>

          {(saveMutation.isError || resetMutation.isError) && (
            <p className="mt-3 text-xs text-rose-600">
              Lỗi lưu/reset. Kiểm tra validation (temperature, tokens, prompt version).
            </p>
          )}
        </Card>
      )}

      {/* Policy (legacy settings) */}
      {policyDraft && (
        <Card
          title="Chính sách anti-scam"
          subtitle="Toggles vận hành chung (không phải thông số LLM)"
          action={
            <button
              type="button"
              disabled={policyMutation.isPending}
              onClick={() => policyMutation.mutate(policyDraft)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {policyMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Lưu policy
            </button>
          }
        >
          <div className="space-y-4">
            {(
              [
                ["auto_block", "Tự động chặn giao dịch", "Chặn khi risk cao / STOP"],
                ["ai_intervention", "Can thiệp AI thông minh", "Cảnh báo chi tiết cho user"],
                ["notify_admin", "Thông báo admin", "Alert khi giao dịch bị chặn"],
              ] as const
            ).map(([key, title, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{title}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
                <Toggle
                  checked={Boolean(policyDraft[key])}
                  onChange={(v) => setPolicyDraft({ ...policyDraft, [key]: v })}
                />
              </div>
            ))}

            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-gray-600">Ngưỡng cảnh báo</span>
                <span className="font-bold text-blue-600">
                  {(policyDraft.risk_threshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={policyDraft.risk_threshold}
                onChange={(e) =>
                  setPolicyDraft({
                    ...policyDraft,
                    risk_threshold: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-blue-600"
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-gray-600">Giới hạn giao dịch/ngày</span>
                <span className="font-bold text-blue-600">
                  {new Intl.NumberFormat("vi-VN").format(policyDraft.daily_limit)} đ
                </span>
              </div>
              <input
                type="range"
                min={1_000_000}
                max={500_000_000}
                step={1_000_000}
                value={policyDraft.daily_limit}
                onChange={(e) =>
                  setPolicyDraft({
                    ...policyDraft,
                    daily_limit: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-blue-600"
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
