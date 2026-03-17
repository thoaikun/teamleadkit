import { Box, Text } from "@chakra-ui/react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as ReTooltip,
    Cell,
    ResponsiveContainer,
} from "recharts";
import { Chart, useChart } from "@chakra-ui/charts";
import { formatMinutes } from "@/components/work/work-utils";

export interface MemberDualBarChartDataItem {
    name: string;
    fullName: string;
    hours: number;
    tasks: number;
    rawMinutes: number;
    color: string;
}

export interface MemberDualBarChartProps {
    title?: string;
    data: MemberDualBarChartDataItem[];
    leftLabel?: string;
    rightLabel?: string;
    tooltipTimeSuffix?: string;
    onBarClick?: (item: MemberDualBarChartDataItem) => void;
    width?: number | string;
    height?: number | string;
}

/** Derive a slightly lighter shade (e.g. teal.400 -> teal.300) */
const toLighterShade = (color: string): string =>
    color.replace(/\.(\d+)$/, (_, n) => {
        const num = parseInt(n, 10);
        if (num <= 50) return `.${num}`;
        return `.${Math.max(50, num - 100)}`;
    });

/** Derive a slightly darker shade (e.g. teal.400 -> teal.500) */
const toDarkerShade = (color: string): string =>
    color.replace(/\.(\d+)$/, (_, n) => {
        const num = parseInt(n, 10);
        if (num >= 900) return `.${num}`;
        return `.${Math.min(900, num + 100)}`;
    });

export const MemberDualBarChart = ({
    title,
    data,
    leftLabel = "Hours",
    rightLabel = "Tasks",
    tooltipTimeSuffix = "",
    onBarClick,
    width = "100%",
    height = "100%",
}: MemberDualBarChartProps) => {
    const chart = useChart({
        data,
        series: [
            { name: "hours" as const, color: "teal.300" },
            { name: "tasks" as const, color: "teal.500" },
        ],
    });

    const renderTooltipContent = (payload: unknown) => {
        const items = Array.isArray(payload) ? payload : [];
        const d = items[0]?.payload as MemberDualBarChartDataItem | undefined;
        if (!d) return null;
        return (
            <Box
                bg="bg.panel"
                borderWidth="1px"
                borderColor="border.default"
                borderRadius="md"
                px={3}
                py={2}
                shadow="md"
            >
                <Text fontSize="xs" fontWeight="bold">
                    {d.fullName}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                    {formatMinutes(d.rawMinutes)} {tooltipTimeSuffix} · {d.tasks} task{d.tasks !== 1 ? "s" : ""}
                </Text>
            </Box>
        );
    };

    const handleBarClick = onBarClick
        ? (ev: unknown) => {
              const e = ev as { payload?: MemberDualBarChartDataItem };
              const item = e?.payload;
              if (item) onBarClick(item);
          }
        : undefined;

    return (
        <Box flex={1} width={width} height={height} display="flex" flexDirection="column" minH={0}>
            {title && (
                <Text fontSize="sm" fontWeight="semibold" mb={2} flexShrink={0}>
                    {title}
                </Text>
            )}
            <Box flex={1} minH={0}>
                <Chart.Root chart={chart}>
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 5, right: 55, bottom: 5, left: 5 }}
                        barCategoryGap="20%"
                        barGap={4}
                    >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis
                            yAxisId="left"
                            fontSize={11}
                            allowDecimals={true}
                            label={{ value: leftLabel, angle: -90, position: "insideLeft", fontSize: 10 }}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            fontSize={11}
                            allowDecimals={false}
                            label={{ value: rightLabel, angle: 90, position: "insideRight", fontSize: 10 }}
                        />
                        <ReTooltip
                            cursor={{ fill: "transparent" }}
                            content={({ payload }) => renderTooltipContent(payload)}
                        />
                        <Bar
                            dataKey="hours"
                            name={leftLabel}
                            yAxisId="left"
                            radius={[4, 4, 0, 0]}
                            cursor={onBarClick ? "pointer" : undefined}
                            onClick={handleBarClick}
                        >
                            {data.map((entry) => (
                                <Cell
                                    key={`${entry.fullName}-hours`}
                                    fill={chart.color(toLighterShade(entry.color))}
                                />
                            ))}
                        </Bar>
                        <Bar
                            dataKey="tasks"
                            name={rightLabel}
                            yAxisId="right"
                            radius={[4, 4, 0, 0]}
                            cursor={onBarClick ? "pointer" : undefined}
                            onClick={handleBarClick}
                        >
                            {data.map((entry) => (
                                <Cell
                                    key={`${entry.fullName}-tasks`}
                                    fill={chart.color(toDarkerShade(entry.color))}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </Chart.Root>
                </Box>
        </Box>
    );
};
