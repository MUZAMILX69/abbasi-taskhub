import sharp from "sharp";
import fs from "node:fs";
const svg = fs.readFileSync("public/logo.svg");
await sharp(svg).resize(192, 192).png().toFile("public/logo-192.png");
await sharp(svg).resize(512, 512).png().toFile("public/logo-512.png");
console.log("✅ icons created");