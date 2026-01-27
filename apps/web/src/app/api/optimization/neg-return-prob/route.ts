import { NextRequest, NextResponse } from "next/server";
import { normalCDF } from "@/lib/math/stats";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { r_ann, vol_ann, months = 36 } = body;

    if (typeof r_ann !== "number") {
      return NextResponse.json({ error: "r_ann is required" }, { status: 400 });
    }

    if (typeof vol_ann !== "number") {
      return NextResponse.json({ error: "vol_ann is required" }, { status: 400 });
    }

    const probabilities: number[] = [];

    for (let m = 1; m <= months; m++) {
      const timeInYears = m / 12;
      const meanT = r_ann * timeInYears;
      const volT = vol_ann * Math.sqrt(timeInYears);
      const zScore = -meanT / volT;
      const prob = normalCDF(zScore);
      probabilities.push(prob);
    }

    return NextResponse.json({
      months: Array.from({ length: months }, (_, i) => i + 1),
      probabilities,
    });
  } catch (error) {
    console.error("Neg return prob error:", error);
    return NextResponse.json({ error: "Calculation failed" }, { status: 500 });
  }
}
