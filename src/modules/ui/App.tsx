import type { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowLeft,
  BadgePercent,
  Bot,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import type { AddTaskRequest, CreateHabitRequest, DailyPlanView, PlanSummary, UpdateTaskRequest } from "../api/index.js";
import { clampInterventionMinute, evaluateNightlySummary, normalizeInterventionThresholds, normalizeSummaryTime, type InterventionAction, type InterventionThresholdLevel, type NightlySummarySnapshot } from "../api/intervention.js";
import type { HabitFrequency, HabitView, Task, TaskCategory, TaskStatus, TaskUrgency } from "../database/types.js";
import { mockDailyPlan } from "./mockPlan.js";
import { isPointerInsidePetInteractionZone } from "./petHitTest.js";
import {
  addHabitToView,
  addTaskToView,
  archiveHabitInView,
  buildHistoryHeatmapDays,
  buildHistoryOverview,
  createEmptyPlanView,
  filterHistorySummaries,
  moveTaskId,
  normalizePlanView,
  removeTaskFromView,
  reorderTasksInView,
  setHabitCheckedInView,
  setTaskStatusInView,
  shouldTriggerCompletionCelebration,
  shiftPlanDate,
  updateTaskInView
} from "./planState.js";
import type { HistoryFilter } from "./planState.js";
import { PetSprite, getDefaultPetCharacter, isPetCharacter, type PetCharacter } from "./petVisuals.js";
import { buildPetViewState, type PetMood, type PetProgress, type PetViewState } from "./petState.js";
import {
  calculatePetDodgeDelta,
  calculatePetDragTarget,
  clampPetDomPosition,
  createPetDragShakeState,
  PET_DIZZY_RECOVER_MS,
  updatePetDragShakeState,
  type PetDragShakeState
} from "./petDrag.js";
import "./styles.css";

type PlanClient = Pick<
  Window["letsPlan"],
  "getTodayPlan" | "getPlanByDate" | "getRecentPlanSummaries" | "addTask" | "completeTask" | "reopenTask" | "updateTask" | "reorderTasks" | "deleteTask" | "createHabit" | "updateHabit" | "archiveHabit" | "checkInHabit" | "undoHabitCheckIn" | "getAutoLaunchSettings" | "setAutoLaunchOpenAtLogin" | "getAppSettings" | "setAppSettings" | "openHistoryWindow" | "openMainWindow" | "openPetContextMenu" | "movePetWindow" | "setPetMousePassthrough" | "exportPlanReport" | "onOpenHistory" | "onOpenSettings" | "onPetStatus" | "onAppSettings" | "onSetBackgroundColor"
>;

type AppSettingsState = Awaited<ReturnType<Window["letsPlan"]["getAppSettings"]>>;

type BackgroundColorCommand =
  | { mode: "preset"; color: string }
  | { mode: "custom" };

type ReportPeriod = "today" | "week" | "month" | "all";
type ReportFormat = "markdown" | "pdf" | "excel";
type MainRoute = "planner" | "control-center";
type ControlCenterRoute = "home" | "pet" | "behavior" | "intervention";

interface AppProps {
  initialPlan?: DailyPlanView;
  planClient?: PlanClient | null;
  initialRoute?: MainRoute;
  initialControlRoute?: ControlCenterRoute;
  initialAppSettings?: AppSettingsState;
}

interface EditingTaskDraft {
  taskId: number;
  content: string;
  urgency: TaskUrgency;
  category: TaskCategory;
}

const defaultAppSettings: AppSettingsState = {
  hideToTrayOnClose: true,
  showCompletionAnimation: true,
  openHistoryInNewWindow: true,
  petCharacter: "cat",
  interventionThresholdMinutes: { l1: 10, l2: 20, l3: 30, l4: 40 },
  nightlySummaryEnabled: true,
  nightlySummaryTime: "21:30",
  petClickDodgeThreshold: 10,
  petDodgeDistance: 130,
  petBurstDodgeThreshold: 16,
  mainQuestByDate: {}
};

const DEFAULT_BACKGROUND_COLOR = "#F7F3E9";
const BACKGROUND_COLOR_STORAGE_KEY = "letsplan:background-color";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const backgroundPaletteOptions: Array<{ label: string; color: string }> = [
  { label: "笺纸米白", color: "#F7F3E9" },
  { label: "宣纸浅杏", color: "#F3E7D0" },
  { label: "淡竹青", color: "#E9F0E5" },
  { label: "古铜浅褐", color: "#EEE3CD" },
  { label: "淡墨灰", color: "#ECEBE7" },
  { label: "赛博黑", color: "#05060a" },
  { label: "青色网格", color: "#07131a" },
  { label: "品红面板", color: "#130816" },
  { label: "信号绿", color: "#06120f" },
  { label: "琥珀夜色", color: "#150f05" },
  { label: "钢蓝", color: "#07111f" },
  { label: "紫色轨迹", color: "#100b1c" },
  { label: "红色警戒", color: "#160708" },
  { label: "青绿玻璃", color: "#061516" },
  { label: "石板矩阵", color: "#0b1017" },
  { label: "粉色电路", color: "#190817" },
  { label: "荧光核心", color: "#081407" }
];

const categoryOptions: Array<{ value: TaskCategory; label: string }> = [
  { value: "work", label: "工作" },
  { value: "study", label: "学习" }
];

const celebrationPieces = Array.from({ length: 18 }, (_item, index) => ({
  id: index,
  x: `${(index % 6) * 18 - 45}px`,
  delay: `${(index % 5) * 80}ms`,
  color: ["#ef4444", "#f59e0b", "#16a34a", "#0f766e", "#2563eb", "#db2777"][index % 6]
}));
const historyFilterOptions: Array<{ value: HistoryFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "completed", label: "已完成" },
  { value: "unfinished", label: "未完成" }
];

const urgencyOptions: Array<{ value: TaskUrgency; label: string }> = [
  { value: "regular", label: "常规" },
  { value: "urgent", label: "紧急" }
];

const habitFrequencyOptions: Array<{ value: HabitFrequency; label: string }> = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "custom", label: "自定义" }
];

const petCharacterOptions: Array<{ value: PetCharacter; label: string }> = [
  { value: "cat", label: "猫" },
  { value: "dog", label: "狗" },
  { value: "robot", label: "机器人" }
];

const interventionThresholdOptions: Array<{ value: InterventionThresholdLevel; label: string; description: string }> = [
  { value: "l1", label: "L1 语言提醒", description: "针对长时间没有完成任务的行为，只用气泡文字提醒。" },
  { value: "l2", label: "L2 底部跑动", description: "继续无进展时，桌宠在桌面底部来回跑动提醒。" },
  { value: "l3", label: "L3 满屏跑动", description: "长时间拖延后，桌宠在整个桌面范围内跑动提醒。" },
  { value: "l4", label: "L4 居中打滚", description: "严重超时无进展时，桌宠到桌面中间打滚并飘出快去学习文字 10 秒。" }
];

const PET_BURST_DODGE_MS = 10_000;
const PET_BURST_DODGE_COOLDOWN_MS = 260;
const PET_FORCE_INTERVENTION_MS = 10_000;
const PET_FORCE_STUDY_TEXT = "快去学习！";
const PET_FORCE_TEXT_ITEMS = Array.from({ length: 18 }, (_item, index) => ({
  id: index,
  left: `${8 + (index % 6) * 17}%`,
  top: `${12 + (Math.floor(index / 6) % 3) * 28}%`,
  delay: `${(index % 6) * 150 + Math.floor(index / 6) * 90}ms`,
  duration: `${2600 + (index % 3) * 240}ms`
}));

