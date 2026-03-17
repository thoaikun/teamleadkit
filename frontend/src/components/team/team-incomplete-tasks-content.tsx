import { Box, VStack, HStack, Text, Spinner, IconButton, ButtonGroup, Button } from "@chakra-ui/react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useChart } from "@chakra-ui/charts";
import { FaSyncAlt } from "react-icons/fa";
import { HiOutlineExclamationTriangle } from "react-icons/hi2";
import { Tooltip } from "@/components/ui/tooltip";
import {
    MemberDualBarChart,
    MemberSingleBarChart,
    MemberBarChartModeSelector,
    type MemberDualBarChartDataItem,
    type MemberSingleBarChartDataItem,
} from "./member-bar-charts";
import { DonutChart } from "@/components/ui/donut-chart";
import { formatMinutes, ACCENT_COLOR } from "@/components/work/work-utils";
import { SummaryCard } from "@/components/ui/summary-card";
import { useColorModeValue } from "@/components/ui/color-mode";
import { useTeamContext } from "@/context/team-ctx";
import { TeamMemberTaskList } from "./team-member-task-list";
import type { MemberWorkload } from "./team-types";
import { MEMBER_COLORS, memberTaskCount, memberTimeSpentMn, memberTimeLeftMn } from "./team-types";
import { getModulePieData } from "./team-utils";
import { BASE_URL } from "@/App";

export type IncompleteViewMode = "work_queue" | "emergency_stream";

interface TeamIncompleteTasksContentProps {
    workload: MemberWorkload[];
    loading: boolean;
    onRefresh: () => void;
}

