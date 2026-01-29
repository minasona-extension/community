// build.js
import { execSync } from "child_process";
import { copyFileSync, mkdirSync, existsSync, rmSync, readdirSync, lstatSync, copyFile } from "fs";
import { join } from "path";

const target = process.argv[2]; // "chrome" or "firefox"
if (!["chrome", "firefox"].includes(target)) {
  console.error("Usage: node build.js <chrome|firefox>");
  process.exit(1);
}

const distDir = "dist";

// Clean dist folder
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(distDir);

// Run Vite builds
["vite.content.config.ts", "vite.background.config.ts", "vite.popup.config.ts", "vite.popupMinawan.config.ts"].forEach((config) => {
  console.log(`Building with config ${config}...`);
  execSync(`npx vite build --config ${config}`, { stdio: "inherit" });
});

// Helper to copy folders recursively
function copyFolder(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  readdirSync(src).forEach((item) => {
    const srcPath = join(src, item);
    const destPath = join(dest, item);
    if (lstatSync(srcPath).isDirectory()) {
      copyFolder(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  });
}

// Copy files
copyFileSync("src/style.css", join(distDir, "style.css"));
copyFileSync("popup.html", join(distDir, "popup.html"));
copyFolder("assets", join(distDir, "assets"));

// Copy manifest depending on target
const manifestSource = target === "chrome" ? "manifest.json" : "manifestFirefox.json";
copyFileSync(manifestSource, join(distDir, "manifest.json"));

console.log(`Build complete for ${target}!`);
