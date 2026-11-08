import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Message, Mode, Universe } from "./types";
import {
  explain,
  mergeAssumptions,
  mergeEvents,
  readState,
  STORAGE_KEY,
  applyReality,
} from "./state";
import { money, simulate } from "./engine";
import { colors, id, makeUniverse } from "./seed";
import { interpret } from "./interpreter";
import { connectPersistence } from "./sync";
import { upgradeWorkspace } from "./workspace-upgrade";
type Page = "timelines" | "baseline" | "settings" | "compare" | "updates";
export function usePing() {
  const [state, setState] = useState<AppState>(readState);
  const [page, setPage] = useState<Page>("timelines");
  const [selected, setSelected] = useState<string | null>(null);
  const [month, setMonth] = useState(12);
  const [chat, setChat] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [thread, setThread] = useState<Message[]>([]);
  const [toolSteps, setToolSteps] = useState<
    { tool: string; status: "ok" | "error" }[]
  >([]);
  const [toast, setToast] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>(
    state.universes.slice(0, 2).map((u) => u.id),
  );
  const [ai, setAi] = useState("Demo interpreter");
  const [storage, setStorage] = useState("Saved on this device");
  const [help, setHelp] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<ReturnType<typeof connectPersistence> | null>(null);
  const latestState = useRef(state);
  useEffect(() => setState(upgradeWorkspace), []);
  useEffect(() => {
    latestState.current = state;
  }, [state]);
  const profile = state.profile;
  const universe = state.universes.find((u) => u.id === selected);
  const baseline = useMemo(() => simulate(profile), [profile]);
  const allRows = useMemo(
    () =>
      new Map(state.universes.map((u) => [u.id, simulate(profile, u.events)])),
    [profile, state.universes],
  );
  const selectedRows = universe ? allRows.get(universe.id)! : baseline;
  const unread = state.notices.filter((n) => !n.read).length;
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
  function navigate(next: Page) {
    setPage(next);
    setSelected(null);
  }
  function openChat(next: Mode = "create", target?: Universe) {
    setRequestError("");
    setToolSteps([]);
    setMode(next);
    setThread(target?.messages ?? []);
    setSelected(target?.id ?? null);
    if (target) setPage("timelines");
    setChat(true);
  }
  function openUniverse(u: Universe) {
    setSelected(u.id);
    setPage("timelines");
    setMonth(12);
  }
  async function send(text = input) {
    const prompt = text.trim();
    if (!prompt || busy) return;
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
        universe,
        profile,
        state.universes,
        history,
      );
      if (
        latestState.current.profile !== state.profile ||
        latestState.current.universes !== state.universes
      )
        throw new Error(
          "Your financial workspace changed while Ping was thinking. Please resend your request against the updated timelines.",
        );
      setAi(source);
      setToolSteps(tools);
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
          { id: id(), role: "assistant", text: data.clarification },
        ]);
        return;
      }
      if (mode === "reality") {
        const result = applyReality(state, data, prompt);
        setState(result.state);
        setThread([
          ...conversation,
          {
            id: id(),
            role: "assistant",
            text: data.explanation ?? result.explanation,
          },
        ]);
        setToast("Reality updated. Every universe recalculated.");
        setPage("updates");
      } else {
        if (!data.events.length && !data.explicitOperations)
          throw new Error(
            "No scenario events were returned. Try including a specific change.",
          );
        const existing =
          mode !== "create"
            ? data.targetUniverseId
              ? state.universes.find((u) => u.id === data.targetUniverseId)
              : universe
            : undefined;
        if (mode !== "create" && !existing)
          throw new Error(
            "The target universe is no longer available. Please select it again.",
          );
        const next =
          mode === "modify" && existing
            ? structuredClone(existing)
            : makeUniverse(
                data.name,
                data.description,
                [],
                /new york/i.test(prompt)
                  ? "city"
                  : /car/i.test(prompt)
                    ? "car"
                    : /house|home/i.test(prompt)
                      ? "home"
                      : /school/i.test(prompt)
                        ? "graduation"
                        : (existing?.icon ?? "sparkles"),
                colors[state.universes.length % colors.length],
              );
        if (mode === "branch" && existing) next.parentId = existing.id;
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
        next.messages = [...conversation, response];
        setThread(next.messages);
        setState((prev) => ({
          ...prev,
          universes:
            mode === "modify" && existing
              ? prev.universes.map((u) => (u.id === existing.id ? next : u))
              : [...prev.universes, next],
        }));
        if (existing && mode === "branch")
          setCompareIds([existing.id, next.id]);
        setSelected(next.id);
        setPage("timelines");
        setMode("branch");
        setToast(
          mode === "modify"
            ? "Universe updated"
            : mode === "branch"
              ? "A new path has branched off"
              : "A new universe is ready to explore",
        );
      }
    } catch (error) {
      setThread(conversation);
      setRequestError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
      setInput(prompt);
    } finally {
      setBusy(false);
    }
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
    unread,
    navigate,
    openChat,
    openUniverse,
    send,
    download,
  };
}
export type PingController = ReturnType<typeof usePing>;
