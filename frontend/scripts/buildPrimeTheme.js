const fs = require("fs");
const path = require("path");

const SOURCE = path.join(
  __dirname,
  "../node_modules/primereact/resources/themes/lara-light-blue/theme.css"
);
const OUTPUT = path.join(__dirname, "../src/styles/dagatscan-theme.css");

// Tailwind blue (what lara-light-blue hardcodes) -> DagatScan brand palette.
const PALETTE_MAP = {
  "#eff6ff": "#f2f9fc",
  "#dbeafe": "#e2f1f8",
  "#bfdbfe": "#c7e5f3",
  "#93c5fd": "#8ccce8",
  "#60a5fa": "#3ba6d9",
  "#3b82f6": "#0077b6",
  "#2563eb": "#006aa3",
  "#1d4ed8": "#005fa3",
  "#1e40af": "#004a72",
  "#1e3a8a": "#003d5e",
  "#172554": "#002639",
};

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`PrimeReact theme not found at ${SOURCE}. Run npm install first.`);
    process.exit(1);
  }

  let css = fs.readFileSync(SOURCE, "utf8");
  let replaced = 0;
  for (const [from, to] of Object.entries(PALETTE_MAP)) {
    const pattern = new RegExp(from.replace("#", "#"), "gi");
    css = css.replace(pattern, () => {
      replaced += 1;
      return to;
    });
  }

  const header =
    "/* DagatScan Bataan theme for PrimeReact.\n" +
    "   Generated from primereact lara-light-blue by remapping the Tailwind blue\n" +
    "   palette to the DagatScan brand palette (primary #0077B6).\n" +
    "   Regenerate with: node scripts/buildPrimeTheme.js */\n";

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, header + css);
  console.log(`Wrote ${OUTPUT} (${replaced} colour values remapped).`);
}

main();
