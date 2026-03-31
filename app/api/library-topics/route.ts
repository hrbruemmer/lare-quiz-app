import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const libraryPath = path.join(process.cwd(), "library");
    console.log("Looking for library at:", libraryPath);

    if (!fs.existsSync(libraryPath)) {
      return Response.json({ topics: [] });
    }

    const topics = fs
      .readdirSync(libraryPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    return Response.json({ topics });
  } catch (error) {
    console.error("library-topics route error:", error);
    return Response.json(
      { error: "Could not read library folders." },
      { status: 500 }
    );
  }
}