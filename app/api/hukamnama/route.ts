import { getHukamnama } from "@/app/api/hukamnama/actions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getHukamnama();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Hukamnama" },
      { status: 500 }
    );
  }
}
