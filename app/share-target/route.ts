import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const destination = new URL("/share", request.url);
  for (const field of ["title", "text", "url"] as const) {
    const value = formData.get(field);
    if (typeof value === "string" && value) destination.searchParams.set(field, value.slice(0, 4000));
  }
  if (formData.getAll("files").some((item) => item instanceof File && item.size > 0)) {
    destination.searchParams.set("filesLost", "1");
  }
  return NextResponse.redirect(destination, 303);
}