export function App({ initialPlan, planClient, initialRoute, initialControlRoute, initialAppSettings }: AppProps) {
  const client = useMemo(() => planClient ?? getWindowPlanClient(), [planClient]);
  const initialViewMode = useMemo(() => getInitialViewMode(), []);
  const isHistoryWindowView = initialViewMode === "history";
  const initialMainRoute = initialRoute ?? (initialViewMode === "control" ? "control-center" : "planner");

  if (initialViewMode === "pet") {
    return <PetShell initialPlan={initialPlan ?? mockDailyPlan} planClient={client} />;
  }
  const [planView, setPlanView] = useState(() => normalizePlanView(initialPlan ?? mockDailyPlan));
  const [content, setContent] = useState("");
  const [urgency, setUrgency] = useState<TaskUrgency>("regular");
  const [category, setCategory] = useState<TaskCategory>("work");
  const [habitName, setHabitName] = useState("");
  const [habitFrequency, setHabitFrequency] = useState<HabitFrequency>("daily");
  const [customIntervalDays, setCustomIntervalDays] = useState(3);
  const [editingTask, setEditingTask] = useState<EditingTaskDraft | null>(null);
  const [activeRoute, setActiveRoute] = useState<MainRoute>(initialMainRoute);
  const [controlRouteStack, setControlRouteStack] = useState<ControlCenterRoute[]>([initialControlRoute ?? "home"]);
  const [historySummaries, setHistorySummaries] = useState<PlanSummary[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [isLoading, setIsLoading] = useState(() => Boolean(client) && !initialPlan);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoLaunchSettings, setAutoLaunchSettings] = useState<Awaited<ReturnType<PlanClient["getAutoLaunchSettings"]>> | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettingsState>(initialAppSettings ?? defaultAppSettings);
  const [isSettingsMutating, setIsSettingsMutating] = useState(false);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState(() => getInitialBackgroundColor());
  const [isBackgroundPaletteOpen, setIsBackgroundPaletteOpen] = useState(false);
  const [reportExportMessage, setReportExportMessage] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [dismissedInterventionKey, setDismissedInterventionKey] = useState<string | null>(null);
  const [dismissedNightlySummaryDate, setDismissedNightlySummaryDate] = useState<string | null>(null);
  const previousCompletionRef = useRef(planView.isCompleted);
  const didLoadHistoryWindowRef = useRef(false);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const todayPlanDate = useMemo(() => formatPlanInputDate(clockNow), [clockNow]);
  const historyOverview = useMemo(() => buildHistoryOverview(historySummaries), [historySummaries]);
  const historyHeatmapDays = useMemo(() => buildHistoryHeatmapDays(historySummaries, { totalDays: 35 }), [historySummaries]);
  const filteredHistorySummaries = useMemo(
    () => filterHistorySummaries(historySummaries, historyFilter),
    [historyFilter, historySummaries]
  );
  const selectedHistorySummary = useMemo(
    () => historySummaries.find((summary) => summary.planDate === planView.plan.planDate) ?? historySummaries[0] ?? null,
    [historySummaries, planView.plan.planDate]
  );
  const currentControlRoute = controlRouteStack[controlRouteStack.length - 1] ?? "home";

  useEffect(() => {
    if (!client || initialPlan) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    client
      .getTodayPlan()
      .then((view) => {
        if (!isMounted) {
          return;
        }
        setPlanView(normalizePlanView(view));
        setEditingTask(null);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, initialPlan]);


  useEffect(() => {
    if (!client?.getAutoLaunchSettings) {
      setAutoLaunchSettings(null);
      return;
    }

    let isMounted = true;
    client
      .getAutoLaunchSettings()
      .then((settings) => {
        if (isMounted) {
          setAutoLaunchSettings(settings);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client]);

  useEffect(() => {
    if (!client?.getAppSettings) {
      setAppSettings(initialAppSettings ?? defaultAppSettings);
      return;
    }

    let isMounted = true;
    client
      .getAppSettings()
      .then((settings) => {
        if (isMounted) {
          setAppSettings(settings);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, initialAppSettings]);
  useEffect(() => {
    const shouldCelebrate = shouldTriggerCompletionCelebration(previousCompletionRef.current, planView.isCompleted);
    previousCompletionRef.current = planView.isCompleted;
    if (!shouldCelebrate || !appSettings.showCompletionAnimation) {
      return;
    }

    setIsCelebrating(true);
    const timeoutId = window.setTimeout(() => setIsCelebrating(false), 3000);

    return () => window.clearTimeout(timeoutId);
  }, [appSettings.showCompletionAnimation, planView.isCompleted]);

  useEffect(() => {
    if (!appSettings.showCompletionAnimation) {
      setIsCelebrating(false);
    }
  }, [appSettings.showCompletionAnimation]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const nextColor = normalizeHexColor(backgroundColor) ?? DEFAULT_BACKGROUND_COLOR;
    document.documentElement.style.setProperty("--app-background", nextColor);
    try {
      window.localStorage.setItem(BACKGROUND_COLOR_STORAGE_KEY, nextColor);
    } catch {
      // Ignore unavailable localStorage in restricted renderer contexts.
    }
  }, [backgroundColor]);
  const activePlanDate = planView.plan.planDate;
  const displayDate = useMemo(() => formatDisplayDate(activePlanDate), [activePlanDate]);
  const progressStyle = {
    "--progress": `${planView.stats.percentage}%`,
    "--progress-color": getProgressColor(planView.stats.percentage)
  } as CSSProperties;
  const isBusy = isLoading || isMutating || isSettingsMutating;
  const isToday = activePlanDate === todayPlanDate;
  const activeNightlySummary = useMemo(() => evaluateNightlySummary({
    now: clockNow,
    planDate: activePlanDate,
    pendingTasks: planView.pendingTasks,
    doneTasks: planView.doneTasks,
    enabled: appSettings.nightlySummaryEnabled,
    summaryTime: appSettings.nightlySummaryTime,
    todayDate: todayPlanDate
  }), [activePlanDate, appSettings.nightlySummaryEnabled, appSettings.nightlySummaryTime, clockNow, planView.doneTasks, planView.pendingTasks, todayPlanDate]);
  const interventionOverlayKey = `${activePlanDate}:${planView.intervention.level}:${planView.intervention.idleMinutes}`;
  const shouldShowInterventionOverlay = (planView.intervention.level === "l3" || planView.intervention.level === "l4") && dismissedInterventionKey !== interventionOverlayKey;
  const shouldShowNightlySummary = activeNightlySummary.shouldShow && dismissedNightlySummaryDate !== activeNightlySummary.planDate;
  const isEmptyRemoteDate = Boolean(client) && planView.plan.id === 0 && planView.tasks.length === 0;
  const activeMainQuestTaskId = getMainQuestTaskId(appSettings.mainQuestByDate, activePlanDate, planView.tasks);
  const activeMainQuestTask = activeMainQuestTaskId === null ? null : planView.tasks.find((task) => task.id === activeMainQuestTaskId) ?? null;
  useEffect(() => {
    if (!client || !isToday || isMutating || isSettingsMutating) {
      return;
    }

    const refreshTodayPlan = () => {
      client.getTodayPlan()
        .then((view) => setPlanView(normalizePlanView(view)))
        .catch(() => undefined);
    };
    const intervalId = window.setInterval(refreshTodayPlan, 60_000);
    return () => window.clearInterval(intervalId);
  }, [client, isMutating, isSettingsMutating, isToday]);

  useEffect(() => {
    if (!client?.onOpenHistory) {
      return;
    }

    return client.onOpenHistory(() => {
      void loadHistorySummaries();
    });
  }, [client, isBusy, planView]);

  useEffect(() => {
    if (!client?.onOpenSettings) {
      return;
    }

    return client.onOpenSettings(() => {
      openControlCenter("home");
    });
  }, [client]);

  useEffect(() => {
    if (!client?.onSetBackgroundColor) {
      return;
    }

    return client.onSetBackgroundColor((command) => {
      if (!isBackgroundColorCommand(command)) {
        return;
      }

      if (command.mode === "preset") {
        setBackgroundColor(command.color);
        setIsBackgroundPaletteOpen(false);
        return;
      }

      setIsBackgroundPaletteOpen(true);
    });
  }, [client]);

  useEffect(() => {
    if (!isBackgroundPaletteOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBackgroundPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBackgroundPaletteOpen]);
  useEffect(() => {
    if (!isHistoryWindowView || isBusy || didLoadHistoryWindowRef.current) {
      return;
    }

    didLoadHistoryWindowRef.current = true;
    void loadHistorySummaries();
  }, [isHistoryWindowView, isBusy]);
  async function handleLoadPlanDate(planDate: string) {
    if (!planDate || isBusy) {
      return;
    }

    if (!client) {
      const nextView = planDate === mockDailyPlan.plan.planDate ? mockDailyPlan : createEmptyPlanView(planDate);
      setPlanView(normalizePlanView(nextView));
      setEditingTask(null);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    try {
      const nextView = await client.getPlanByDate(planDate);
      setPlanView(normalizePlanView(nextView ?? createEmptyPlanView(planDate)));
      setEditingTask(null);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadToday() {
    if (isBusy) {
      return;
    }

    if (!client) {
      setPlanView(normalizePlanView(mockDailyPlan));
      setEditingTask(null);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    try {
      const nextView = await client.getTodayPlan();
      setPlanView(normalizePlanView(nextView));
      setEditingTask(null);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleAutoLaunch() {
    if (!client?.setAutoLaunchOpenAtLogin || !autoLaunchSettings || isBusy) {
      return;
    }

    setIsSettingsMutating(true);
    try {
      const nextSettings = await client.setAutoLaunchOpenAtLogin(!autoLaunchSettings.openAtLogin);
      setAutoLaunchSettings(nextSettings);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSettingsMutating(false);
    }
  }

  async function handlePatchAppSettings(patch: Partial<AppSettingsState>) {
    if (isBusy) {
      return;
    }

    if (!client?.setAppSettings) {
      setAppSettings((current) => ({ ...current, ...patch }));
      return;
    }

    setIsSettingsMutating(true);
    try {
      const nextSettings = await client.setAppSettings(patch);
      setAppSettings(nextSettings);
      const refreshedView = await client.getPlanByDate(activePlanDate);
      if (refreshedView) {
        setPlanView(normalizePlanView(refreshedView));
      }
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSettingsMutating(false);
    }
  }

  async function handleToggleAppSetting(settingName: "hideToTrayOnClose" | "showCompletionAnimation" | "openHistoryInNewWindow") {
    await handlePatchAppSettings({ [settingName]: !appSettings[settingName] } as Partial<AppSettingsState>);
  }

  function handleToggleMainQuest(taskId: number) {
    if (isBusy) {
      return;
    }

    const nextTaskId = activeMainQuestTaskId === taskId ? null : taskId;
    void handlePatchAppSettings({
      mainQuestByDate: updateMainQuestByDate(appSettings.mainQuestByDate, activePlanDate, nextTaskId)
    });
  }

  function handlePetCharacterChange(petCharacter: PetCharacter) {
    void handlePatchAppSettings({ petCharacter });
  }

  function handleInterventionThresholdChange(level: InterventionThresholdLevel, value: number) {
    const nextThresholds = normalizeInterventionThresholds({
      ...appSettings.interventionThresholdMinutes,
      [level]: clampInterventionMinute(value, appSettings.interventionThresholdMinutes[level])
    });
    void handlePatchAppSettings({ interventionThresholdMinutes: nextThresholds });
  }

  function handlePetClickDodgeThresholdChange(value: number) {
    void handlePatchAppSettings({ petClickDodgeThreshold: clampInteger(value, 3, 30, appSettings.petClickDodgeThreshold) });
  }

  function handlePetDodgeDistanceChange(value: number) {
    void handlePatchAppSettings({ petDodgeDistance: clampInteger(value, 40, 320, appSettings.petDodgeDistance) });
  }

  function handlePetBurstDodgeThresholdChange(value: number) {
    void handlePatchAppSettings({ petBurstDodgeThreshold: clampInteger(value, 4, 60, appSettings.petBurstDodgeThreshold) });
  }

  function handleNightlySummaryEnabledChange() {
    setDismissedNightlySummaryDate(null);
    void handlePatchAppSettings({ nightlySummaryEnabled: !appSettings.nightlySummaryEnabled });
  }

  function handleNightlySummaryTimeChange(value: string) {
    setDismissedNightlySummaryDate(null);
    void handlePatchAppSettings({ nightlySummaryTime: normalizeSummaryTime(value) });
  }
  function openControlCenter(route: ControlCenterRoute = "home") {
    setActiveRoute("control-center");
    setControlRouteStack([route]);
  }

  function pushControlRoute(route: Exclude<ControlCenterRoute, "home">) {
    setControlRouteStack((stack) => [...stack, route]);
  }

  function popControlRoute() {
    setControlRouteStack((stack) => stack.length > 1 ? stack.slice(0, -1) : ["home"]);
  }

  async function loadHistorySummaries() {
    if (isBusy) {
      return;
    }

    if (!client) {
      setHistorySummaries([buildPlanSummary(planView)]);
      return;
    }

    setIsLoading(true);
    try {
      setHistorySummaries(await client.getRecentPlanSummaries(30));
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }


  async function handleOpenHistoryWindow() {
    if (isBusy) {
      return;
    }

    if (!client?.openHistoryWindow) {
      setErrorMessage("历史窗口需要桌面运行环境");
      return;
    }

    setIsLoading(true);
    try {
      await client.openHistoryWindow();
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportReport(period: ReportPeriod, format: ReportFormat) {
    if (isBusy || !client?.exportPlanReport) {
      return;
    }

    setIsMutating(true);
    try {
      const result = await client.exportPlanReport({ period, format, anchorDate: activePlanDate });
      setReportExportMessage(result.canceled ? null : `已导出 ${result.filePath ?? ""}`);
      setErrorMessage(null);
    } catch (error: unknown) {
      setReportExportMessage(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent || isBusy) {
      return;
    }

    const request: AddTaskRequest = {
      planDate: activePlanDate,
      content: trimmedContent,
      urgency,
      category
    };

    if (!client) {
      setPlanView((current) => addTaskToView(current, request));
      setContent("");
      return;
    }

    setIsMutating(true);
    try {
      const nextView = await client.addTask(request);
      setPlanView(normalizePlanView(nextView));
      setContent("");
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSubmitHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = habitName.trim();
    if (!trimmedName || isBusy) {
      return;
    }

    const request: CreateHabitRequest = {
      planDate: activePlanDate,
      name: trimmedName,
      frequency: habitFrequency,
      customIntervalDays: habitFrequency === "custom" ? customIntervalDays : null
    };

    if (!client?.createHabit) {
      setPlanView((current) => addHabitToView(current, request));
      setHabitName("");
      return;
    }

    setIsMutating(true);
    try {
      const nextView = await client.createHabit(request);
      setPlanView(normalizePlanView(nextView));
      setHabitName("");
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleHabitCheckIn(habit: HabitView) {
    if (isBusy) {
      return;
    }

    if (!client?.checkInHabit || !client?.undoHabitCheckIn) {
      setPlanView((current) => setHabitCheckedInView(current, habit.habit.id, !habit.isCheckedToday));
      return;
    }

    setIsMutating(true);
    try {
      const request = { planDate: activePlanDate, habitId: habit.habit.id };
      const nextView = habit.isCheckedToday ? await client.undoHabitCheckIn(request) : await client.checkInHabit(request);
      setPlanView(normalizePlanView(nextView));
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleArchiveHabit(habitId: number) {
    if (isBusy) {
      return;
    }

    if (!client?.archiveHabit) {
      setPlanView((current) => archiveHabitInView(current, habitId));
      return;
    }

    setIsMutating(true);
    try {
      const nextView = await client.archiveHabit({ planDate: activePlanDate, habitId });
      setPlanView(normalizePlanView(nextView));
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleTaskStatus(taskId: number, status: TaskStatus) {
    if (isBusy) {
      return;
    }

    if (!client) {
      setPlanView((current) => setTaskStatusInView(current, taskId, status));
      return;
    }

    setIsMutating(true);
    try {
      const nextView =
        status === "done"
          ? await client.completeTask(activePlanDate, taskId)
          : await client.reopenTask(activePlanDate, taskId);
      setPlanView(normalizePlanView(nextView));
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  function handleStartEdit(task: Task) {
    if (isBusy) {
      return;
    }

    setEditingTask({
      taskId: task.id,
      content: task.content,
      urgency: task.urgency,
      category: task.category
    });
    setErrorMessage(null);
  }

  function handleEditDraftChange(patch: Partial<Omit<EditingTaskDraft, "taskId">>) {
    setEditingTask((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSubmitTaskEdit(event: FormEvent<HTMLFormElement>, taskId: number) {
    event.preventDefault();
    if (!editingTask || editingTask.taskId !== taskId || isBusy) {
      return;
    }

    const trimmedContent = editingTask.content.trim();
    if (!trimmedContent) {
      setErrorMessage("任务内容不能为空");
      return;
    }

    const request: UpdateTaskRequest = {
      planDate: activePlanDate,
      taskId,
      content: trimmedContent,
      urgency: editingTask.urgency,
      category: editingTask.category
    };

    if (!client) {
      setPlanView((current) => updateTaskInView(current, taskId, request));
      setEditingTask(null);
      setErrorMessage(null);
      return;
    }

    setIsMutating(true);
    try {
      const nextView = await client.updateTask(request);
      setPlanView(normalizePlanView(nextView));
      setEditingTask(null);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  function handleCancelEdit() {
    if (!isMutating) {
      setEditingTask(null);
      setErrorMessage(null);
    }
  }

  async function handleReorderPendingTasks(orderedTaskIds: number[]) {
    if (isBusy) {
      return;
    }

    if (!client) {
      setPlanView((current) => reorderTasksInView(current, orderedTaskIds));
      return;
    }

    setIsMutating(true);
    try {
      const nextView = await client.reorderTasks({
        planDate: activePlanDate,
        orderedTaskIds
      });
      setPlanView(normalizePlanView(nextView));
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDeleteTask(taskId: number) {
    if (isBusy) {
      return;
    }

    if (!client) {
      setPlanView((current) => removeTaskFromView(current, taskId));
      if (editingTask?.taskId === taskId) {
        setEditingTask(null);
      }
      return;
    }

    setIsMutating(true);
    try {
      const nextView = await client.deleteTask(activePlanDate, taskId);
      setPlanView(normalizePlanView(nextView));
      if (editingTask?.taskId === taskId) {
        setEditingTask(null);
      }
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  const backgroundPaletteElement = isBackgroundPaletteOpen ? (
    <section className="background-palette" aria-label="自定义背景颜色" data-e2e="background-palette">
      <div className="background-palette-head">
        <strong>背景颜色</strong>
        <button type="button" title="关闭" aria-label="关闭调色盘" onClick={() => setIsBackgroundPaletteOpen(false)}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="background-swatch-grid" role="group" aria-label="常用背景色">
        {backgroundPaletteOptions.map((option) => (
          <button
            key={option.color}
            className="background-swatch-option"
            type="button"
            title={option.label}
            aria-label={option.label + " " + option.color}
            aria-pressed={getColorInputValue(backgroundColor) === option.color}
            style={{ "--swatch-color": option.color } as CSSProperties}
            onClick={() => setBackgroundColor(option.color)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <label className="background-native-picker">
        <span>自由选色</span>
        <input
          type="color"
          value={getColorInputValue(backgroundColor)}
          aria-label="自由选择背景颜色"
          onChange={(event) => setBackgroundColor(event.target.value)}
        />
      </label>
      <div className="background-palette-foot">
        <span>{getColorInputValue(backgroundColor).toUpperCase()}</span>
        <button type="button" onClick={() => setIsBackgroundPaletteOpen(false)}>完成</button>
      </div>
    </section>
  ) : null;

  if (isHistoryWindowView) {
    return (
      <main className="app-shell">
        {backgroundPaletteElement}
        <section className="history-window-page route-page" aria-label="历史窗口" data-e2e="history-window-page">
          <div className="history-window-head">
            <div>
              <span>历史窗口</span>
              <strong>按日期查看计划记录</strong>
            </div>
            <button type="button" onClick={() => void loadHistorySummaries()} disabled={isBusy}>
              <RotateCcw size={15} aria-hidden="true" />
              <span>刷新</span>
            </button>
          </div>
          <div className="history-stats" aria-label="统计概览">
            <div>
              <span>总计划</span>
              <strong>{historyOverview.totalPlans}</strong>
            </div>
            <div>
              <span>完成率</span>
              <strong>{historyOverview.completionRate}%</strong>
            </div>
            <div>
              <span>连续</span>
              <strong>{historyOverview.currentStreak}</strong>
            </div>
            <div>
              <span>最佳</span>
              <strong>{historyOverview.bestStreak}</strong>
            </div>
          </div>
          {client?.exportPlanReport ? (
            <div className="history-report-actions" role="group" aria-label="报告导出">
              <button type="button" data-e2e="export-today-excel" disabled={isBusy} onClick={() => void handleExportReport("today", "excel")}>今日 XLS</button>
              <button type="button" data-e2e="export-week-excel" disabled={isBusy} onClick={() => void handleExportReport("week", "excel")}>周表 XLS</button>
              <button type="button" data-e2e="export-month-excel" disabled={isBusy} onClick={() => void handleExportReport("month", "excel")}>月表 XLS</button>
              <button type="button" data-e2e="export-all-excel" disabled={isBusy} onClick={() => void handleExportReport("all", "excel")}>全部 XLS</button>
              <button type="button" data-e2e="export-week-md" disabled={isBusy} onClick={() => void handleExportReport("week", "markdown")}>周报 MD</button>
              <button type="button" data-e2e="export-week-pdf" disabled={isBusy} onClick={() => void handleExportReport("week", "pdf")}>周报 PDF</button>
              <button type="button" data-e2e="export-month-md" disabled={isBusy} onClick={() => void handleExportReport("month", "markdown")}>月报 MD</button>
              <button type="button" data-e2e="export-month-pdf" disabled={isBusy} onClick={() => void handleExportReport("month", "pdf")}>月报 PDF</button>
            </div>
          ) : null}
          {reportExportMessage ? <p className="history-export-status" role="status">{reportExportMessage}</p> : null}
          {historySummaries.length > 0 ? (
            <div className="history-heatmap" aria-label="日历热力图" data-e2e="history-heatmap">
              {historyHeatmapDays.map((day) => (
                <button
                  key={day.planDate}
                  type="button"
                  className={getHistoryHeatmapCellClassName(day.intensity, day.planDate === activePlanDate)}
                  title={getHistoryHeatmapLabel(day)}
                  aria-label={getHistoryHeatmapLabel(day)}
                  disabled={isBusy || !day.hasPlan}
                  onClick={() => void handleLoadPlanDate(day.planDate)}
                >
                  <span>{day.planDate.slice(8)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {selectedHistorySummary ? (
            <div className="history-detail" data-e2e="history-day-detail">
              <div>
                <span>{selectedHistorySummary.planDate}</span>
                <strong>{getHistoryDetailStatus(selectedHistorySummary)}</strong>
              </div>
              <p>
                <BadgePercent size={15} aria-hidden="true" />
                <span>{selectedHistorySummary.doneCount}/{selectedHistorySummary.total} · {selectedHistorySummary.percentage}%</span>
              </p>
              <small>{formatCompletedAt(selectedHistorySummary.completedAt)}</small>
            </div>
          ) : null}
          {historySummaries.length > 0 ? (
            <div className="history-filters" role="group" aria-label="历史筛选">
              {historyFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={historyFilter === option.value}
                  onClick={() => setHistoryFilter(option.value)}
                  disabled={isBusy}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {historySummaries.length === 0 ? <p>暂无历史计划</p> : null}
          {historySummaries.length > 0 && filteredHistorySummaries.length === 0 ? <p>没有符合筛选的计划</p> : null}
          {filteredHistorySummaries.length > 0 ? (
            <div className="history-list" aria-label="按日期查看">
              {filteredHistorySummaries.map((summary) => (
                <button
                  className={summary.planDate === activePlanDate ? "history-row active" : "history-row"}
                  type="button"
                  key={summary.planDate}
                  onClick={() => void handleLoadPlanDate(summary.planDate)}
                  disabled={isBusy}
                >
                  <span className="history-date">{summary.planDate}</span>
                  <span className="history-progress" style={{ "--history-progress": `${summary.percentage}%` } as CSSProperties} aria-hidden="true">
                    <span />
                  </span>
                  <strong>{summary.percentage}%</strong>
                  <small>{getHistoryStatus(summary)}</small>
                </button>
              ))}
            </div>
          ) : null}
          {isLoading ? <div className="sync-banner" role="status"><span>正在加载历史</span></div> : null}
          {errorMessage ? <div className="error-banner" role="alert"><span>{errorMessage}</span></div> : null}
        </section>
      </main>
    );
  }

  if (activeRoute === "control-center") {
    return (
      <main className="app-shell">
        {backgroundPaletteElement}
        <nav className="primary-nav" aria-label="主导航" data-e2e="primary-navigation">
          <button className="primary-nav-button" type="button" data-e2e="history-window" onClick={() => void handleOpenHistoryWindow()} disabled={isBusy}>
            <ExternalLink size={16} aria-hidden="true" />
            <span>历史窗口</span>
          </button>
          <button className="primary-nav-button active" type="button" data-e2e="settings-toggle" aria-current="page" disabled={isBusy}>
            <Settings size={17} aria-hidden="true" />
            <span>控制中心</span>
          </button>
        </nav>
        <section className="control-center-route route-page" aria-label="控制中心" data-e2e="settings-panel" data-control-route={currentControlRoute}>
          {currentControlRoute === "home" ? (
            <>
              <div className="control-route-head">
                <div>
                  <span>控制中心</span>
                  <strong>选择一个设置分类</strong>
                </div>
                <button type="button" data-e2e="control-close" aria-label="返回计划" onClick={() => setActiveRoute("planner")}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="control-category-grid" aria-label="控制中心分类">
                <button type="button" data-e2e="control-category-pet" onClick={() => pushControlRoute("pet")}>
                  <Bot size={22} aria-hidden="true" />
                  <span>桌宠选择</span>
                  <small>角色与外观</small>
                </button>
                <button type="button" data-e2e="control-category-behavior" onClick={() => pushControlRoute("behavior")}>
                  <SlidersHorizontal size={22} aria-hidden="true" />
                  <span>行为设置</span>
                  <small>启动、窗口、动画、拖拽</small>
                </button>
                <button type="button" data-e2e="control-category-intervention" onClick={() => pushControlRoute("intervention")}>
                  <AlarmClock size={22} aria-hidden="true" />
                  <span>干预与夜间总结设置</span>
                  <small>L1-L4 与每日复盘</small>
                </button>
              </div>
              <CommonFeatureSettings
                autoLaunchEnabled={Boolean(autoLaunchSettings?.openAtLogin)}
                autoLaunchReady={Boolean(autoLaunchSettings)}
                hideToTrayOnClose={appSettings.hideToTrayOnClose}
                openHistoryInNewWindow={appSettings.openHistoryInNewWindow}
                showCompletionAnimation={appSettings.showCompletionAnimation}
                disabled={isBusy}
                onToggleAutoLaunch={() => void handleToggleAutoLaunch()}
                onToggleHideToTray={() => void handleToggleAppSetting("hideToTrayOnClose")}
                onToggleOpenHistory={() => void handleToggleAppSetting("openHistoryInNewWindow")}
                onToggleCompletionAnimation={() => void handleToggleAppSetting("showCompletionAnimation")}
              />
            </>
          ) : null}
          {currentControlRoute === "pet" ? (
            <div className="control-detail-page" data-e2e="control-page-pet">
              <div className="control-route-head">
                <button type="button" data-e2e="control-back" onClick={popControlRoute}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>返回</span>
                </button>
                <strong>桌宠选择</strong>
              </div>
              <div className="pet-character-setting" data-e2e="pet-character-setting">
                <span>桌宠角色</span>
                <SegmentedControl
                  label="桌宠角色"
                  options={petCharacterOptions}
                  value={isPetCharacter(appSettings.petCharacter) ? appSettings.petCharacter : getDefaultPetCharacter()}
                  onChange={handlePetCharacterChange}
                  disabled={isBusy}
                />
              </div>
            </div>
          ) : null}
          {currentControlRoute === "behavior" ? (
            <div className="control-detail-page" data-e2e="control-page-behavior">
              <div className="control-route-head">
                <button type="button" data-e2e="control-back" onClick={popControlRoute}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>返回</span>
                </button>
                <strong>行为设置</strong>
              </div>
              <CommonFeatureSettings
                autoLaunchEnabled={Boolean(autoLaunchSettings?.openAtLogin)}
                autoLaunchReady={Boolean(autoLaunchSettings)}
                hideToTrayOnClose={appSettings.hideToTrayOnClose}
                openHistoryInNewWindow={appSettings.openHistoryInNewWindow}
                showCompletionAnimation={appSettings.showCompletionAnimation}
                disabled={isBusy}
                onToggleAutoLaunch={() => void handleToggleAutoLaunch()}
                onToggleHideToTray={() => void handleToggleAppSetting("hideToTrayOnClose")}
                onToggleOpenHistory={() => void handleToggleAppSetting("openHistoryInNewWindow")}
                onToggleCompletionAnimation={() => void handleToggleAppSetting("showCompletionAnimation")}
              />
              <PetBehaviorSetting clickThreshold={appSettings.petClickDodgeThreshold} dodgeDistance={appSettings.petDodgeDistance} burstThreshold={appSettings.petBurstDodgeThreshold} disabled={isBusy} onClickThresholdChange={handlePetClickDodgeThresholdChange} onDodgeDistanceChange={handlePetDodgeDistanceChange} onBurstThresholdChange={handlePetBurstDodgeThresholdChange} />
            </div>
          ) : null}
          {currentControlRoute === "intervention" ? (
            <div className="control-detail-page" data-e2e="control-page-intervention">
              <div className="control-route-head">
                <button type="button" data-e2e="control-back" onClick={popControlRoute}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>返回</span>
                </button>
                <strong>干预与夜间总结设置</strong>
              </div>
              <InterventionThresholdSetting thresholds={appSettings.interventionThresholdMinutes} disabled={isBusy} onChange={handleInterventionThresholdChange} />
              <SettingSwitch icon={<AlarmClock size={17} aria-hidden="true" />} label="夜间总结" checked={appSettings.nightlySummaryEnabled} disabled={isBusy} onToggle={handleNightlySummaryEnabledChange} />
              <NightlySummaryTimeSetting value={appSettings.nightlySummaryTime} disabled={isLoading || isMutating} onChange={handleNightlySummaryTimeChange} />
            </div>
          ) : null}
          {errorMessage ? <div className="error-banner" role="alert"><span>{errorMessage}</span></div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {backgroundPaletteElement}
      <section className="planner-surface route-page" aria-label="每日计划">
        <header className="planner-header">
          <div>
            <p className="date-line">{displayDate.weekday}</p>
            <h1>{isToday ? "今天的计划" : "历史计划"}</h1>
            <p className="date-stamp">{displayDate.date}</p>
          </div>
          <div className="completion-dial" aria-label={`完成度 ${planView.stats.percentage}%`}>
            <span>{planView.stats.percentage}</span>
            <small>%</small>
          </div>
        </header>

        <div className="date-toolbar" aria-label="计划日期">
          <button
            className="date-step-button"
            type="button"
            title="前一天"
            data-e2e="previous-plan-date"
            aria-label="前一天"
            disabled={isBusy}
            onClick={() => void handleLoadPlanDate(shiftPlanDate(activePlanDate, -1))}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <label className="date-picker-wrap">
            <span className="sr-only">计划日期</span>
            <input
              type="date"
              value={activePlanDate}
              disabled={isBusy}
              onChange={(event) => void handleLoadPlanDate(event.target.value)}
            />
          </label>
          <button
            className="date-step-button"
            type="button"
            title="今天"
            data-e2e="today-plan-date"
            aria-label="今天"
            disabled={isBusy}
            onClick={() => void handleLoadToday()}
          >
            <CalendarDays size={17} aria-hidden="true" />
          </button>
          <button
            className="date-step-button"
            type="button"
            title="后一天"
            data-e2e="next-plan-date"
            aria-label="后一天"
            disabled={isBusy}
            onClick={() => void handleLoadPlanDate(shiftPlanDate(activePlanDate, 1))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="primary-nav" aria-label="主导航" data-e2e="primary-navigation">
          <button className="primary-nav-button" type="button" data-e2e="history-window" onClick={() => void handleOpenHistoryWindow()} disabled={isBusy}>
            <ExternalLink size={16} aria-hidden="true" />
            <span>历史窗口</span>
          </button>
          <button
            className="primary-nav-button"
            type="button"
            data-e2e="settings-toggle"
            onClick={() => openControlCenter("home")}
            disabled={isBusy}
          >
            <Settings size={17} aria-hidden="true" />
            <span>控制中心</span>
          </button>
        </nav>

        {isLoading ? (
          <div className="sync-banner" role="status">
            <span>正在加载计划</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="error-banner" role="alert">
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {isEmptyRemoteDate && !isLoading ? (
          <div className="sync-banner" role="status">
            <CalendarDays size={17} aria-hidden="true" />
            <span>这天还没有计划</span>
          </div>
        ) : null}

        {planView.isCompleted ? (
          <div className="done-banner" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>今日清单完成</span>
          </div>
        ) : null}

        {planView.intervention.level !== "none" ? (
          <div className={`intervention-banner intervention-${planView.intervention.level}`} role="status" data-e2e="intervention-banner">
            <strong>{planView.intervention.level.toUpperCase()}</strong>
            <span>{planView.intervention.message}</span>
          </div>
        ) : null}

        <AgentInsightPanel insight={planView.agentInsight} />

        {activeMainQuestTask ? <MainQuestPanel task={activeMainQuestTask} /> : null}

        {shouldShowInterventionOverlay ? (
          <section className={planView.intervention.level === "l4" ? "intervention-overlay is-force" : "intervention-overlay"} role="alertdialog" aria-label="行为干预" data-e2e="intervention-overlay">
            <div className="intervention-panel">
              <strong>{planView.intervention.level === "l4" ? "强制打断" : "屏幕中心干预"}</strong>
              <p>{planView.intervention.message}</p>
              <button type="button" onClick={() => {
                setDismissedInterventionKey(interventionOverlayKey);
                taskInputRef.current?.focus();
              }}>回到任务</button>
            </div>
          </section>
        ) : null}

        {shouldShowNightlySummary ? (
          <NightlySummaryOverlay summary={activeNightlySummary} onClose={() => setDismissedNightlySummaryDate(activeNightlySummary.planDate)} />
        ) : null}

        {isCelebrating ? (
          <div className="celebration-overlay" role="status" data-e2e="completion-celebration">
            <div className="celebration-card">
              <CheckCircle2 size={22} aria-hidden="true" />
              <span>太棒了！全部完成！</span>
            </div>
            <div className="confetti-field" aria-hidden="true">
              {celebrationPieces.map((piece) => (
                <span
                  key={piece.id}
                  style={
                    {
                      "--confetti-x": piece.x,
                      "--confetti-delay": piece.delay,
                      "--confetti-color": piece.color
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        <form className="task-form" onSubmit={handleSubmit}>
          <label className="task-input-wrap">
            <span className="sr-only">任务内容</span>
            <input
              data-e2e="task-content-input"
              ref={taskInputRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="输入新任务"
              maxLength={80}
              disabled={isBusy}
            />
          </label>

          <div className="control-row" aria-label="任务属性">
            <SegmentedControl
              label="紧急程度"
              options={urgencyOptions}
              value={urgency}
              onChange={setUrgency}
              disabled={isBusy}
            />
            <SegmentedControl
              label="任务类型"
              options={categoryOptions}
              value={category}
              onChange={setCategory}
              disabled={isBusy}
            />
            <button className="add-button" type="submit" title="添加任务" aria-label="添加任务" disabled={isBusy}>
              <Plus size={18} aria-hidden="true" />
              <span>添加</span>
            </button>
          </div>
        </form>

        <HabitSection
          habits={planView.habits}
          stats={planView.habitStats}
          disabled={isBusy}
          habitName={habitName}
          habitFrequency={habitFrequency}
          customIntervalDays={customIntervalDays}
          onNameChange={setHabitName}
          onFrequencyChange={setHabitFrequency}
          onCustomIntervalChange={setCustomIntervalDays}
          onSubmit={handleSubmitHabit}
          onToggle={(habit) => void handleHabitCheckIn(habit)}
          onArchive={(habitId) => void handleArchiveHabit(habitId)}
        />

        <TaskSection
          title="待完成"
          count={planView.pendingTasks.length}
          tasks={planView.pendingTasks}
          emptyText="暂无待完成任务"
          action="complete"
          disabled={isBusy}
          editingTask={editingTask}
          mainQuestTaskId={activeMainQuestTaskId}
          onEditDraftChange={handleEditDraftChange}
          onSubmitEdit={handleSubmitTaskEdit}
          onCancelEdit={handleCancelEdit}
          onStartEdit={handleStartEdit}
          onComplete={(taskId) => void handleTaskStatus(taskId, "done")}
          onReopen={(taskId) => void handleTaskStatus(taskId, "pending")}
          onDelete={(taskId) => void handleDeleteTask(taskId)}
          onToggleMainQuest={handleToggleMainQuest}
          onReorder={(orderedTaskIds) => void handleReorderPendingTasks(orderedTaskIds)}
        />

        <TaskSection
          title="已完成"
          count={planView.doneTasks.length}
          tasks={planView.doneTasks}
          emptyText="完成后会出现在这里"
          action="reopen"
          disabled={isBusy}
          editingTask={editingTask}
          mainQuestTaskId={activeMainQuestTaskId}
          onEditDraftChange={handleEditDraftChange}
          onSubmitEdit={handleSubmitTaskEdit}
          onCancelEdit={handleCancelEdit}
          onStartEdit={handleStartEdit}
          onComplete={(taskId) => void handleTaskStatus(taskId, "done")}
          onReopen={(taskId) => void handleTaskStatus(taskId, "pending")}
          onDelete={(taskId) => void handleDeleteTask(taskId)}
          onToggleMainQuest={handleToggleMainQuest}
        />

        <footer className="progress-footer">
          <div className="progress-copy">
            <strong>{planView.stats.doneCount}</strong>
            <span>/</span>
            <span>{planView.stats.total}</span>
          </div>
          <div className="progress-track" style={progressStyle} aria-hidden="true">
            <div className="progress-fill" />
          </div>
        </footer>
      </section>
    </main>
  );
}

interface AgentInsightPanelProps {
  insight: DailyPlanView["agentInsight"];
}

function AgentInsightPanel({ insight }: AgentInsightPanelProps) {
  const riskLabel: Record<DailyPlanView["agentInsight"]["risk"], string> = {
    clear: "稳定",
    watch: "观察",
    risk: "风险",
    blocked: "阻塞"
  };

  return (
    <section className={`agent-insight agent-insight-${insight.risk}`} aria-label="Agent 洞察" data-e2e="agent-insight">
      <div className="agent-insight-head">
        <Bot size={17} aria-hidden="true" />
        <span>Agent Insight</span>
        <strong>{riskLabel[insight.risk]}</strong>
      </div>
      <p>{insight.headline}</p>
      <div className="agent-insight-action">
        <span>下一步</span>
        <strong>{insight.nextAction}</strong>
      </div>
      <small>{insight.reason}</small>
      <div className="agent-insight-signals" aria-label="洞察依据">
        {insight.signals.map((signal) => <span key={signal}>{signal}</span>)}
      </div>
    </section>
  );
}

interface MainQuestPanelProps {
  task: Task;
}

function MainQuestPanel({ task }: MainQuestPanelProps) {
  return (
    <section className={task.status === "done" ? "main-quest-panel is-done" : "main-quest-panel"} aria-label="今日主线任务" data-e2e="main-quest-panel">
      <div className="main-quest-title">
        <Sparkles size={17} aria-hidden="true" />
        <span>Main Quest</span>
        <strong>今日主线</strong>
      </div>
      <p>{task.content}</p>
      <small>{task.status === "done" ? "已完成" : "进行中"}</small>
    </section>
  );
}
interface SegmentedControlProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false }: SegmentedControlProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "active" : ""}
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SettingSwitchProps {
  icon: ReactNode;
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function SettingSwitch({ icon, label, checked, disabled, onToggle }: SettingSwitchProps) {
  return (
    <button className="setting-switch" type="button" aria-pressed={checked} disabled={disabled} onClick={onToggle}>
      <span className="setting-icon" aria-hidden="true">{icon}</span>
      <span className="setting-label">{label}</span>
      <span className="setting-state">{checked ? "开" : "关"}</span>
      <span className="switch-track" aria-hidden="true"><span /></span>
    </button>
  );
}

interface CommonFeatureSettingsProps {
  autoLaunchEnabled: boolean;
  autoLaunchReady: boolean;
  hideToTrayOnClose: boolean;
  openHistoryInNewWindow: boolean;
  showCompletionAnimation: boolean;
  disabled: boolean;
  onToggleAutoLaunch: () => void;
  onToggleHideToTray: () => void;
  onToggleOpenHistory: () => void;
  onToggleCompletionAnimation: () => void;
}

function CommonFeatureSettings({
  autoLaunchEnabled,
  autoLaunchReady,
  hideToTrayOnClose,
  openHistoryInNewWindow,
  showCompletionAnimation,
  disabled,
  onToggleAutoLaunch,
  onToggleHideToTray,
  onToggleOpenHistory,
  onToggleCompletionAnimation
}: CommonFeatureSettingsProps) {
  return (
    <div className="common-feature-settings" data-e2e="common-feature-settings">
      <div className="setting-row-title">
        <span>{"\u5e38\u7528\u529f\u80fd"}</span>
      </div>
      <div className="common-feature-grid">
        <SettingSwitch icon={<Power size={17} aria-hidden="true" />} label={"\u5f00\u673a\u81ea\u542f"} checked={autoLaunchEnabled} disabled={disabled || !autoLaunchReady} onToggle={onToggleAutoLaunch} />
        <SettingSwitch icon={<CheckCircle2 size={17} aria-hidden="true" />} label={"\u5173\u95ed\u9690\u85cf\u5230\u6258\u76d8"} checked={hideToTrayOnClose} disabled={disabled} onToggle={onToggleHideToTray} />
        <SettingSwitch icon={<ExternalLink size={16} aria-hidden="true" />} label={"\u5386\u53f2\u72ec\u7acb\u7a97\u53e3"} checked={openHistoryInNewWindow} disabled={disabled} onToggle={onToggleOpenHistory} />
        <SettingSwitch icon={<Sparkles size={17} aria-hidden="true" />} label={"\u5b8c\u6210\u52a8\u753b"} checked={showCompletionAnimation} disabled={disabled} onToggle={onToggleCompletionAnimation} />
      </div>
    </div>
  );
}

interface InterventionThresholdSettingProps {
  thresholds: AppSettingsState["interventionThresholdMinutes"];
  disabled: boolean;
  onChange: (level: InterventionThresholdLevel, value: number) => void;
}

function InterventionThresholdSetting({ thresholds, disabled, onChange }: InterventionThresholdSettingProps) {
  return (
    <div className="intervention-threshold-setting" data-e2e="intervention-threshold-setting">
      <div className="setting-row-title">
        <span>无进展干预时间</span>
        <small>下面四项都针对“任务长期没有完成或没有推进”的行为，数字表示持续无进展多少分钟后触发。</small>
      </div>
      <div className="threshold-grid">
        {interventionThresholdOptions.map((option) => (
          <label key={option.value}>
            <span>{option.label}</span>
            <small className="threshold-description">{option.description}</small>
            <ConfirmedNumberInput
              value={thresholds[option.value]}
              min={1}
              max={240}
              unit="分钟"
              disabled={disabled}
              dataE2e={`threshold-${option.value}`}
              onConfirm={(nextValue) => onChange(option.value, nextValue)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

interface NightlySummaryTimeSettingProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function NightlySummaryTimeSetting({ value, disabled, onChange }: NightlySummaryTimeSettingProps) {
  return (
    <label className="summary-time-setting" data-e2e="nightly-summary-time">
      <span>总结时间</span>
      <ConfirmedTimeInput value={value} disabled={disabled} dataE2e="nightly-summary-time-input" onConfirm={onChange} />
    </label>
  );
}

interface PetBehaviorSettingProps {
  clickThreshold: number;
  dodgeDistance: number;
  burstThreshold: number;
  disabled: boolean;
  onClickThresholdChange: (value: number) => void;
  onDodgeDistanceChange: (value: number) => void;
  onBurstThresholdChange: (value: number) => void;
}

function PetBehaviorSetting({ clickThreshold, dodgeDistance, burstThreshold, disabled, onClickThresholdChange, onDodgeDistanceChange, onBurstThresholdChange }: PetBehaviorSettingProps) {
  return (
    <div className="pet-behavior-setting" data-e2e="pet-behavior-setting">
      <label>
        <span>点击阈值</span>
        <small className="pet-setting-copy">连续左键点击达到该次数后，桌宠会先普通躲避一次。</small>
        <ConfirmedNumberInput value={clickThreshold} min={3} max={30} unit="次" disabled={disabled} dataE2e="pet-click-threshold" onConfirm={onClickThresholdChange} />
      </label>
      <label>
        <span>躲避距离</span>
        <small className="pet-setting-copy">桌宠每次躲避时离开鼠标的像素距离，越大跳得越远。</small>
        <ConfirmedNumberInput value={dodgeDistance} min={40} max={320} step={10} unit="px" disabled={disabled} dataE2e="pet-dodge-distance" onConfirm={onDodgeDistanceChange} />
      </label>
      <label>
        <span>瞬闪阈值</span>
        <small className="pet-setting-copy">频繁点击达到该次数后开启 10 秒瞬闪，期间鼠标靠近就躲开，避免被按住。</small>
        <ConfirmedNumberInput value={burstThreshold} min={4} max={60} unit="次" disabled={disabled} dataE2e="pet-burst-threshold" onConfirm={onBurstThresholdChange} />
      </label>
    </div>
  );
}

interface ConfirmedNumberInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled: boolean;
  dataE2e: string;
  onConfirm: (value: number) => void;
}

function ConfirmedNumberInput({ value, min, max, step = 1, unit, disabled, dataE2e, onConfirm }: ConfirmedNumberInputProps) {
  const [draftValue, setDraftValue] = useState(String(value));
  const isValid = isNumberDraftValid(draftValue, min, max);
  const parsedValue = isValid ? Number(draftValue) : value;
  const hasChange = isValid && parsedValue !== value;

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function confirmDraft() {
    if (!hasChange) {
      return;
    }
    onConfirm(parsedValue);
  }

  return (
    <div className="confirmed-input-group">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draftValue}
        disabled={disabled}
        data-e2e={dataE2e}
        aria-invalid={!isValid}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirmDraft();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraftValue(String(value));
          }
        }}
      />
      <small>{unit}</small>
      <button className="setting-confirm-button" type="button" disabled={disabled || !hasChange} onClick={confirmDraft} title="确认保存" aria-label="确认保存">
        <Check size={13} aria-hidden="true" />
        <span>确认</span>
      </button>
    </div>
  );
}

interface ConfirmedTimeInputProps {
  value: string;
  disabled: boolean;
  dataE2e: string;
  onConfirm: (value: string) => void;
}

function ConfirmedTimeInput({ value, disabled, dataE2e, onConfirm }: ConfirmedTimeInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const isValid = isSummaryTimeDraftValid(draftValue);
  const hasChange = isValid && draftValue !== value;

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function confirmDraft() {
    if (hasChange) {
      onConfirm(draftValue);
    }
  }

  return (
    <div className="confirmed-input-group summary-time-confirm-group">
      <input
        type="time"
        value={draftValue}
        disabled={disabled}
        data-e2e={dataE2e}
        aria-invalid={!isValid}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirmDraft();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraftValue(value);
          }
        }}
      />
      <button className="setting-confirm-button" type="button" disabled={disabled || !hasChange} onClick={confirmDraft} title="确认保存" aria-label="确认保存">
        <Check size={13} aria-hidden="true" />
        <span>确认</span>
      </button>
    </div>
  );
}

export function isNumberDraftValid(value: string, min: number, max: number): boolean {
  if (!/^\d+$/u.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max;
}

export function isSummaryTimeDraftValid(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}
interface NightlySummaryOverlayProps {
  summary: NightlySummarySnapshot;
  onClose: () => void;
}

function NightlySummaryOverlay({ summary, onClose }: NightlySummaryOverlayProps) {
  return (
    <section className="nightly-summary-overlay" role="alertdialog" aria-label="夜间总结" data-e2e="nightly-summary-overlay">
      <div className="nightly-summary-panel">
        <div className="nightly-summary-head">
          <strong>夜间总结</strong>
          <span>{summary.doneCount}/{summary.total}</span>
        </div>
        <p>{summary.message}</p>
        {summary.pendingTasks.length > 0 ? (
          <ul>
            {summary.pendingTasks.slice(0, 6).map((task) => (
              <li key={task.id}>{task.content}</li>
            ))}
          </ul>
        ) : (
          <div className="nightly-empty">今天的清单已经全部完成</div>
        )}
        <button type="button" onClick={onClose}>知道了</button>
      </div>
    </section>
  );
}

interface HabitSectionProps {
  habits: HabitView[];
  stats: DailyPlanView["habitStats"];
  disabled: boolean;
  habitName: string;
  habitFrequency: HabitFrequency;
  customIntervalDays: number;
  onNameChange: (value: string) => void;
  onFrequencyChange: (value: HabitFrequency) => void;
  onCustomIntervalChange: (value: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (habit: HabitView) => void;
  onArchive: (habitId: number) => void;
}

function HabitSection({
  habits,
  stats,
  disabled,
  habitName,
  habitFrequency,
  customIntervalDays,
  onNameChange,
  onFrequencyChange,
  onCustomIntervalChange,
  onSubmit,
  onToggle,
  onArchive
}: HabitSectionProps) {
  return (
    <section className="habit-section" aria-label="习惯追踪" data-e2e="habit-section">
      <div className="section-heading">
        <h2>习惯追踪</h2>
        <span>{stats.checkedCount}/{stats.total}</span>
      </div>
      <form className="habit-form" onSubmit={onSubmit}>
        <label className="habit-input-wrap">
          <span className="sr-only">习惯名称</span>
          <input
            data-e2e="habit-name-input"
            value={habitName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="添加每日/每周习惯"
            maxLength={40}
            disabled={disabled}
          />
        </label>
        <div className="habit-control-row">
          <SegmentedControl
            label="习惯频率"
            options={habitFrequencyOptions}
            value={habitFrequency}
            onChange={onFrequencyChange}
            disabled={disabled}
          />
          {habitFrequency === "custom" ? (
            <label className="habit-interval-input">
              <span>间隔</span>
              <input
                type="number"
                min={2}
                max={30}
                value={customIntervalDays}
                disabled={disabled}
                onChange={(event) => onCustomIntervalChange(clampHabitInterval(Number(event.target.value)))}
              />
            </label>
          ) : null}
          <button className="add-button" type="submit" title="添加习惯" aria-label="添加习惯" disabled={disabled}>
            <Plus size={18} aria-hidden="true" />
            <span>添加</span>
          </button>
        </div>
      </form>
      {habits.length === 0 ? <p className="empty-state">暂无习惯</p> : null}
      <div className="habit-stack">
        {habits.map((habit) => (
          <article className={habit.isCheckedToday ? "habit-item is-checked" : "habit-item"} key={habit.habit.id}>
            <div className="habit-main">
              <strong>{habit.habit.name}</strong>
              <span>{getHabitFrequencyLabel(habit)}</span>
              <small>{getHabitStatusLabel(habit)}</small>
            </div>
            <div className="habit-actions">
              <button
                type="button"
                title={habit.isCheckedToday ? "撤销打卡" : "今日打卡"}
                aria-label={habit.isCheckedToday ? "撤销打卡" : "今日打卡"}
                data-e2e="habit-check"
                onClick={() => onToggle(habit)}
                disabled={disabled}
              >
                {habit.isCheckedToday ? <RotateCcw size={17} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
              </button>
              <button
                type="button"
                title="归档习惯"
                aria-label="归档习惯"
                data-e2e="habit-archive"
                onClick={() => onArchive(habit.habit.id)}
                disabled={disabled}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
interface TaskSectionProps {
  title: string;
  count: number;
  tasks: Task[];
  emptyText: string;
  action: "complete" | "reopen";
  disabled: boolean;
  editingTask: EditingTaskDraft | null;
  mainQuestTaskId: number | null;
  onEditDraftChange: (patch: Partial<Omit<EditingTaskDraft, "taskId">>) => void;
  onSubmitEdit: (event: FormEvent<HTMLFormElement>, taskId: number) => void;
  onCancelEdit: () => void;
  onStartEdit: (task: Task) => void;
  onComplete: (taskId: number) => void;
  onReopen: (taskId: number) => void;
  onDelete?: (taskId: number) => void;
  onToggleMainQuest: (taskId: number) => void;
  onReorder?: (orderedTaskIds: number[]) => void;
}

function TaskSection({
  title,
  count,
  tasks,
  emptyText,
  action,
  disabled,
  editingTask,
  mainQuestTaskId,
  onEditDraftChange,
  onSubmitEdit,
  onCancelEdit,
  onStartEdit,
  onComplete,
  onReopen,
  onDelete,
  onToggleMainQuest,
  onReorder
}: TaskSectionProps) {
  return (
    <section className="task-section" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
        <span>{count}</span>
      </div>

      {tasks.length === 0 ? <p className="empty-state">{emptyText}</p> : null}

      <div className="task-stack">
        {tasks.map((task) => {
          const isEditing = editingTask?.taskId === task.id;
          const isMainQuest = mainQuestTaskId === task.id;
          const actionDisabled = disabled || (editingTask !== null && !isEditing);

          return (
            <article
              className={`task-item ${task.status === "done" ? "is-done" : ""} ${isEditing ? "is-editing" : ""} ${isMainQuest ? "is-main-quest" : ""}`}
              key={task.id}
              draggable={Boolean(onReorder) && !actionDisabled}
              data-e2e={onReorder ? "draggable-task" : undefined}
              onDragStart={(event) => {
                if (!onReorder || actionDisabled) {
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(task.id));
              }}
              onDragOver={(event) => {
                if (onReorder && !actionDisabled) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                if (!onReorder || actionDisabled) {
                  return;
                }
                event.preventDefault();
                const sourceTaskId = Number(event.dataTransfer.getData("text/plain"));
                if (!Number.isFinite(sourceTaskId)) {
                  return;
                }
                onReorder(moveTaskId(tasks.map((item) => item.id), sourceTaskId, task.id));
              }}
            >
              <div className={`task-marker ${getTaskTone(task)}`} aria-hidden="true" />
              {isEditing && editingTask ? (
                <form className="task-edit-form" onSubmit={(event) => onSubmitEdit(event, task.id)}>
                  <label className="task-edit-input-wrap">
                    <span className="sr-only">编辑任务内容</span>
                    <input
                      data-e2e="task-edit-content"
                      value={editingTask.content}
                      onChange={(event) => onEditDraftChange({ content: event.target.value })}
                      maxLength={80}
                      disabled={disabled}
                    />
                  </label>
                  <div className="task-edit-row">
                    <SegmentedControl
                      label="编辑紧急程度"
                      options={urgencyOptions}
                      value={editingTask.urgency}
                      onChange={(value) => onEditDraftChange({ urgency: value })}
                      disabled={disabled}
                    />
                    <SegmentedControl
                      label="编辑任务类型"
                      options={categoryOptions}
                      value={editingTask.category}
                      onChange={(value) => onEditDraftChange({ category: value })}
                      disabled={disabled}
                    />
                    <div className="task-edit-actions">
                      <button type="submit" title="保存" aria-label="保存" data-e2e="save-task-edit" disabled={disabled}>
                        <Save size={16} aria-hidden="true" />
                      </button>
                      <button type="button" title="取消" aria-label="取消" onClick={onCancelEdit} disabled={disabled}>
                        <X size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <>
                  <div className="task-main">
                    <div className="task-meta">
                      <span>{task.urgency === "urgent" ? <AlarmClock size={14} /> : null}{task.urgency === "urgent" ? "紧急" : "常规"}</span>
                      <span>{task.category === "work" ? <BriefcaseBusiness size={14} /> : <BookOpen size={14} />}{task.category === "work" ? "工作" : "学习"}</span>
                      {isMainQuest ? <span className="main-quest-badge" data-e2e="main-quest-badge"><Sparkles size={14} aria-hidden="true" />今日主线</span> : null}
                    </div>
                    <p>{task.content}</p>
                  </div>
                  <div className="task-actions">
                    <button type="button" title="编辑" aria-label="编辑" data-e2e="edit-task" onClick={() => onStartEdit(task)} disabled={actionDisabled}>
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="main-quest-action"
                      type="button"
                      title={isMainQuest ? "取消今日主线" : "设置为今日主线"}
                      aria-label={isMainQuest ? "取消今日主线" : "设置为今日主线"}
                      aria-pressed={isMainQuest}
                      data-e2e="toggle-main-quest"
                      onClick={() => onToggleMainQuest(task.id)}
                      disabled={actionDisabled}
                    >
                      <Sparkles size={16} aria-hidden="true" />
                    </button>
                    {action === "complete" ? (
                      <button type="button" title="完成" aria-label="完成" data-e2e="complete-task" onClick={() => onComplete(task.id)} disabled={actionDisabled}>
                        <Check size={18} aria-hidden="true" />
                      </button>
                    ) : (
                      <button type="button" title="撤销完成" aria-label="撤销完成" data-e2e="reopen-task" onClick={() => onReopen(task.id)} disabled={actionDisabled}>
                        <RotateCcw size={17} aria-hidden="true" />
                      </button>
                    )}
                    {onDelete ? (
                      <button type="button" title="删除" aria-label="删除" data-e2e="delete-task" onClick={() => onDelete(task.id)} disabled={actionDisabled}>
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getMainQuestTaskId(mainQuestByDate: AppSettingsState["mainQuestByDate"], planDate: string, tasks: Task[]): number | null {
  const taskId = mainQuestByDate[planDate];
  if (!Number.isSafeInteger(taskId) || taskId <= 0) {
    return null;
  }

  return tasks.some((task) => task.id === taskId) ? taskId : null;
}

function updateMainQuestByDate(
  mainQuestByDate: AppSettingsState["mainQuestByDate"],
  planDate: string,
  taskId: number | null
): AppSettingsState["mainQuestByDate"] {
  const nextMainQuestByDate = { ...mainQuestByDate };
  if (taskId === null) {
    delete nextMainQuestByDate[planDate];
  } else {
    nextMainQuestByDate[planDate] = taskId;
  }

  return nextMainQuestByDate;
}

function getInitialBackgroundColor(): string {
  if (typeof window === "undefined") {
    return DEFAULT_BACKGROUND_COLOR;
  }

  try {
    return normalizeHexColor(window.localStorage.getItem(BACKGROUND_COLOR_STORAGE_KEY)) ?? DEFAULT_BACKGROUND_COLOR;
  } catch {
    return DEFAULT_BACKGROUND_COLOR;
  }
}

function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value || !HEX_COLOR_PATTERN.test(value)) {
    return null;
  }

  return value.toLowerCase();
}

function getColorInputValue(color: string): string {
  return normalizeHexColor(color) ?? DEFAULT_BACKGROUND_COLOR;
}

function isBackgroundColorCommand(command: unknown): command is BackgroundColorCommand {
  if (!command || typeof command !== "object") {
    return false;
  }

  const candidate = command as Partial<BackgroundColorCommand>;
  if (candidate.mode === "custom") {
    return true;
  }

  return candidate.mode === "preset" && normalizeHexColor(candidate.color) !== null;
}

type PetDisplayState = PetViewState & { interventionAction: InterventionAction };
type PetInterventionStage = "none" | "stage1" | "stage2" | "stage3" | "stage4";
type PetInterventionMotion = "none" | "bottom-run" | "fullscreen-run" | "center-roll";

interface PetDragSession {
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
}

interface PetDomPosition {
  left: number;
  top: number;
}

interface PetShellProps {
  initialPlan: DailyPlanView;
  planClient: PlanClient | null;
}


export function PetShell({ initialPlan, planClient }: PetShellProps) {
  const [petState, setPetState] = useState<PetDisplayState>(() => buildPetStateFromView(initialPlan));
  const [petCharacter, setPetCharacter] = useState<PetCharacter>(getDefaultPetCharacter());
  const [petBehaviorSettings, setPetBehaviorSettings] = useState(() => getDefaultPetBehaviorSettings());
  const [overrideMood, setOverrideMood] = useState<PetMood | null>(null);
  const [isDodgingPet, setIsDodgingPet] = useState(false);
  const [isBurstDodgingPet, setIsBurstDodgingPet] = useState(false);
  const [isDraggingPet, setIsDraggingPet] = useState(false);
  const [isForceInterventionActive, setIsForceInterventionActive] = useState(() => initialPlan.intervention.action === "force-animation");
  const clickCountRef = useRef(0);
  const resetInteractionRef = useRef<number | null>(null);
  const dodgeTimeoutRef = useRef<number | null>(null);
  const burstDodgeTimeoutRef = useRef<number | null>(null);
  const burstDodgeUntilRef = useRef(0);
  const lastBurstDodgeAtRef = useRef(0);
  const dragSessionRef = useRef<PetDragSession | null>(null);
  const dragShakeRef = useRef<PetDragShakeState | null>(null);
  const dragDistanceRef = useRef(0);
  const dragStartedAtRef = useRef(0);
  const dragInitLockRef = useRef(false);
  const dragOffsetXRef = useRef<number | null>(null);
  const dragOffsetYRef = useRef<number | null>(null);
  const petStageRef = useRef<HTMLDivElement | null>(null);
  const petRigRef = useRef<HTMLDivElement | null>(null);
  const petPositionRef = useRef<PetDomPosition>({ left: 0, top: 0 });
  const petMousePassthroughRef = useRef<boolean | null>(null);
  const suppressNextClickRef = useRef(false);
  const idleAnimationFrameRef = useRef<number | null>(null);
  const idleAnimationIntervalRef = useRef<number | null>(null);
  const interventionMotionFrameRef = useRef<number | null>(null);
  const forceInterventionTimeoutRef = useRef<number | null>(null);
  const forceInterventionSeenRef = useRef(false);
  const dizzyTimeoutRef = useRef<number | null>(null);
  const dizzyUntilRef = useRef(0);
  const dizzyTokenRef = useRef(0);

  const setPetMousePassthrough = (shouldIgnore: boolean) => {
    petMousePassthroughRef.current = shouldIgnore;
    void planClient?.setPetMousePassthrough?.(shouldIgnore);
  };

  const syncPetPositionRefFromDom = () => {
    const rig = petRigRef.current;
    if (!rig) {
      return petPositionRef.current;
    }

    const position = { left: rig.offsetLeft, top: rig.offsetTop };
    petPositionRef.current = position;
    return position;
  };

  const applyPetDomPosition = (left: number, top: number, source: "auto" | "drag" = "auto"): boolean => {
    if (source !== "drag" && (dragSessionRef.current !== null || dragInitLockRef.current)) {
      return false;
    }

    const rig = petRigRef.current;
    if (!rig) {
      petPositionRef.current = { left, top };
      return false;
    }

    const nextPosition = clampPetDomPosition({
      targetX: left,
      targetY: top,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      petWidth: rig.offsetWidth,
      petHeight: rig.offsetHeight
    });
    const currentLeft = rig.offsetLeft;
    const currentTop = rig.offsetTop;
    if (currentLeft === nextPosition.left && currentTop === nextPosition.top) {
      petPositionRef.current = nextPosition;
      return false;
    }

    rig.style.left = `${nextPosition.left}px`;
    rig.style.top = `${nextPosition.top}px`;
    petPositionRef.current = nextPosition;
    return true;
  };

  const schedulePetIdleClamp = () => {
    if (idleAnimationFrameRef.current !== null) {
      return;
    }

    idleAnimationFrameRef.current = window.requestAnimationFrame(() => {
      idleAnimationFrameRef.current = null;
      if (isPetDragActive()) {
        return;
      }

      const position = syncPetPositionRefFromDom();
      applyPetDomPosition(position.left, position.top);
    });
  };

  const cancelPetIdleAnimation = () => {
    if (idleAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(idleAnimationFrameRef.current);
      idleAnimationFrameRef.current = null;
    }
    if (idleAnimationIntervalRef.current !== null) {
      window.clearInterval(idleAnimationIntervalRef.current);
      idleAnimationIntervalRef.current = null;
    }
  };

  const startPetIdleAnimation = () => {
    if (idleAnimationIntervalRef.current !== null) {
      return;
    }

    schedulePetIdleClamp();
    idleAnimationIntervalRef.current = window.setInterval(schedulePetIdleClamp, 1000);
  };

  const cancelPetInterventionMotion = () => {
    if (interventionMotionFrameRef.current !== null) {
      window.cancelAnimationFrame(interventionMotionFrameRef.current);
      interventionMotionFrameRef.current = null;
    }
  };

  const cancelPetVisualAnimationForDrag = () => {
    const rig = petRigRef.current;
    if (!rig) {
      return;
    }

    rig.style.animation = "none";
    rig.style.transform = "none";
    for (const child of Array.from(rig.querySelectorAll<HTMLElement>("*"))) {
      child.style.animationPlayState = "paused";
      child.style.transition = "none";
    }
  };

  const restartPetVisualAnimationAfterDrag = () => {
    const rig = petRigRef.current;
    if (!rig) {
      return;
    }

    rig.style.animation = "";
    rig.style.transform = "";
    for (const child of Array.from(rig.querySelectorAll<HTMLElement>("*"))) {
      child.style.animationPlayState = "";
      child.style.transition = "";
    }
  };
  const isPetInteractionPointer = (pointer: { clientX: number; clientY: number }) => {
    const stageBounds = petStageRef.current?.getBoundingClientRect();
    if (stageBounds) {
      return isPointerInsideElementBounds(pointer, stageBounds, 8);
    }

    return isPointerInsidePetInteractionZone({
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });
  };

  useEffect(() => {
    document.documentElement.classList.add("pet-window-root");
    document.body.classList.add("pet-window-body");
    return () => {
      document.documentElement.classList.remove("pet-window-root");
      document.body.classList.remove("pet-window-body");
    };
  }, []);

  useEffect(() => {
    const placePetAtRestPosition = () => {
      applyPetDomPosition(window.innerWidth - 210, window.innerHeight - 220);
    };

    const frameId = window.requestAnimationFrame(() => {
      placePetAtRestPosition();
      startPetIdleAnimation();
    });
    window.addEventListener("resize", schedulePetIdleClamp);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", schedulePetIdleClamp);
      cancelPetIdleAnimation();
    };
  }, []);
  useEffect(() => {
    if (!planClient) {
      return;
    }

    let isMounted = true;
    const refreshPetState = () => {
      planClient.getTodayPlan()
        .then((view) => {
          if (isMounted) {
            setPetState(buildPetStateFromView(view));
          }
        })
        .catch(() => undefined);
    };

    refreshPetState();
    const intervalId = window.setInterval(refreshPetState, 60_000);
    const unsubscribe = planClient.onPetStatus?.((status) => {
      if (isPetStatusPayload(status)) {
        setPetState(buildPetStateFromStatus(status));
      }
    });

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      unsubscribe?.();
    };
  }, [planClient]);

  useEffect(() => {
    if (!planClient?.getAppSettings) {
      setPetCharacter(getDefaultPetCharacter());
      return;
    }

    let isMounted = true;
    planClient.getAppSettings()
      .then((settings) => {
        if (isMounted) {
          if (isPetCharacter(settings.petCharacter)) {
            setPetCharacter(settings.petCharacter);
          }
          setPetBehaviorSettings(getPetBehaviorSettings(settings));
        }
      })
      .catch(() => undefined);

    const unsubscribe = planClient.onAppSettings?.((settings) => {
      if (isPetCharacter(settings.petCharacter)) {
        setPetCharacter(settings.petCharacter);
      }
      setPetBehaviorSettings(getPetBehaviorSettings(settings));
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [planClient]);

  useEffect(() => {
    setPetMousePassthrough(true);
    return () => {
      petMousePassthroughRef.current = null;
      void planClient?.setPetMousePassthrough?.(false);
    };
  }, [planClient]);

  useEffect(() => () => {
    if (resetInteractionRef.current !== null) {
      window.clearTimeout(resetInteractionRef.current);
    }

    if (dodgeTimeoutRef.current !== null) {
      window.clearTimeout(dodgeTimeoutRef.current);
    }
    if (burstDodgeTimeoutRef.current !== null) {
      window.clearTimeout(burstDodgeTimeoutRef.current);
    }
    if (forceInterventionTimeoutRef.current !== null) {
      window.clearTimeout(forceInterventionTimeoutRef.current);
      forceInterventionTimeoutRef.current = null;
    }
    cancelPetInterventionMotion();
    if (dizzyTimeoutRef.current !== null) {
      window.clearTimeout(dizzyTimeoutRef.current);
      dizzyTimeoutRef.current = null;
    }
    dizzyUntilRef.current = 0;
    dizzyTokenRef.current += 1;
  }, []);

  useEffect(() => {
    const isForceIntervention = petState.interventionAction === "force-animation";
    if (!isForceIntervention) {
      forceInterventionSeenRef.current = false;
      if (forceInterventionTimeoutRef.current !== null) {
        window.clearTimeout(forceInterventionTimeoutRef.current);
        forceInterventionTimeoutRef.current = null;
      }
      setIsForceInterventionActive(false);
      return;
    }

    if (forceInterventionSeenRef.current) {
      return;
    }

    forceInterventionSeenRef.current = true;
    setIsForceInterventionActive(true);
    if (forceInterventionTimeoutRef.current !== null) {
      window.clearTimeout(forceInterventionTimeoutRef.current);
    }
    forceInterventionTimeoutRef.current = window.setTimeout(() => {
      setIsForceInterventionActive(false);
      forceInterventionTimeoutRef.current = null;
    }, PET_FORCE_INTERVENTION_MS);
  }, [petState.interventionAction]);

  const petInterventionMotion = getPetInterventionMotion(petState.interventionAction, isForceInterventionActive);

  useEffect(() => {
    cancelPetInterventionMotion();
    if (petInterventionMotion === "none") {
      return;
    }

    const startedAt = window.performance.now();
    const tick = (timestamp: number) => {
      interventionMotionFrameRef.current = null;
      if (!isPetDragActive()) {
        const rig = petRigRef.current;
        if (rig) {
          const nextPosition = calculatePetInterventionMotionPosition({
            motion: petInterventionMotion,
            elapsedMs: timestamp - startedAt,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            petWidth: rig.offsetWidth,
            petHeight: rig.offsetHeight
          });
          applyPetDomPosition(nextPosition.left, nextPosition.top);
        }
      }
      interventionMotionFrameRef.current = window.requestAnimationFrame(tick);
    };

    interventionMotionFrameRef.current = window.requestAnimationFrame(tick);
    return cancelPetInterventionMotion;
  }, [petInterventionMotion]);

  const isPetDragActive = () => dragSessionRef.current !== null || dragInitLockRef.current;

  const shouldIgnoreE2EMouseMove = (event: MouseEvent) => Boolean((window as Window & { __letsPlanPetDragE2E?: boolean }).__letsPlanPetDragE2E && !(event as MouseEvent & { __letsPlanPetDragSynthetic?: boolean }).__letsPlanPetDragSynthetic);

  const syncPetMousePassthroughForPointer = (pointer: { clientX: number; clientY: number }): boolean => {
    if (isPetDragActive()) {
      setPetMousePassthrough(false);
      return true;
    }

    const isInsidePet = isPetInteractionPointer(pointer);
    setPetMousePassthrough(!isInsidePet);
    return isInsidePet;
  };

  const triggerPetDodge = (pointer: { clientX: number; clientY: number }, activeMs = 760) => {
    if (isPetDragActive()) {
      return;
    }

    const rig = petRigRef.current;
    if (!rig) {
      return;
    }

    const position = syncPetPositionRefFromDom();
    const delta = calculatePetDodgeDelta({
      pointerX: pointer.clientX,
      pointerY: pointer.clientY,
      windowX: position.left,
      windowY: position.top,
      windowWidth: rig.offsetWidth,
      windowHeight: rig.offsetHeight,
      dodgeDistance: petBehaviorSettings.dodgeDistance
    });
    setIsDodgingPet(true);
    setOverrideMood("escape");
    applyPetDomPosition(position.left + delta.deltaX, position.top + delta.deltaY);
    if (dodgeTimeoutRef.current !== null) {
      window.clearTimeout(dodgeTimeoutRef.current);
    }
    dodgeTimeoutRef.current = window.setTimeout(() => {
      setIsDodgingPet(false);
      dodgeTimeoutRef.current = null;
    }, activeMs);
  };

  const isPetBurstDodgeActive = () => Date.now() < burstDodgeUntilRef.current;

  const triggerPetBurstDodge = (pointer?: { clientX: number; clientY: number }) => {
    burstDodgeUntilRef.current = Date.now() + PET_BURST_DODGE_MS;
    setIsBurstDodgingPet(true);
    setOverrideMood("escape");
    if (pointer) {
      triggerPetDodge(pointer, PET_BURST_DODGE_MS);
    }
    if (burstDodgeTimeoutRef.current !== null) {
      window.clearTimeout(burstDodgeTimeoutRef.current);
    }
    burstDodgeTimeoutRef.current = window.setTimeout(() => {
      burstDodgeUntilRef.current = 0;
      setIsBurstDodgingPet(false);
      setIsDodgingPet(false);
      setOverrideMood(null);
      clickCountRef.current = 0;
      burstDodgeTimeoutRef.current = null;
    }, PET_BURST_DODGE_MS);
  };

  const tryBurstDodgeFromPointer = (pointer: { clientX: number; clientY: number }) => {
    if (isPetDragActive()) {
      return;
    }

    const now = Date.now();
    if (!isPetBurstDodgeActive() || now - lastBurstDodgeAtRef.current < PET_BURST_DODGE_COOLDOWN_MS) {
      return;
    }
    lastBurstDodgeAtRef.current = now;
    triggerPetDodge(pointer, PET_BURST_DODGE_MS);
  };

  const triggerPetDizzy = (pointer: { clientX: number; clientY: number }, now = Date.now()): boolean => {
    dragShakeRef.current = createPetDragShakeState(pointer.clientX, pointer.clientY, now);
    if (now < dizzyUntilRef.current) {
      return false;
    }

    dizzyUntilRef.current = now + PET_DIZZY_RECOVER_MS;
    dizzyTokenRef.current += 1;
    const token = dizzyTokenRef.current;
    setOverrideMood("dizzy");
    if (dizzyTimeoutRef.current !== null) {
      window.clearTimeout(dizzyTimeoutRef.current);
    }
    dizzyTimeoutRef.current = window.setTimeout(() => {
      if (dizzyTokenRef.current !== token) {
        return;
      }

      dizzyUntilRef.current = 0;
      setOverrideMood((current) => current === "dizzy" ? null : current);
      dizzyTimeoutRef.current = null;
    }, PET_DIZZY_RECOVER_MS);
    return true;
  };

  const registerPetClick = (pointer?: { clientX: number; clientY: number }) => {
    clickCountRef.current += 1;
    const warningThreshold = Math.max(3, Math.floor(petBehaviorSettings.clickDodgeThreshold / 2));
    const nextMood: PetMood | null = clickCountRef.current >= petBehaviorSettings.clickDodgeThreshold ? "escape" : clickCountRef.current >= warningThreshold ? "warning" : null;
    if (clickCountRef.current >= petBehaviorSettings.burstDodgeThreshold) {
      triggerPetBurstDodge(pointer);
      clickCountRef.current = 0;
      return;
    }
    if (nextMood) {
      setOverrideMood(nextMood);
    }
    if (clickCountRef.current >= petBehaviorSettings.clickDodgeThreshold && pointer) {
      triggerPetDodge(pointer);
    }
    if (resetInteractionRef.current !== null) {
      window.clearTimeout(resetInteractionRef.current);
    }
    resetInteractionRef.current = window.setTimeout(() => {
      clickCountRef.current = 0;
      setOverrideMood(null);
    }, nextMood === "escape" ? 4200 : 2600);
  };


  const moveActivePetDragFromMouse = (pointer: { clientX: number; clientY: number }): boolean => {
    const dragSession = dragSessionRef.current;
    const dragOffsetX = dragOffsetXRef.current;
    const dragOffsetY = dragOffsetYRef.current;
    const rig = petRigRef.current;
    if (!dragSession || dragOffsetX === null || dragOffsetY === null || !rig) {
      return false;
    }

    if (pointer.clientX === dragSession.lastClientX && pointer.clientY === dragSession.lastClientY) {
      return true;
    }

    const nextPosition = calculatePetDragTarget({
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      dragOffsetX,
      dragOffsetY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      petWidth: rig.offsetWidth,
      petHeight: rig.offsetHeight
    });
    dragSession.lastClientX = pointer.clientX;
    dragSession.lastClientY = pointer.clientY;

    if (dragShakeRef.current) {
      const now = Date.now();
      const update = updatePetDragShakeState(dragShakeRef.current, pointer.clientX, pointer.clientY, now);
      dragDistanceRef.current = update.state.totalDistance;
      if (update.shouldDizzy) {
        triggerPetDizzy(pointer, now);
      } else {
        dragShakeRef.current = update.state;
      }
    }

    const currentLeft = rig.offsetLeft;
    const currentTop = rig.offsetTop;
    if (currentLeft === nextPosition.left && currentTop === nextPosition.top) {
      petPositionRef.current = nextPosition;
      return true;
    }

    rig.style.left = `${nextPosition.left}px`;
    rig.style.top = `${nextPosition.top}px`;
    petPositionRef.current = nextPosition;
    suppressNextClickRef.current = true;
    return true;
  };

  const stopPetDragSession = () => {
    const hadDragState = dragSessionRef.current !== null || dragInitLockRef.current;
    if (!hadDragState) {
      return;
    }

    dragSessionRef.current = null;
    dragInitLockRef.current = false;
    dragOffsetXRef.current = null;
    dragOffsetYRef.current = null;
    dragShakeRef.current = null;
    dragDistanceRef.current = 0;
    dragStartedAtRef.current = 0;
    setIsDraggingPet(false);
    restartPetVisualAnimationAfterDrag();
    startPetIdleAnimation();
  };

  const markDragReleaseForClickSuppression = () => {
    const heldMs = dragStartedAtRef.current > 0 ? Date.now() - dragStartedAtRef.current : 0;
    if (dragDistanceRef.current > 6 || heldMs > 250) {
      suppressNextClickRef.current = true;
    }
  };

  const startPetDragSession = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || dragInitLockRef.current) {
      return false;
    }
    if (!isPetInteractionPointer(event)) {
      syncPetMousePassthroughForPointer(event);
      return false;
    }

    const rig = petRigRef.current;
    if (!rig) {
      return false;
    }

    event.preventDefault();
    dragInitLockRef.current = true;
    cancelPetIdleAnimation();
    cancelPetVisualAnimationForDrag();
    setPetMousePassthrough(false);
    syncPetPositionRefFromDom();
    void rig.offsetWidth;

    const dragOffsetX = event.clientX - rig.offsetLeft;
    const dragOffsetY = event.clientY - rig.offsetTop;
    dragOffsetXRef.current = dragOffsetX;
    dragOffsetYRef.current = dragOffsetY;
    dragSessionRef.current = {
      pointerId: -1,
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };
    dragShakeRef.current = createPetDragShakeState(event.clientX, event.clientY, Date.now());
    dragDistanceRef.current = 0;
    dragStartedAtRef.current = Date.now();
    setIsDraggingPet(true);
    return true;
  };

  const handlePetPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button === 2) {
      if (syncPetMousePassthroughForPointer(event)) {
        suppressNextClickRef.current = true;
      }
      return;
    }

    if (event.button === 0) {
      syncPetMousePassthroughForPointer(event);
    }
  };

  const handlePetMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    startPetDragSession(event);
  };

  const handlePetPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (isPetDragActive()) {
      setPetMousePassthrough(false);
      return;
    }

    if (syncPetMousePassthroughForPointer(event)) {
      tryBurstDodgeFromPointer(event);
    }
  };

  const stopPetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isPetDragActive() || event.button !== 0) {
      return;
    }

    markDragReleaseForClickSuppression();
    stopPetDragSession();
    syncPetMousePassthroughForPointer(event);
  };

  const handlePetPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isPetDragActive()) {
      syncPetMousePassthroughForPointer(event);
    }
  };

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!isPetDragActive()) {
        return;
      }
      if (shouldIgnoreE2EMouseMove(event)) {
        return;
      }
      moveActivePetDragFromMouse(event);
    };

    const handleWindowMouseUp = (event: MouseEvent) => {
      if (event.button === 0 && (isPetDragActive() || dragInitLockRef.current)) {
        markDragReleaseForClickSuppression();
        stopPetDragSession();
        syncPetMousePassthroughForPointer(event);
      }
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (isPetDragActive()) {
        setPetMousePassthrough(false);
        return;
      }
      syncPetMousePassthroughForPointer(event);
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (event.button === 0 && (isPetDragActive() || dragInitLockRef.current)) {
        markDragReleaseForClickSuppression();
        stopPetDragSession();
        syncPetMousePassthroughForPointer(event);
      }
    };

    const handleWindowBlur = () => {
      if (!isPetDragActive() && !dragInitLockRef.current) {
        return;
      }

      markDragReleaseForClickSuppression();
      stopPetDragSession();
      setPetMousePassthrough(true);
    };

    window.addEventListener("mousemove", handleWindowMouseMove, true);
    window.addEventListener("mouseup", handleWindowMouseUp, true);
    window.addEventListener("pointermove", handleWindowPointerMove, true);
    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("blur", handleWindowBlur, true);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove, true);
      window.removeEventListener("mouseup", handleWindowMouseUp, true);
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("blur", handleWindowBlur, true);
      dragSessionRef.current = null;
      dragInitLockRef.current = false;
      dragOffsetXRef.current = null;
      dragOffsetYRef.current = null;
      dragShakeRef.current = null;
    };
  }, []);

  const handlePetClick = (event?: ReactMouseEvent<HTMLElement>) => {
    if (event && !isPetInteractionPointer(event)) {
      return;
    }
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    registerPetClick(event);
  };
  const displayState = isBurstDodgingPet
    ? { ...petState, mood: "escape" as PetMood, message: "瞬闪中，10 秒后复原", interventionAction: "none" as InterventionAction }
    : overrideMood ? { ...petState, mood: overrideMood, message: getPetInteractionMessage(overrideMood, petState.message) } : petState;
  const interventionStage = getPetInterventionStage(displayState.interventionAction, isForceInterventionActive);
  const shouldShowForceStudyText = interventionStage === "stage4";

  return (
    <main
      className={`pet-shell pet-${displayState.mood} pet-action-${displayState.interventionAction ?? "none"} pet-intervention-${interventionStage}${shouldShowForceStudyText ? " is-force-intervention-active" : ""}${isDraggingPet ? " is-grabbed" : ""}${isBurstDodgingPet ? " is-burst-dodging" : ""}`}
      data-e2e="desktop-pet"
      data-intervention-stage={interventionStage}
      role="button"
      tabIndex={0}
      aria-label={`LetsPlan ${displayState.percentage}%`}
      onPointerDown={handlePetPointerDown}
      onMouseDown={handlePetMouseDown}
      onPointerMove={handlePetPointerMove}
      onMouseMove={(event) => {
        syncPetMousePassthroughForPointer(event);
      }}
      onMouseLeave={() => {
        if (!isPetDragActive()) {
          setPetMousePassthrough(true);
        }
      }}
      onPointerUp={stopPetDrag}
      onPointerCancel={handlePetPointerCancel}
      onClick={handlePetClick}
      onContextMenu={(event) => {
        event.preventDefault();
        if (planClient?.openPetContextMenu) {
          planClient.openPetContextMenu();
          return;
        }
        return;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handlePetClick();
        }
      }}
    >
      {shouldShowForceStudyText ? (
        <div className="pet-force-text-field" data-e2e="pet-force-text-field" aria-hidden="true">
          {PET_FORCE_TEXT_ITEMS.map((item) => (
            <span
              key={item.id}
              style={{
                "--pet-force-text-left": item.left,
                "--pet-force-text-top": item.top,
                "--pet-force-text-delay": item.delay,
                "--pet-force-text-duration": item.duration
              } as CSSProperties}
            >
              {PET_FORCE_STUDY_TEXT}
            </span>
          ))}
        </div>
      ) : null}
      <div className="pet-rig" ref={petRigRef}>
        <div className="pet-bubble">
          <strong>{displayState.percentage}%</strong>
          <span>{displayState.message}</span>
        </div>
        <div className="pet-stage" ref={petStageRef} aria-hidden="true">
          <PetSprite character={petCharacter} mood={displayState.mood} />
          <div className="pet-shadow" />
        </div>
      </div>
    </main>
  );
}

function isPointerInsideElementBounds(pointer: { clientX: number; clientY: number }, bounds: DOMRect, padding = 0): boolean {
  return pointer.clientX >= bounds.left - padding
    && pointer.clientX <= bounds.right + padding
    && pointer.clientY >= bounds.top - padding
    && pointer.clientY <= bounds.bottom + padding;
}

function toPetProgress(view: DailyPlanView): PetProgress {
  return {
    total: view.stats.total,
    doneCount: view.stats.doneCount,
    percentage: view.stats.percentage
  };
}

interface PetStatusSnapshot extends PetProgress {
  interventionLevel?: string;
  interventionAction?: InterventionAction;
  interventionMessage?: string;
  nightlySummary?: NightlySummarySnapshot;
}

function buildPetStateFromView(view: DailyPlanView): PetDisplayState {
  return buildPetStateFromStatus({
    ...toPetProgress(view),
    interventionLevel: view.intervention.level,
    interventionAction: view.intervention.action,
    interventionMessage: view.intervention.message,
    nightlySummary: view.nightlySummary
  });
}

function buildPetStateFromStatus(status: PetStatusSnapshot): PetDisplayState {
  const state = buildPetViewState(status);
  if (status.nightlySummary?.shouldShow) {
    return {
      ...state,
      interventionAction: "center-intervention",
      mood: "warning",
      message: status.nightlySummary.message
    };
  }
  if (status.interventionLevel && status.interventionLevel !== "none") {
    const interventionAction = status.interventionAction && status.interventionAction !== "none" ? status.interventionAction : "hint";
    return {
      ...state,
      interventionAction,
      mood: getPetMoodForInterventionAction(interventionAction),
      message: status.interventionMessage || state.message
    };
  }

  return { ...state, interventionAction: "none" };
}

function isPetStatusPayload(value: unknown): value is PetStatusSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<PetStatusSnapshot>;
  return typeof payload.total === "number" && typeof payload.doneCount === "number" && typeof payload.percentage === "number";
}

function getPetInteractionMessage(mood: PetMood, fallback: string): string {
  if (mood === "warning") {
    return "点太快啦，先做一小步";
  }
  if (mood === "escape") {
    return "先别抓我，去完成一个小任务";
  }
  if (mood === "dizzy") {
    return "\u6655\u4e4e\u4e4e\u7684\uff0c\u522b\u6643\u5566";
  }

  return fallback;
}

function getPetMoodForInterventionAction(action: InterventionAction): PetMood {
  return action === "pet-approach" || action === "center-intervention" || action === "force-animation" ? "escape" : "warning";
}

function getPetInterventionStage(action: InterventionAction, isForceInterventionActive: boolean): PetInterventionStage {
  if (action === "hint") {
    return "stage1";
  }
  if (action === "pet-approach") {
    return "stage2";
  }
  if (action === "center-intervention") {
    return "stage3";
  }
  if (action === "force-animation" && isForceInterventionActive) {
    return "stage4";
  }

  return "none";
}

function getPetInterventionMotion(action: InterventionAction, isForceInterventionActive: boolean): PetInterventionMotion {
  if (action === "pet-approach") {
    return "bottom-run";
  }
  if (action === "center-intervention") {
    return "fullscreen-run";
  }
  if (action === "force-animation" && isForceInterventionActive) {
    return "center-roll";
  }

  return "none";
}

interface PetInterventionMotionInput {
  motion: PetInterventionMotion;
  elapsedMs: number;
  viewportWidth: number;
  viewportHeight: number;
  petWidth: number;
  petHeight: number;
}

function calculatePetInterventionMotionPosition(input: PetInterventionMotionInput): PetDomPosition {
  const maxX = Math.max(0, input.viewportWidth - input.petWidth);
  const maxY = Math.max(0, input.viewportHeight - input.petHeight);
  if (input.motion === "center-roll") {
    return { left: Math.round(maxX / 2), top: Math.round(maxY / 2) };
  }
  if (input.motion === "bottom-run") {
    const cycleMs = 5200;
    const progress = (input.elapsedMs % cycleMs) / cycleMs;
    const bounce = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
    return { left: Math.round(maxX * bounce), top: maxY };
  }
  if (input.motion === "fullscreen-run") {
    const x = maxX * (0.5 + Math.sin(input.elapsedMs / 780) * 0.5);
    const y = maxY * (0.5 + Math.sin(input.elapsedMs / 530 + Math.PI / 3) * 0.5);
    return { left: Math.round(x), top: Math.round(y) };
  }

  return { left: 0, top: 0 };
}

function getWindowPlanClient(): PlanClient | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.letsPlan ?? null;
}

function getInitialViewMode(): "planner" | "history" | "pet" | "control" {
  if (typeof window === "undefined") {
    return "planner";
  }

  const view = new URLSearchParams(window.location.search).get("view");
  return view === "history" || view === "pet" || view === "control" ? view : "planner";
}

function buildPlanSummary(view: DailyPlanView): PlanSummary {
  return {
    planDate: view.plan.planDate,
    completedAt: view.plan.completedAt,
    total: view.stats.total,
    doneCount: view.stats.doneCount,
    percentage: view.stats.percentage,
    isCompleted: view.isCompleted
  };
}

function getHistoryStatus(summary: PlanSummary): string {
  if (summary.total === 0) {
    return "无任务";
  }

  return summary.isCompleted ? "完成" : `${summary.doneCount}/${summary.total}`;
}

function getHistoryDetailStatus(summary: PlanSummary): string {
  if (summary.total === 0) {
    return "暂无任务";
  }

  return summary.isCompleted ? "已完成" : "未完成";
}

function getHistoryHeatmapCellClassName(intensity: number, isActive: boolean): string {
  return `heatmap-cell heatmap-${intensity}${isActive ? " active" : ""}`;
}

function getHistoryHeatmapLabel(day: { planDate: string; total: number; doneCount: number; percentage: number; hasPlan: boolean }): string {
  if (!day.hasPlan) {
    return `${day.planDate} 暂无记录`;
  }

  return `${day.planDate} ${day.doneCount}/${day.total} ${day.percentage}%`;
}

function formatCompletedAt(completedAt: string | null): string {
  if (!completedAt) {
    return "未记录完成时间";
  }

  const timePart = completedAt.slice(11, 16);
  return `完成于 ${timePart || completedAt}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

function formatDisplayDate(planDate: string): { date: string; weekday: string } {
  const [year, month, day] = planDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
  const parts = formatter.formatToParts(date);

  return {
    date: `${parts.find((part) => part.type === "year")?.value ?? year}年${parts.find((part) => part.type === "month")?.value ?? month}月${parts.find((part) => part.type === "day")?.value ?? day}日`,
    weekday: parts.find((part) => part.type === "weekday")?.value ?? ""
  };
}

function formatPlanInputDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date);
}

function getTaskTone(task: Task): string {
  if (task.urgency === "urgent" && task.category === "work") {
    return "tone-red";
  }
  if (task.urgency === "urgent" && task.category === "study") {
    return "tone-orange";
  }
  if (task.category === "work") {
    return "tone-blue";
  }

  return "tone-green";
}

function clampHabitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 2;
  }

  return Math.max(2, Math.min(30, Math.trunc(value)));
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function getDefaultPetBehaviorSettings() {
  return {
    clickDodgeThreshold: defaultAppSettings.petClickDodgeThreshold,
    dodgeDistance: defaultAppSettings.petDodgeDistance,
    burstDodgeThreshold: defaultAppSettings.petBurstDodgeThreshold
  };
}

function getPetBehaviorSettings(settings: Pick<AppSettingsState, "petClickDodgeThreshold" | "petDodgeDistance" | "petBurstDodgeThreshold">) {
  return {
    clickDodgeThreshold: clampInteger(settings.petClickDodgeThreshold, 3, 30, defaultAppSettings.petClickDodgeThreshold),
    dodgeDistance: clampInteger(settings.petDodgeDistance, 40, 320, defaultAppSettings.petDodgeDistance),
    burstDodgeThreshold: clampInteger(settings.petBurstDodgeThreshold, 4, 60, defaultAppSettings.petBurstDodgeThreshold)
  };
}

function getHabitFrequencyLabel(habit: HabitView): string {
  if (habit.habit.frequency === "weekly") {
    return "每周";
  }
  if (habit.habit.frequency === "custom") {
    return `每 ${habit.habit.customIntervalDays ?? 3} 天`;
  }

  return "每天";
}

function getHabitStatusLabel(habit: HabitView): string {
  if (habit.isCheckedToday) {
    return `已打卡 · 连续 ${habit.streak}`;
  }
  if (habit.isBroken) {
    return "已断签，今天恢复";
  }
  if (habit.canRecover) {
    return `可恢复 · 连续 ${habit.streak}`;
  }

  return habit.streak > 0 ? `连续 ${habit.streak}` : "今天待打卡";
}
function getProgressColor(percentage: number): string {
  if (percentage >= 100) {
    return "#f59e0b";
  }
  if (percentage >= 66) {
    return "#16a34a";
  }
  if (percentage >= 33) {
    return "#f59e0b";
  }

  return "#ef4444";
}












































