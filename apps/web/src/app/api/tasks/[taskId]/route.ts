import { NextRequest, NextResponse } from "next/server";

// Simplified task status endpoint
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  return NextResponse.json({
    id: taskId,
    task_type: "yahoo_update",
    status: "completed",
    progress: 100,
    result_data: null,
    error_message: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
}