export const TeamIncompleteTasksContent = ({
    workload,
    loading,
    onRefresh,
}: TeamIncompleteTasksContentProps) => {
    const { selectedMember, setSelectedMember, chartMode } = useTeamContext();
    const accentColor = useColorModeValue(ACCENT_COLOR.light, ACCENT_COLOR.dark);

    const [viewMode, setViewMode] = useState<IncompleteViewMode>("work_queue");
    const [emergencyWorkload, setEmergencyWorkload] = useState<MemberWorkload[] | null>(null);
    const [emergencyLoading, setEmergencyLoading] = useState(false);

    const fetchEmergencyWorkload = useCallback(async () => {
        setEmergencyLoading(true);
        try {
            const res = await fetch(`${BASE_URL}/api/work/team/emergency`);
            if (res.ok) {
                const results = await res.json();
                setEmergencyWorkload(results);
            } else {
                setEmergencyWorkload([]);
            }
        } catch (err) {
            console.error("Failed to fetch emergency workload:", err);
            setEmergencyWorkload([]);
        } finally {
            setEmergencyLoading(false);
        }
    }, []);

    useEffect(() => {
        if (viewMode === "emergency_stream") {
            fetchEmergencyWorkload();
        }
    }, [viewMode, fetchEmergencyWorkload]);

    const displayWorkload = viewMode === "emergency_stream" ? emergencyWorkload ?? [] : workload;
    const displayLoading = viewMode === "emergency_stream" ? emergencyLoading : loading;

    const selectedMemberData = useMemo(
        () => (selectedMember ? displayWorkload.find((m) => m.name === selectedMember) ?? null : null),
        [selectedMember, displayWorkload]
    );

    const modulePieData = useMemo(
        () => getModulePieData(selectedMemberData?.tasks ?? []),
        [selectedMemberData]
    );

    const moduleChart = useChart({
        data: modulePieData,
        series: modulePieData.map((d) => ({ name: "value" as const, color: d.color })),
    });

    const selectedMemberColor = useMemo(() => {
        if (!selectedMemberData) return null;
        const idx = displayWorkload.findIndex((m) => m.name === selectedMemberData.name);
        return idx >= 0 ? MEMBER_COLORS[idx % MEMBER_COLORS.length] : null;
    }, [selectedMemberData, displayWorkload]);

    const selectedMemberBg = useColorModeValue(
        selectedMemberColor ? selectedMemberColor.replace(/\.\d+$/, ".100") : "gray.100",
        selectedMemberColor ? selectedMemberColor.replace(/\.\d+$/, ".800") : "gray.800"
    );

    const chartData = useMemo(
        () =>
            displayWorkload.map((m, i) => ({
                name: m.name.split(" ")[0],
                fullName: m.name,
                hours: Math.round((memberTimeLeftMn(m) / 60) * 10) / 10,
                tasks: memberTaskCount(m),
                rawMinutes: memberTimeLeftMn(m),
                color: MEMBER_COLORS[i % MEMBER_COLORS.length],
            })),
        [displayWorkload]
    );

    const chartDataHours = useMemo(
        () =>
            chartData.map(({ name, fullName, hours, rawMinutes, color }) => ({
                name,
                fullName,
                value: hours,
                rawMinutes,
                color,
            })),
        [chartData]
    );

    const chartDataTasks = useMemo(
        () =>
            chartData.map(({ name, fullName, tasks, color }) => ({
                name,
                fullName,
                value: tasks,
                color,
            })),
        [chartData]
    );

    const handleBarClick = (item: MemberDualBarChartDataItem | MemberSingleBarChartDataItem) => {
        setSelectedMember(selectedMember === item.fullName ? null : item.fullName);
    };

    if (displayLoading && displayWorkload.length === 0) {
        return (
            <Box flex={1} display="flex" alignItems="center" justifyContent="center">
                <VStack gap={2}>
                    <Spinner size="lg" />
                    <Text fontSize="sm" color="fg.muted">
                        {viewMode === "emergency_stream"
                            ? "Loading emergency streams..."
                            : "Loading team workload..."}
                    </Text>
                </VStack>
            </Box>
        );
    }

    const totalTasks = displayWorkload.reduce((s, m) => s + memberTaskCount(m), 0);
    const totalRemaining = displayWorkload.reduce((s, m) => s + memberTimeLeftMn(m), 0);
    const totalSpent = displayWorkload.reduce((s, m) => s + memberTimeSpentMn(m), 0);

    return (
        <Box flex={1} minH={0} overflowY="auto" px={6} py={4}>
            <VStack gap={6} align="stretch">
                {/* Header */}
                <HStack gap={3} justify="space-between" wrap="wrap">
                    <HStack gap={3} wrap="wrap">
                        <ButtonGroup size="sm" variant="outline">
                            <Button
                                aria-label="Work Queue"
                                variant={viewMode === "work_queue" ? "solid" : "outline"}
                                onClick={() => setViewMode("work_queue")}
                            >
                                Work Queue
                            </Button>
                            <Tooltip content="Incomplete tasks in each assignee's Emergency stream">
                                <Button
                                    aria-label="Emergency Stream"
                                    variant={viewMode === "emergency_stream" ? "solid" : "outline"}
                                    onClick={() => setViewMode("emergency_stream")}
                                >
                                    <HStack gap={1}>
                                        <HiOutlineExclamationTriangle />
                                        <Text as="span">Emergency Stream</Text>
                                    </HStack>
                                </Button>
                            </Tooltip>
                        </ButtonGroup>
                        <MemberBarChartModeSelector />
                    </HStack>
                    <Tooltip content={viewMode === "emergency_stream" ? "Refresh emergency data" : "Refresh from Orange Logic"}>
                        <IconButton
                            aria-label="Refresh"
                            variant="ghost"
                            size="xs"
                            onClick={viewMode === "emergency_stream" ? fetchEmergencyWorkload : onRefresh}
                            disabled={viewMode === "emergency_stream" ? emergencyLoading : loading}
                        >
                            {(viewMode === "emergency_stream" ? emergencyLoading : loading) ? (
                                <Spinner size="xs" />
                            ) : (
                                <FaSyncAlt />
                            )}
                        </IconButton>
                    </Tooltip>
                </HStack>

                {/* Summary cards */}
                <HStack gap={4} wrap="wrap">
                    <SummaryCard
                        label="Members"
                        value={
                            viewMode === "emergency_stream"
                                ? `${displayWorkload.filter((m) => memberTaskCount(m) > 0).length}/${displayWorkload.length}`
                                : String(displayWorkload.length)
                        }
                    />
                    <SummaryCard label="Tasks" value={String(totalTasks)} />
                    <SummaryCard label="Time spent" value={formatMinutes(totalSpent)} color={accentColor} />
                    <SummaryCard label="Time remaining" value={formatMinutes(totalRemaining)} />
                </HStack>

                {/* Chart */}
                {chartMode === "dual" ? (
                    <MemberDualBarChart
                        title="Remaining Workload"
                        data={chartData}
                        leftLabel="Hours"
                        rightLabel="Tasks"
                        tooltipTimeSuffix="remaining"
                        onBarClick={handleBarClick}
                        width={800}
                    />
                ) : (
                    <HStack gap={6} align="start">
                        <MemberSingleBarChart
                            title="Time Remaining (hours)"
                            data={chartDataHours}
                            tooltipFormat="time"
                            tooltipSuffix="remaining"
                            onBarClick={handleBarClick}
                        />
                        <MemberSingleBarChart
                            title="Remaining Tasks"
                            data={chartDataTasks}
                            tooltipFormat="tasks"
                            allowDecimals={false}
                            onBarClick={handleBarClick}
                        />
                    </HStack>
                )}

                {/* Task list and module breakdown for selected member */}
                {selectedMemberData && (
                    <HStack align="start" gap={6} wrap="wrap">
                        {modulePieData.length > 0 && (
                            <VStack gap={2} align="center">
                                <Text fontSize="sm" fontWeight="semibold" color="fg.muted">
                                    Module distribution
                                </Text>
                                <DonutChart
                                    data={modulePieData}
                                    chartHook={moduleChart}
                                    total={selectedMemberData.tasks.length}
                                    centerLabel={String(selectedMemberData.tasks.length)}
                                    centerSublabel="tasks"
                                    size={200}
                                    innerRadius={50}
                                    outerRadius={80}
                                />
                            </VStack>
                        )}
                        <Box flex={1} minW="280px">
                            <TeamMemberTaskList
                                memberData={selectedMemberData}
                                headerBg={selectedMemberBg}
                                onClose={() => setSelectedMember(null)}
                            />
                        </Box>
                    </HStack>
                )}
            </VStack>
        </Box>
    );
};
