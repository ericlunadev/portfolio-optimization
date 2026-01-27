import { NextResponse } from "next/server";

// Simplified task endpoint - in production this would use a database
export async function POST() {
  // Generate a mock task ID
  const taskId = crypto.randomUUID();

  return NextResponse.json({
    task_id: taskId,
    status: "completed",
    message: "Data is fetched directly from Yahoo Finance on each request",
  });
}
