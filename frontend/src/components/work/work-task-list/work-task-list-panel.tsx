import {
    Box,
    VStack,
    HStack,
    Text,
    Input,
    IconButton,
    Spinner,
} from "@chakra-ui/react";
import { useState } from "react";
import { FaPlus, FaCloudDownloadAlt } from "react-icons/fa";
import { Tooltip } from "@/components/ui/tooltip";
import { useWorkContext } from "@/context/work-ctx";
import { WorkTaskListItem } from "./work-task-list-item";

export const WorkTaskListPanel = () => {
    const { monitoredTasks, selectedRootTask, addTask, isAdding } = useWorkContext();
    const selectedTaskId = selectedRootTask?.identifier ?? null;
    const [input, setInput] = useState("");

    const handleAdd = async (forceRefresh: boolean) => {
        const value = input.trim();
        if (!value) return;
        await addTask(value, forceRefresh);
        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleAdd(false);
        }
    };

    return (
        <Box h="100%" display="flex" flexDirection="column" borderRightWidth="1px" borderColor="border.default">
            {/* Add task input */}
            <Box p={3} borderBottomWidth="1px" borderColor="border.default">
                <HStack gap={2}>
                    <Input
                        placeholder="Add task ID"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        size="sm"
                    />
                    <Tooltip content="Add task">
                        <IconButton
                            aria-label="Add task"
                            size="sm"
                            onClick={() => handleAdd(false)}
                            disabled={!input.trim() || isAdding}
                        >
                            {isAdding ? <Spinner size="xs" /> : <FaPlus />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip content="Add task (fetch latest from OrangeLogic)">
                        <IconButton
                            aria-label="Add task with fresh data"
                            size="sm"
                            variant="outline"
                            onClick={() => handleAdd(true)}
                            disabled={!input.trim() || isAdding}
                        >
                            {isAdding ? <Spinner size="xs" /> : <FaCloudDownloadAlt />}
                        </IconButton>
                    </Tooltip>
                </HStack>
            </Box>

            {/* Task list */}
            <Box flex={1} overflowY="auto">
                {monitoredTasks.length === 0 ? (
                    <Box p={4} textAlign="center">
                        <Text color="fg.muted" fontSize="sm">
                            No tasks added yet.
                        </Text>
                    </Box>
                ) : (
                    <VStack gap={0} align="stretch">
                        {monitoredTasks.map((task) => (
                            <WorkTaskListItem
                                key={task.identifier}
                                task={task}
                                isSelected={selectedTaskId === task.identifier}
                            />
                        ))}
                    </VStack>
                )}
            </Box>
        </Box>
    );
};
