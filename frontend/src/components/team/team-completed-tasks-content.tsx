import { Box, VStack, HStack, Text, Spinner, IconButton, Button } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChart } from "@chakra-ui/charts";
import { FaSyncAlt } from "react-icons/fa";
import { Tooltip } from "@/components/ui/tooltip";
import { DateRangeSelector, formatDateForInput } from "@/components/ui/date-range-selector";
import {
    MemberSingleBarChart,
    MemberDualBarChart,
    MemberBarChartModeSelector,
    CompletedTasksTimelineChart,
    CompletedTasksGitView,
} from "./member-bar-charts";
import { useTeamContext } from "@/context/team-ctx";
import { TeamMemberTaskList } from "./team-member-task-list";
import { DonutChart } from "@/components/ui/donut-chart";
import { formatMinutes, ACCENT_COLOR } from "@/components/work/work-utils";
import { SummaryCard } from "@/components/ui/summary-card";
import { useColorModeValue } from "@/components/ui/color-mode";
import { BASE_URL } from "@/App";
import type { MemberWorkload } from "./team-types";
import { MEMBER_COLORS, memberTaskCount, memberTimeSpentMn } from "./team-types";
import { getModulePieData } from "./team-utils";
import { toaster } from "../ui/toaster";

interface TeamCompletedTasksContentProps {
    selectedTypes: Set<string>;
}

