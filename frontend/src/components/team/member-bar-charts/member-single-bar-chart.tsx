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

export interface MemberSingleBarChartDataItem {
    name: string;
    fullName: string;
    value: number;
    color: string;
    rawMinutes?: number;
}

export type MemberSingleBarChartTooltipFormat = "time" | "tasks";

export interface MemberSingleBarChartProps {
    title: string;
    data: MemberSingleBarChartDataItem[];
    tooltipFormat: MemberSingleBarChartTooltipFormat;
    tooltipSuffix?: string;
    allowDecimals?: boolean;
    onBarClick?: (item: MemberSingleBarChartDataItem) => void;
    height?: number;
}

export const MemberSingleBarChart = ({
    title,
    data,
    tooltipFormat,
    tooltipSuffix = "",
    allowDecimals = true,
    onBarClick,
    height = 500,
}: MemberSingleBarChartProps) => {
    const chart = useChart({
        data,
        series: [{ name: "value" as const, color: "teal.400" }],
    });

    const renderTooltipContent = (payload: unknown) => {
        const items = Array.isArray(payload) ? payload : [];
        const d = items[0]?.payload as MemberSingleBarChartDataItem | undefined;
        if (!d) return null;
        const valueText =
            tooltipFormat === "time"
                ? `${formatMinutes(d.rawMinutes ?? 0)} ${tooltipSuffix}`.trim()
                : `${d.value} task${d.value !== 1 ? "s" : ""}`;
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
                    {valueText}
                </Text>
            </Box>
        );
    };

    const handleBarClick = onBarClick
        ? (ev: unknown) => {
              const e = ev as { payload?: MemberSingleBarChartDataItem };
              const item = e?.payload;
              if (item) onBarClick(item);
          }
        : undefined;

    return (
        <Box flex={1}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>
                {title}
            </Text>
            <Chart.Root chart={chart}>
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis fontSize={11} allowDecimals={allowDecimals} />
                        <ReTooltip
                            cursor={{ fill: "transparent" }}
                            content={({ payload }) => renderTooltipContent(payload)}
                        />
                        <Bar
                            dataKey="value"
                            radius={[4, 4, 0, 0]}
                            cursor={onBarClick ? "pointer" : undefined}
                            onClick={handleBarClick}
                        >
                            {data.map((entry) => (
                                <Cell key={entry.fullName} fill={chart.color(entry.color)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </Chart.Root>
        </Box>
    );
};
