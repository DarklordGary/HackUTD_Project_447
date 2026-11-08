import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Message, Mode, Universe } from "./types";
import {
  explain,
  mergeAssumptions,
  mergeEvents,
  readState,
  STORAGE_KEY,
  applyReality,
  applyArchive,
} from "./state";
import { simulate } from "./engine";
import { colors, id, makeUniverse, seed } from "./seed";
import { interpret } from "./interpreter";
import { connectPersistence } from "./sync";
import { upgradeWorkspace } from "./workspace-upgrade";
type Page = "timelines" | "baseline" | "settings" | "compare" | "updates";
export function usePing() {
  const [state, setState] = useState<AppState>(readState);
  const [page, setPage] = useState<Page>("timelines");
  const [recentUniverseId, setRecentUniverseId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [month, setMonth] = useState(12);
  const [chat, setChat] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [thread, setThread] = useState<Message[]>(state.conversation ?? []);
  const [toolSteps, setToolSteps] = useState<
    { tool: string; status: "ok" | "error" }[]
  >([]);
  const [toast, setToast] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>(
    state.universes.slice(0, 2).map((u) => u.id),
  );
  const [ai, setAi] = useState("Connecting to Nemotron...");
  const [storage, setStorage] = useState("Saved on this device");
  const [help, setHelp] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<ReturnType<typeof connectPersistence> | null>(null);
  const latestState = useRef(state);
  const sending = useRef(false);
  const workspaceGeneration = useRef(0);
  const retry = useRef<{ prompt: string; operationId: string } | null>(null);
  useEffect(() => setState(upgradeWorkspace), []);
  useEffect(() => {
    latestState.current = state;
  }, [state]);
  const profile = state.profile;
  const universe = state.universes.find((u) => u.id === selected);
  const baseline = useMemo(() => simulate(profile), [profile]);
  const allRows = useMemo(
    () =>
      new Map(state.universes.map((u) => [u.id, simulate(u.finalProfile ?? profile, u.events)])),
    [profile, state.universes],
  );
  const selectedRows = universe ? allRows.get(universe.id)! : baseline;
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setAi(d.ai))
      .catch(() => {});
    syncRef.current = connectPersistence(
      (remote) => setState(upgradeWorkspace(remote)),
      setStorage,
    );
    return () => syncRef.current?.close();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      syncRef.current?.save(state);
    } catch {
      setStorage("Device storage full — changes in memory");
    }
  }, [state]);
  useEffect(() => {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    bottomRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
  }, [thread, busy, chat]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChat(false);
        setHelp(false);
        setConfirmReset(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!recentUniverseId) return;
    const timer = setTimeout(() => setRecentUniverseId(null), 1600);
    return () => clearTimeout(timer);
  }, [recentUniverseId]);
  function navigate(next: Page) {
    setPage(next);
    setSelected(null);
  }
  function openChat(next: Mode = "create", target?: Universe) {
    setRequestError("");
    setToolSteps([]);
    setMode(next);
    setThread(state.conversation ?? target?.messages ?? []);
    if (target) setState(prev => ({ ...prev, activeGoalId: target.id }));
    setChat(true);
  }
  function openUniverse(u: Universe) {
    setSelected(u.id);
    setPage("timelines");
    setMonth(12);
  }
  async function send(text = input) {
    const prompt = text.trim();
    if (!prompt || sending.current) return;
    sending.current = true;
    const generation = workspaceGeneration.current;
    const operationId = retry.current?.prompt === prompt ? retry.current.operationId : id();
    retry.current = { prompt, operationId };
    setRequestError("");
    setInput("");
    setBusy(true);
    const userMessage: Message = { id: id(), role: "user", text: prompt };
    const previous = thread.at(-1);
    const history =
      previous?.role === "user" && previous.text === prompt
        ? thread.slice(0, -1)
        : thread;
    const conversation = [...history, userMessage];
    setThread(conversation);
    try {
      const { data, source, tools } = await interpret(
        prompt,
        mode,
        universe ?? state.universes.find(u => u.id === state.activeGoalId && !u.archived),
        profile,
        state.universes,
        history, operationId, state.activeGoalId,
      );
      if (generation !== workspaceGeneration.current) return;
      if (
        latestState.current.profile !== state.profile ||
        latestState.current.universes !== state.universes ||
        latestState.current.appliedOperationIds !== state.appliedOperationIds
      )
        throw new Error(
          "Your financial workspace changed while Ping was thinking. Please resend your request against the updated timelines.",
        );
      setAi(source);
      setToolSteps(tools);
      const clarificationFor = data.clarification ? history.at(-1)?.clarificationFor ?? prompt : undefined;
      if (data.answer || data.clarification) {
        const messages: Message[] = [...conversation, { id: id(), role: "assistant", text: data.answer ?? data.clarification!, clarificationFor }];
        setState(prev => ({ ...prev, conversation: messages.slice(-20) }));
      }
      if (data.answer) {
        setThread([
          ...conversation,
          { id: id(), role: "assistant", text: data.answer },
        ]);
        return;
      }
      if (data.clarification) {
        setThread([
          ...conversation,
          { id: id(), role: "assistant", text: data.clarification, clarificationFor },
        ]);
        return;
      }
      if (state.appliedOperationIds?.includes(operationId)) { setThread(state.conversation ?? conversation); return; }
      const operation = data.operation ?? mode;
      if (operation === "archive") {
        const result = applyArchive(state, { ...data, operationId: data.operationId ?? operationId });
        const messages: Message[] = [...conversation, { id: id(), role: "assistant", text: result.explanation }];
        setState({ ...result.state, conversation: messages.slice(-20) });
        setThread(messages);
        if (selected === data.targetUniverseId) setSelected(null);
        setPage("timelines");
        setMode("create");
        setToast("Plan set aside. History preserved.");
      } else if (operation === "reality") {
        const result = applyReality(state, { ...data, operationId: data.operationId ?? operationId }, prompt);
        const messages: Message[] = [...conversation, { id: id(), role: "assistant", text: result.explanation }];
        setState({ ...result.state, conversation: messages.slice(-20), activeGoalId: data.reality?.move ? undefined : state.activeGoalId });
        setSelected(null);
        setThread([
          ...conversation,
          {
            id: id(),
            role: "assistant",
            text: result.explanation,
          },
        ]);
        setToast("Reality updated. Every universe recalculated.");
        setPage("timelines");
        setMode("reality");
      } else {
        if (!data.events.length && !data.explicitOperations)
          throw new Error(
            "No scenario events were returned. Try including a specific change.",
          );
        const existing =
          operation !== "create"
            ? data.targetUniverseId
              ? state.universes.find((u) => u.id === data.targetUniverseId)
              : universe
            : undefined;
        if (operation !== "create" && !existing)
          throw new Error(
            "The target universe is no longer available. Please select it again.",
          );
        const next =
          operation === "modify" && existing
            ? structuredClone(existing)
            : makeUniverse(
                data.name,
                data.description,
                [],
                existing?.icon ?? "sparkles",
                colors[state.universes.length % colors.length],
              );
        if (operation === "branch" && existing) {
          next.revisionOfId = existing.id;
          if (data.branchOrigin !== "current") next.parentId = existing.id;
        }
        next.events = mergeEvents(
          existing?.events ?? [],
          data.events,
          data.removeEventIds,
          data.explicitOperations,
        );
        next.assumptions = mergeAssumptions(existing?.assumptions ?? [], data);
        const response: Message = {
          id: id(),
          role: "assistant",
          text: data.explanation ?? explain(profile, next, source),
        };
        next.messages = [...conversation, response].slice(-20);
        setThread(next.messages);
        setState((prev) => ({
          ...prev,
          conversation: next.messages.slice(-20), activeGoalId: next.id,
          appliedOperationIds: [...(prev.appliedOperationIds ?? []), operationId],
          universes:
            operation === "modify" && existing
              ? prev.universes.map((u) => (u.id === existing.id ? next : u))
              : [...prev.universes, next],
        }));
        if (existing && operation === "branch")
          setCompareIds([existing.id, next.id]);
        if (operation !== "modify") setRecentUniverseId(next.id);
        setSelected(null);
        setPage("timelines");
        setMode("branch");
        setToast(
          operation === "modify"
            ? "Universe updated"
            : operation === "branch"
              ? "A new path has branched off"
              : "A new universe is ready to explore",
        );
      }
    } catch (error) {
      if (generation !== workspaceGeneration.current) return;
      setThread(conversation);
      setRequestError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
      setInput(prompt);
    } finally {
      if (generation === workspaceGeneration.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  }
  function startNewChat() {
    workspaceGeneration.current++;
    sending.current = false;
    retry.current = null;
    setState(prev => ({ ...prev, conversation: [], activeGoalId: undefined }));
    setThread([]);
    setInput("");
    setRequestError("");
    setToolSteps([]);
    setBusy(false);
    setSelected(null);
    setRecentUniverseId(null);
    setMode("create");
    setChat(true);
    setToast("New chat. Your finances and saved plans are unchanged.");
  }
  function resetWorkspace() {
    const next = upgradeWorkspace(seed());
    workspaceGeneration.current++;
    sending.current = false;
    retry.current = null;
    latestState.current = next;
    setState(next);
    setThread([]);
    setInput("");
    setRequestError("");
    setToolSteps([]);
    setBusy(false);
    setSelected(null);
    setRecentUniverseId(null);
    setCompareIds([]);
    setMode("create");
    setMonth(12);
    setPage("timelines");
    setChat(false);
    setConfirmReset(false);
    setHelp(false);
    setToast("Back to Main Reality. Ready to start fresh.");
  }
  function download() {
    const rows = selectedRows;
    const keys = Object.keys(rows[0]) as (keyof (typeof rows)[0])[];
    const csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => r[k]).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ping-${universe?.name ?? "baseline"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Monthly projections exported");
  }
  return {
    state,
    setState,
    page,
    setPage,
    selected,
    recentUniverseId,
    setSelected,
    month,
    setMonth,
    chat,
    setChat,
    mode,
    setMode,
    input,
    setInput,
    busy,
    requestError,
    thread,
    setThread,
    toolSteps,
    toast,
    setToast,
    compareIds,
    setCompareIds,
    ai,
    storage,
    help,
    setHelp,
    confirmReset,
    setConfirmReset,
    bottomRef,
    profile,
    universe,
    baseline,
    allRows,
    selectedRows,
    navigate,
    openChat,
    openUniverse,
    send,
    download,
    resetWorkspace,
    startNewChat,
  };
}
export type PingController = ReturnType<typeof usePing>;