export const TeamCompletedTasksContent = ({ selectedTypes }: TeamCompletedTasksContentProps) => {
    const { selectedMember, setSelectedMember, chartMode } = useTeamContext();
    const accentColor = useColorModeValue(ACCENT_COLOR.light, ACCENT_COLOR.dark);
    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setMonth(defaultStart.getMonth() - 1);

    const [startDate, setStartDate] = useState(formatDateForInput(defaultStart));
    const [endDate, setEndDate] = useState(formatDateForInput(today));
    const [workload, setWorkload] = useState<MemberWorkload[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchCompletedWorkload = useCallback(
        async (refresh = false, overrideStart?: string, overrideEnd?: string) => {
            const start = overrideStart ?? startDate;
            const end = overrideEnd ?? endDate;
            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.set("start_date", start);
                params.set("end_date", end);
                for (const t of selectedTypes) params.append("subtypes", t.toLowerCase());
                if (refresh) params.set("force_refresh", "true");
                const res = await fetch(`${BASE_URL}/api/work/team/completed-workload?${params}`);
                if (res.ok) setWorkload(await res.json());
            } catch (err) {
                toaster.create({ description: "Failed to fetch completed workload", type: "error" });
            } finally {
                setLoading(false);
            }
        },
        [startDate, endDate, selectedTypes]
    );

    const handlePresetSelect = useCallback(
        (start: string, end: string) => {
            fetchCompletedWorkload(false, start, end);
        },
        [fetchCompletedWorkload]
    );

    const handleSearch = useCallback(() => {
        if (startDate && endDate) fetchCompletedWorkload(false);
    }, [startDate, endDate, fetchCompletedWorkload]);

    const handleRefresh = useCallback(() => {
        fetchCompletedWorkload(true);
    }, [fetchCompletedWorkload]);

    // Fetch when types change
    useEffect(() => {
        if (startDate && endDate) fetchCompletedWorkload(false);
    }, [selectedTypes]);

    const chartData = useMemo(
        () =>
            workload.map((m, i) => ({
                name: m.name.split(" ")[0],
                fullName: m.name,
                hours: Math.round((memberTimeSpentMn(m) / 60) * 10) / 10,
                tasks: memberTaskCount(m),
                rawMinutes: memberTimeSpentMn(m),
                color: MEMBER_COLORS[i % MEMBER_COLORS.length],
            })),
        [workload]
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

    const chartDataTaskCount = useMemo(
        () =>
            chartData.map(({ name, fullName, tasks, color }) => ({
                name,
                fullName,
                value: tasks,
                color,
            })),
        [chartData]
    );

    const selectedMemberData = useMemo(
        () => (selectedMember ? workload.find((m) => m.name === selectedMember) : null),
        [selectedMember, workload]
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
        const idx = workload.findIndex((m) => m.name === selectedMemberData.name);
        return idx >= 0 ? MEMBER_COLORS[idx % MEMBER_COLORS.length] : null;
    }, [selectedMemberData, workload]);

    const selectedMemberBg = useColorModeValue(
        selectedMemberColor ? selectedMemberColor.replace(/\.\d+$/, ".100") : "gray.100",
        selectedMemberColor ? selectedMemberColor.replace(/\.\d+$/, ".800") : "gray.800"
    );

    const handleMemberClick = useCallback(
        (memberName: string) => {
            setSelectedMember(selectedMember === memberName ? null : memberName);
        },
        [selectedMember, setSelectedMember]
    );

    return (
        <Box flex={1} minH={0} overflowY="auto" px={6} py={4}>
            <VStack gap={6} align="stretch">
                {/* Header */}
                <HStack gap={3} justify="space-between" wrap="wrap">
                    <HStack gap={3}>
                        <Text fontWeight="bold" fontSize="xl">
                            Completed Tasks
                        </Text>
                        <MemberBarChartModeSelector enableTimeline={true} enableGit={true} />
                    </HStack>
                    <Tooltip content="Refresh from Orange Logic">
                        <IconButton
                            aria-label="Force refresh"
                            variant="ghost"
                            size="xs"
                            onClick={handleRefresh}
                            disabled={loading}
                        >
                            {loading ? <Spinner size="xs" /> : <FaSyncAlt />}
                        </IconButton>
                    </Tooltip>
                </HStack>

                <DateRangeSelector
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                    onPresetSelect={handlePresetSelect}
                >
                    <Button
                        colorPalette="blue"
                        onClick={handleSearch}
                        disabled={loading || !startDate || !endDate}
                    >
                        {loading ? <Spinner size="xs" /> : "Search"}
                    </Button>
                </DateRangeSelector>

                {/* Bar chart */}
                {loading ? (
                    <Box py={12} display="flex" alignItems="center" justifyContent="center">
                        <VStack gap={2}>
                            <Spinner size="lg" />
                            <Text fontSize="sm" color="fg.muted">
                                Loading completed tasks...
                            </Text>
                        </VStack>
                    </Box>
                ) : workload.length === 0 ? (
                    <Box
                        py={12}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        borderRadius="lg"
                        borderWidth="1px"
                        borderColor="border.default"
                        bg="bg.subtle"
                    >
                        <Text fontSize="sm" color="fg.muted">
                            Click Search to load completed tasks. Click Refresh to retrieve most updated data.
                        </Text>
                    </Box>
                ) : (
                    <>
                        <HStack gap={4} wrap="wrap">
                            <SummaryCard label="Members" value={String(workload.length)} />
                            <SummaryCard label="Tasks" value={String(workload.reduce((s, m) => s + memberTaskCount(m), 0))} />
                            <SummaryCard
                                label="Time spent"
                                value={formatMinutes(workload.reduce((s, m) => s + memberTimeSpentMn(m), 0))}
                                color={accentColor}
                            />
                        </HStack>
                        {chartMode === "git" ? (
                            <CompletedTasksGitView
                                workload={workload}
                                startDate={startDate}
                                endDate={endDate}
                            />
                        ) : chartMode === "timeline" ? (
                            <CompletedTasksTimelineChart
                                workload={workload}
                                startDate={startDate}
                                endDate={endDate}
                                width="800px"
                                onMemberClick={handleMemberClick}
                            />
                        ) : chartMode === "dual" ? (
                            <MemberDualBarChart
                                title="Completed Workload"
                                data={chartData}
                                leftLabel="Hours"
                                rightLabel="Tasks"
                                tooltipTimeSuffix="spent"
                                onBarClick={(item) => handleMemberClick(item.fullName)}
                                width={700}
                            />
                        ) : (
                            <HStack gap={6} align="start">
                                <MemberSingleBarChart
                                    title="Time Spent (hours)"
                                    data={chartDataHours}
                                    tooltipFormat="time"
                                    tooltipSuffix="spent"
                                    onBarClick={(item) => handleMemberClick(item.fullName)}
                                />
                                <MemberSingleBarChart
                                    title="Completed Tasks"
                                    data={chartDataTaskCount}
                                    tooltipFormat="tasks"
                                    allowDecimals={false}
                                    onBarClick={(item) => handleMemberClick(item.fullName)}
                                />
                            </HStack>
                        )}
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
                                        variant="completed"
                                    />
                                </Box>
                            </HStack>
                        )}
                    </>
                )}
            </VStack>
        </Box>
    );
};
