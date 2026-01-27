import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { backgroundTasks } from "../../db/schema.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.js";
import { startYahooUpdate } from "./yahoo-updater.js";

const tasks = new Hono();

// In-memory store for WebSocket connections
const taskConnections = new Map<string, Set<WebSocket>>();

// POST /api/tasks/yahoo-update - Start Yahoo Finance data update task
tasks.post("/yahoo-update", optionalAuthMiddleware, async (c) => {
  const user = c.get("optionalUser");

  const taskId = crypto.randomUUID();

  // Create task record
  await db.insert(backgroundTasks).values({
    id: taskId,
    userId: user?.id ?? null,
    taskType: "yahoo_update",
    status: "pending",
    progress: 0,
  });

  // Start the update in background
  startYahooUpdate(taskId, (progress, message) => {
    // Update task progress in DB
    db.update(backgroundTasks)
      .set({ progress, status: "running" })
      .where(eq(backgroundTasks.id, taskId))
      .run();

    // Notify WebSocket clients
    const connections = taskConnections.get(taskId);
    if (connections) {
      const payload = JSON.stringify({ progress, message });
      for (const ws of connections) {
        try {
          ws.send(payload);
        } catch {
          connections.delete(ws);
        }
      }
    }
  });

  return c.json({ task_id: taskId });
});

// GET /api/tasks/:taskId - Get task status
tasks.get("/:taskId", zValidator("param", z.object({ taskId: z.string().uuid() })), async (c) => {
  const { taskId } = c.req.valid("param");

  const task = await db.query.backgroundTasks.findFirst({
    where: eq(backgroundTasks.id, taskId),
  });

  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  return c.json({
    id: task.id,
    task_type: task.taskType,
    status: task.status,
    progress: task.progress,
    result_data: task.resultData ? JSON.parse(task.resultData) : null,
    error_message: task.errorMessage,
    created_at: task.createdAt,
    started_at: task.startedAt,
    completed_at: task.completedAt,
  });
});

// DELETE /api/tasks/:taskId - Cancel a running task
tasks.delete(
  "/:taskId",
  authMiddleware,
  zValidator("param", z.object({ taskId: z.string().uuid() })),
  async (c) => {
    const { taskId } = c.req.valid("param");

    const task = await db.query.backgroundTasks.findFirst({
      where: eq(backgroundTasks.id, taskId),
    });

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.status === "completed" || task.status === "failed") {
      return c.json({ error: "Task already finished" }, 400);
    }

    await db
      .update(backgroundTasks)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(eq(backgroundTasks.id, taskId));

    return c.json({ message: "Task cancelled" });
  }
);

// Export for WebSocket setup
export { taskConnections };
export default tasks;
